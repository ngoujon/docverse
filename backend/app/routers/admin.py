from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    _: models_db.User = Depends(require_admin), db: Session = Depends(get_db)
):
    return db.query(models_db.User).order_by(models_db.User.created_at.desc()).all()


@router.get("/spaces", response_model=list[schemas.SpaceOut])
def list_all_spaces(
    _: models_db.User = Depends(require_admin), db: Session = Depends(get_db)
):
    spaces = db.query(models_db.Space).order_by(models_db.Space.created_at.desc()).all()
    return [
        schemas.SpaceOut(
            id=s.id,
            name=s.name,
            description=s.description or "",
            color=s.color or "#6366f1",
            owner_id=s.owner_id,
            my_role="viewer",
            created_at=s.created_at,
            document_count=len(s.documents),
            conversation_count=len(s.conversations),
        )
        for s in spaces
    ]


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
