"""Admin dashboard API: accounts, spaces and their snapshots, instance
statistics, newsletter and service health. Every route requires an admin."""

from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import Pagination, pagination, require_admin
from ..services import accounts, auth, backup, llm_provider, mailer
from .newsletter import unsubscribe_url

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _get_or_404(db: Session, model, obj_id: str, detail: str):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(404, detail)
    return obj


# --- Health -----------------------------------------------------------------------


@router.get("/health")
async def admin_health():
    """Detailed health check, kept behind admin auth on purpose: naming the
    inference provider and models to an anonymous caller is free
    reconnaissance (the public /api/health only says "up")."""
    status = await llm_provider.health()
    return {
        "status": "ok",
        "llm_provider": "mistral",
        "llm_reachable": status["reachable"],
        "llm_error": status.get("reason"),
        "models_available": status.get("models_available", []),
        "chat_model": settings.mistral_chat_model,
        "vision_model": settings.mistral_vision_model,
        "embed_model": settings.mistral_embed_model,
        "hosting": f"{settings.hosting_provider} ({settings.hosting_country})",
    }


# --- Users ------------------------------------------------------------------------


@router.get("/users", response_model=schemas.Page[schemas.UserOut])
def list_users(page: Pagination = Depends(pagination), db: Session = Depends(get_db)):
    return page.apply(db.query(models.User).order_by(models.User.created_at.desc()))


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(payload: schemas.AdminCreateUserRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "Un compte existe deja avec cet email")

    user = models.User(
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


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    payload: schemas.AdminUpdateUserRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "Utilisez un autre compte administrateur pour modifier le votre")
    target = _get_or_404(db, models.User, user_id, "Utilisateur introuvable")

    demoting = payload.role == "user" and target.role == "admin"
    deactivating = payload.is_active is False and target.is_active
    if (demoting or deactivating) and accounts.other_active_admins(db, user_id) == 0:
        raise HTTPException(400, "Impossible : ce serait le dernier compte administrateur actif")

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
def delete_user(user_id: str, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(400, "Utilisez un autre compte administrateur pour supprimer le votre")
    target = _get_or_404(db, models.User, user_id, "Utilisateur introuvable")
    if target.role == "admin" and accounts.other_active_admins(db, user_id) == 0:
        raise HTTPException(400, "Impossible de supprimer le dernier compte administrateur actif")
    accounts.purge_user(db, target)
    return {"ok": True}


# --- Spaces and snapshots -----------------------------------------------------------


@router.get("/spaces", response_model=schemas.Page[schemas.SpaceOut])
def list_all_spaces(page: Pagination = Depends(pagination), db: Session = Depends(get_db)):
    result = page.apply(db.query(models.Space).order_by(models.Space.created_at.desc()))
    result["items"] = [schemas.SpaceOut.from_space(s, "admin_view") for s in result["items"]]
    return result


@router.delete("/spaces/{space_id}")
def delete_space(space_id: str, db: Session = Depends(get_db)):
    accounts.purge_space(db, _get_or_404(db, models.Space, space_id, "Espace introuvable"))
    return {"ok": True}


@router.get("/spaces/{space_id}/snapshots", response_model=list[schemas.SpaceSnapshotOut])
def list_space_snapshots(space_id: str, db: Session = Depends(get_db)):
    _get_or_404(db, models.Space, space_id, "Espace introuvable")
    return backup.list_snapshots(space_id)


@router.post("/spaces/{space_id}/snapshots", response_model=schemas.SpaceSnapshotOut)
def create_space_snapshot(space_id: str, db: Session = Depends(get_db)):
    _get_or_404(db, models.Space, space_id, "Espace introuvable")
    snapshot_id = backup.create_snapshot(space_id, force=True)
    if not snapshot_id:
        raise HTTPException(500, "Echec de la creation du snapshot")
    return db.get(models.SpaceSnapshot, snapshot_id)


@router.post("/spaces/{space_id}/snapshots/{snapshot_id}/restore")
def restore_space_snapshot(space_id: str, snapshot_id: str):
    if not backup.restore_snapshot(space_id, snapshot_id):
        raise HTTPException(400, "Echec de la restauration du snapshot")
    return {"ok": True}


# --- Statistics ---------------------------------------------------------------------


@router.get("/stats", response_model=schemas.AdminStatsOut)
def stats(db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=7)
    return schemas.AdminStatsOut(
        users=db.query(models.User).count(),
        spaces=db.query(models.Space).count(),
        documents=db.query(models.Document).count(),
        conversations=db.query(models.Conversation).count(),
        messages=db.query(models.Message).count(),
        storage_bytes=accounts.storage_bytes(db),
        newsletter_subscribers=db.query(models.NewsletterSubscriber).filter_by(confirmed=True).count(),
        new_users_7d=db.query(models.User).filter(models.User.created_at >= since).count(),
        new_spaces_7d=db.query(models.Space).filter(models.Space.created_at >= since).count(),
    )


# --- Newsletter -----------------------------------------------------------------------


@router.get("/newsletter", response_model=schemas.Page[schemas.NewsletterSubscriberOut])
def list_newsletter_subscribers(
    page: Pagination = Depends(pagination),
    confirmed: bool | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.NewsletterSubscriber)
    if confirmed is not None:
        query = query.filter(models.NewsletterSubscriber.confirmed.is_(confirmed))
    if q and q.strip():
        query = query.filter(models.NewsletterSubscriber.email.ilike(f"%{q.strip()}%"))
    return page.apply(query.order_by(models.NewsletterSubscriber.created_at.desc()))


@router.delete("/newsletter/{subscriber_id}")
def delete_newsletter_subscriber(subscriber_id: str, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, models.NewsletterSubscriber, subscriber_id, "Abonne introuvable"))
    db.commit()
    return {"ok": True}


@router.post("/newsletter/send", response_model=schemas.NewsletterCampaignResult)
def send_newsletter_campaign(
    payload: schemas.NewsletterCampaignRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    subscribers = db.query(models.NewsletterSubscriber).filter(models.NewsletterSubscriber.confirmed.is_(True)).all()
    for sub in subscribers:
        message = mailer.newsletter_campaign_email(payload.subject, payload.message, unsubscribe_url(sub.email))
        mailer.send_later(background_tasks, sub.email, message)
    return schemas.NewsletterCampaignResult(sent=len(subscribers))
