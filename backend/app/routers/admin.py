import shutil
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import UPLOAD_DIR
from ..database import get_db
from ..deps import require_admin
from ..services import auth, backup, vectorstore

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=schemas.PaginatedUsers)
def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(models_db.User).order_by(models_db.User.created_at.desc())
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return schemas.PaginatedUsers(items=items, total=total, limit=limit, offset=offset)


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.AdminCreateUserRequest,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    if db.query(models_db.User).filter_by(email=email).first():
        raise HTTPException(409, "Un compte existe deja avec cet email")

    user = models_db.User(
        email=email,
        password_hash=auth.hash_password(payload.password),
        display_name=payload.display_name.strip() or email.split("@")[0],
        role=payload.role,
        # An admin creating this account on the user's behalf already
        # vouches for the email address, same as an SSO login would.
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _active_admin_count(db: Session, exclude_user_id: str | None = None) -> int:
    q = db.query(models_db.User).filter(
        models_db.User.role == "admin", models_db.User.is_active.is_(True)
    )
    if exclude_user_id:
        q = q.filter(models_db.User.id != exclude_user_id)
    return q.count()


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    payload: schemas.AdminUpdateUserRequest,
    admin: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            400, "Utilisez un autre compte administrateur pour modifier le votre"
        )
    target = db.get(models_db.User, user_id)
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")

    demoting = payload.role == "user" and target.role == "admin"
    deactivating = payload.is_active is False and target.is_active
    if (demoting or deactivating) and _active_admin_count(db, exclude_user_id=user_id) == 0:
        raise HTTPException(
            400, "Impossible : ce serait le dernier compte administrateur actif"
        )

    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            # Disabling an account should also kill any session already
            # issued for it, not just block future logins.
            target.token_version += 1
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "Utilisez un autre compte administrateur pour supprimer le votre")
    target = db.get(models_db.User, user_id)
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    if target.role == "admin" and _active_admin_count(db, exclude_user_id=user_id) == 0:
        raise HTTPException(400, "Impossible de supprimer le dernier compte administrateur actif")

    owned_spaces = db.query(models_db.Space).filter_by(owner_id=target.id).all()
    for space in owned_spaces:
        space_id = space.id
        db.delete(space)
        db.commit()
        vectorstore.delete_space(space_id)
        backup.delete_all_snapshots(space_id)
        space_dir = UPLOAD_DIR / space_id
        if space_dir.exists():
            shutil.rmtree(space_dir, ignore_errors=True)

    db.query(models_db.SpaceMember).filter_by(user_id=target.id).delete()
    db.delete(target)
    db.commit()
    return {"ok": True}


@router.get("/spaces", response_model=schemas.PaginatedSpaces)
def list_all_spaces(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(models_db.Space).order_by(models_db.Space.created_at.desc())
    total = q.count()
    spaces = q.offset(offset).limit(limit).all()
    items = [
        schemas.SpaceOut(
            id=s.id,
            name=s.name,
            description=s.description or "",
            color=s.color or "#6366f1",
            owner_id=s.owner_id,
            my_role="admin_view",
            can_upload=False,
            created_at=s.created_at,
            document_count=len(s.documents),
            conversation_count=len(s.conversations),
        )
        for s in spaces
    ]
    return schemas.PaginatedSpaces(items=items, total=total, limit=limit, offset=offset)


@router.delete("/spaces/{space_id}")
def delete_space(
    space_id: str,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    db.delete(space)
    db.commit()
    vectorstore.delete_space(space_id)
    backup.delete_all_snapshots(space_id)
    space_dir = UPLOAD_DIR / space_id
    if space_dir.exists():
        shutil.rmtree(space_dir, ignore_errors=True)
    return {"ok": True}


@router.get("/spaces/{space_id}/snapshots", response_model=list[schemas.SpaceSnapshotOut])
def list_space_snapshots(
    space_id: str,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.get(models_db.Space, space_id):
        raise HTTPException(404, "Espace introuvable")
    return backup.list_snapshots(space_id)


@router.post("/spaces/{space_id}/snapshots", response_model=schemas.SpaceSnapshotOut)
def create_space_snapshot(
    space_id: str,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.get(models_db.Space, space_id):
        raise HTTPException(404, "Espace introuvable")
    snapshot_id = backup.create_snapshot(space_id, force=True)
    if not snapshot_id:
        raise HTTPException(500, "Echec de la creation du snapshot")
    snap = db.get(models_db.SpaceSnapshot, snapshot_id)
    return snap


@router.post("/spaces/{space_id}/snapshots/{snapshot_id}/restore")
def restore_space_snapshot(
    space_id: str,
    snapshot_id: str,
    _: models_db.User = Depends(require_admin),
):
    ok = backup.restore_snapshot(space_id, snapshot_id)
    if not ok:
        raise HTTPException(400, "Echec de la restauration du snapshot")
    return {"ok": True}


@router.get("/stats", response_model=schemas.AdminStatsOut)
def stats(_: models_db.User = Depends(require_admin), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=7)
    storage_bytes = db.query(func.coalesce(func.sum(models_db.Document.size_bytes), 0)).scalar()
    return schemas.AdminStatsOut(
        users=db.query(models_db.User).count(),
        spaces=db.query(models_db.Space).count(),
        documents=db.query(models_db.Document).count(),
        conversations=db.query(models_db.Conversation).count(),
        messages=db.query(models_db.Message).count(),
        storage_bytes=storage_bytes,
        newsletter_subscribers=db.query(models_db.NewsletterSubscriber)
        .filter_by(confirmed=True)
        .count(),
        new_users_7d=db.query(models_db.User).filter(models_db.User.created_at >= since).count(),
        new_spaces_7d=db.query(models_db.Space).filter(models_db.Space.created_at >= since).count(),
    )
