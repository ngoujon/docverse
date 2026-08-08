import shutil

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import UPLOAD_DIR
from ..database import get_db
from ..deps import require_space_access, client_ip
from ..services import rate_limiter, space_auth, vectorstore

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


def _to_out(space: models_db.Space, access_token: str | None = None) -> schemas.SpaceOut:
    return schemas.SpaceOut(
        id=space.id,
        name=space.name,
        description=space.description or "",
        color=space.color or "#6366f1",
        has_password=bool(space.password_hash),
        created_at=space.created_at,
        document_count=len(space.documents),
        conversation_count=len(space.conversations),
        access_token=access_token,
    )


@router.get("", response_model=list[schemas.SpaceOut])
def list_spaces(db: Session = Depends(get_db)):
    spaces = db.query(models_db.Space).order_by(models_db.Space.created_at.desc()).all()
    return [_to_out(s) for s in spaces]


@router.post("", response_model=schemas.SpaceOut)
def create_space(payload: schemas.SpaceCreate, db: Session = Depends(get_db)):
    space = models_db.Space(
        name=payload.name.strip() or "Espace sans nom",
        description=payload.description,
        color=payload.color,
        password_hash=space_auth.hash_password(payload.password) if payload.password else None,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    # The creator just chose this password, so hand back a token right
    # away instead of making them unlock the space they just made.
    token = space_auth.issue_token(space.id) if space.password_hash else None
    return _to_out(space, access_token=token)


@router.get("/{space_id}", response_model=schemas.SpaceOut)
def get_space(space_id: str, db: Session = Depends(get_db)):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return _to_out(space)


@router.post("/{space_id}/unlock", response_model=schemas.SpaceUnlockResponse)
def unlock_space(
    space_id: str,
    payload: schemas.SpaceUnlockRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    if not space.password_hash:
        return schemas.SpaceUnlockResponse(access_token=space_auth.issue_token(space_id))

    limiter_key = f"unlock:{client_ip(request)}:{space_id}"
    if not rate_limiter.space_unlock_limiter.allow(limiter_key):
        raise HTTPException(429, "Trop de tentatives, reessayez dans quelques minutes")

    if not space_auth.verify_password(payload.password, space.password_hash):
        raise HTTPException(401, "Mot de passe incorrect")

    return schemas.SpaceUnlockResponse(access_token=space_auth.issue_token(space_id))


@router.patch("/{space_id}", response_model=schemas.SpaceOut)
def update_space(
    payload: schemas.SpaceUpdate,
    space: models_db.Space = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        space.name = payload.name
    if payload.description is not None:
        space.description = payload.description
    if payload.color is not None:
        space.color = payload.color
    if payload.password is not None:
        space.password_hash = (
            space_auth.hash_password(payload.password) if payload.password else None
        )
    db.commit()
    db.refresh(space)
    return _to_out(space)


@router.delete("/{space_id}")
def delete_space(
    space: models_db.Space = Depends(require_space_access), db: Session = Depends(get_db)
):
    space_id = space.id
    db.delete(space)
    db.commit()

    vectorstore.delete_space(space_id)
    space_upload_dir = UPLOAD_DIR / space_id
    if space_upload_dir.exists():
        shutil.rmtree(space_upload_dir, ignore_errors=True)

    return {"ok": True}
