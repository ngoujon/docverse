from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import settings
from ..database import get_db
from ..deps import client_ip
from ..services import auth, captcha, email_templates, mail_service, rate_limiter

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])

_UNSUBSCRIBE_TTL_MINUTES = 5 * 365 * 24 * 60


@router.post("/subscribe")
def subscribe(
    payload: schemas.NewsletterSubscribeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # The captcha alone was the only gate here. Every accepted request makes
    # us send a confirmation email to an address the caller chose, so an
    # unlimited endpoint is a mail-bombing tool pointed at third parties
    # (and a fast route to getting our sending domain blacklisted), on top
    # of filling the subscriber table with unconfirmed rows.
    rate_limiter.enforce(
        rate_limiter.newsletter_limiter,
        client_ip(request),
        "Trop d'inscriptions depuis cette adresse, reessayez plus tard",
    )
    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Verification anti-robot invalide ou expiree")

    email = payload.email.lower().strip()
    existing = db.query(models_db.NewsletterSubscriber).filter_by(email=email).first()
    if existing and existing.confirmed:
        return {"ok": True}
    if not existing:
        existing = models_db.NewsletterSubscriber(email=email)
        db.add(existing)
        db.commit()

    confirm_token = auth.issue_purpose_token(email, "newsletter_confirm", ttl_minutes=60 * 24)
    unsub_token = auth.issue_purpose_token(
        email, "newsletter_unsubscribe", ttl_minutes=_UNSUBSCRIBE_TTL_MINUTES
    )
    confirm_url = f"{settings.frontend_base_url}/newsletter/confirm?token={confirm_token}"
    unsubscribe_url = f"{settings.frontend_base_url}/newsletter/unsubscribe?token={unsub_token}"
    subject, html, text = email_templates.newsletter_confirm_email(confirm_url, unsubscribe_url)
    background_tasks.add_task(mail_service.send_email, email, subject, html, text)
    return {"ok": True}


@router.get("/confirm")
def confirm(token: str, db: Session = Depends(get_db)):
    email = auth.verify_purpose_token(token, "newsletter_confirm")
    if not email:
        raise HTTPException(400, "Lien de confirmation invalide ou expire")
    sub = db.query(models_db.NewsletterSubscriber).filter_by(email=email).first()
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
        raise HTTPException(400, "Lien de desinscription invalide")
    db.query(models_db.NewsletterSubscriber).filter_by(email=email).delete()
    db.commit()
    return {"ok": True}
