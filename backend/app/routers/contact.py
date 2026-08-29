import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import settings
from ..database import get_db
from ..deps import client_ip
from ..services import captcha, email_templates, mail_service, rate_limiter

logger = logging.getLogger("hyaides.contact")
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

    rate_limiter.enforce(rate_limiter.contact_form_limiter, client_ip(request), "Trop de messages envoyes, reessayez plus tard")

    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Verification anti-robot invalide ou expiree")

    msg = models_db.ContactMessage(
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
        subject, html, text = email_templates.contact_notification_email(
            msg.name, msg.email, msg.subject, msg.phone, msg.company, msg.message
        )
        background_tasks.add_task(mail_service.send_email, settings.contact_email, subject, html, text)

    return {"ok": True}
