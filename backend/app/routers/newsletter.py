"""Public newsletter flow: double opt-in subscription, confirmation and
one-click unsubscribe, all driven by signed single-purpose tokens."""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import client_ip
from ..services import auth, captcha, mailer, rate_limiter

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])

# Unsubscribe links must keep working in old emails, hence five years.
_UNSUBSCRIBE_TTL_MINUTES = 5 * 365 * 24 * 60
_CONFIRM_TTL_MINUTES = 60 * 24


def unsubscribe_url(email: str) -> str:
    """Link included in every newsletter email (confirmation and campaigns)."""
    token = auth.issue_purpose_token(email, "newsletter_unsubscribe", ttl_minutes=_UNSUBSCRIBE_TTL_MINUTES)
    return f"{settings.frontend_base_url}/newsletter/unsubscribe?token={token}"


@router.post("/subscribe")
def subscribe(
    payload: schemas.NewsletterSubscribeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Every accepted request sends a confirmation email to an address the
    # caller chose, so an unlimited endpoint would be a mail-bombing tool
    # pointed at third parties (and a fast route to getting our sending
    # domain blacklisted) - the captcha alone isn't enough.
    rate_limiter.enforce(
        rate_limiter.newsletter_limiter,
        client_ip(request),
        "Trop d'inscriptions depuis cette adresse, réessayez plus tard",
    )
    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Vérification anti-robot invalide ou expirée")

    email = payload.email.lower().strip()
    existing = db.query(models.NewsletterSubscriber).filter_by(email=email).first()
    if existing and existing.confirmed:
        return {"ok": True}
    if not existing:
        db.add(models.NewsletterSubscriber(email=email))
        db.commit()

    confirm_token = auth.issue_purpose_token(email, "newsletter_confirm", ttl_minutes=_CONFIRM_TTL_MINUTES)
    confirm_url = f"{settings.frontend_base_url}/newsletter/confirm?token={confirm_token}"
    mailer.send_later(background_tasks, email, mailer.newsletter_confirm_email(confirm_url, unsubscribe_url(email)))
    return {"ok": True}


@router.get("/confirm")
def confirm(token: str, db: Session = Depends(get_db)):
    email = auth.verify_purpose_token(token, "newsletter_confirm")
    if not email:
        raise HTTPException(400, "Lien de confirmation invalide ou expiré")
    sub = db.query(models.NewsletterSubscriber).filter_by(email=email).first()
    if not sub:
        raise HTTPException(404, "Inscription introuvable")
    sub.confirmed = True
    sub.confirmed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/unsubscribe")
def unsubscribe(token: str, db: Session = Depends(get_db)):
    email = auth.verify_purpose_token(token, "newsletter_unsubscribe")
    if not email:
        raise HTTPException(400, "Lien de désinscription invalide")
    db.query(models.NewsletterSubscriber).filter_by(email=email).delete()
    db.commit()
    return {"ok": True}
