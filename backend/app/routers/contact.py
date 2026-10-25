"""Public contact form (honeypot + captcha + rate limit)."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import client_ip
from ..services import captcha, mailer, rate_limiter

logger = logging.getLogger("docverse.contact")
router = APIRouter(prefix="/api", tags=["contact"])


@router.post("/contact", status_code=201)
def submit_contact(
    payload: schemas.ContactCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if payload.website:
        # Honeypot field: real visitors never see or fill it. Pretend
        # success so bots don't learn to avoid it.
        return {"ok": True}

    rate_limiter.enforce(rate_limiter.contact_form_limiter, client_ip(request), "Trop de messages envoyés, réessayez plus tard")

    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Vérification anti-robot invalide ou expirée")

    msg = models.ContactMessage(
        name=payload.name.strip(),
        email=payload.email,
        subject=payload.subject.strip(),
        phone=payload.phone.strip(),
        company=payload.company.strip(),
        message=payload.message.strip(),
        consent_given=payload.consent,
    )
    db.add(msg)
    db.commit()
    logger.info("Nouveau message de contact de %s <%s>", msg.name, msg.email)

    if settings.contact_email:
        notification = mailer.contact_notification_email(
            msg.name, msg.email, msg.subject, msg.phone, msg.company, msg.message
        )
        mailer.send_later(background_tasks, settings.contact_email, notification)

    return {"ok": True}
