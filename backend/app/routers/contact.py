import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db
from ..deps import client_ip
from ..services import captcha, rate_limiter

logger = logging.getLogger("open-rag.contact")
router = APIRouter(prefix="/api", tags=["contact"])


@router.post("/contact", status_code=201)
def submit_contact(payload: schemas.ContactCreate, request: Request, db: Session = Depends(get_db)):
    if payload.website:
        # Honeypot field: real visitors never see or fill it. Pretend
        # success so bots don't learn to avoid it.
        return {"ok": True}

    if not rate_limiter.contact_form_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de messages envoyes, reessayez plus tard")

    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Verification anti-robot invalide ou expiree")

    msg = models_db.ContactMessage(
        name=payload.name.strip(),
        email=payload.email,
        message=payload.message.strip(),
    )
    db.add(msg)
    db.commit()
    logger.info("Nouveau message de contact de %s <%s>", msg.name, msg.email)
    return {"ok": True}
