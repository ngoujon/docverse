"""Account and workspace lifecycle operations shared by several routers
(user self-service, owner actions and the admin dashboard), so each rule
lives in exactly one place."""

import shutil
from datetime import datetime

from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..config import UPLOAD_DIR, settings
from . import auth, backup, mailer, vectorstore

# Email verification links stay valid for two days.
_VERIFY_EMAIL_TTL_MINUTES = 60 * 48


def utc_today() -> str:
    """Current UTC date as YYYY-MM-DD - the key of the daily message quota."""
    return datetime.utcnow().date().isoformat()


def messages_today(user: models.User) -> int:
    """Questions asked today; the counter silently resets on a new day."""
    return user.messages_today if user.messages_day == utc_today() else 0


def storage_bytes(db: Session, space_ids: list[str] | None = None) -> int:
    """Total size of the uploaded documents, across `space_ids` or the whole
    instance when None."""
    query = db.query(func.coalesce(func.sum(models.Document.size_bytes), 0))
    if space_ids is not None:
        if not space_ids:
            return 0
        query = query.filter(models.Document.space_id.in_(space_ids))
    return query.scalar() or 0


def other_active_admins(db: Session, user_id: str) -> int:
    """Active admins other than `user_id` - the instance must never be left
    without one, whether through deletion, demotion or deactivation."""
    return (
        db.query(models.User)
        .filter(
            models.User.role == "admin",
            models.User.is_active.is_(True),
            models.User.id != user_id,
        )
        .count()
    )


def purge_space(db: Session, space: models.Space) -> None:
    """Deletes a space and everything stored outside the database for it:
    vector collection, snapshots and uploaded files. The SQL delete is
    committed first so a filesystem hiccup never leaves a half-visible
    space behind."""
    space_id = space.id
    db.delete(space)
    db.commit()
    vectorstore.delete_space(space_id)
    backup.delete_all_snapshots(space_id)
    shutil.rmtree(UPLOAD_DIR / space_id, ignore_errors=True)


def purge_user(db: Session, user: models.User) -> None:
    """Deletes an account, every space it owns and its memberships."""
    for space in db.query(models.Space).filter_by(owner_id=user.id).all():
        purge_space(db, space)
    db.query(models.SpaceMember).filter_by(user_id=user.id).delete()
    db.delete(user)
    db.commit()


def send_verification_email(background_tasks: BackgroundTasks, user: models.User) -> None:
    token = auth.issue_purpose_token(user.id, "email_verify", ttl_minutes=_VERIFY_EMAIL_TTL_MINUTES)
    url = f"{settings.frontend_base_url}/verify-email?token={token}"
    mailer.send_later(background_tasks, user.email, mailer.verify_email_email(url))
