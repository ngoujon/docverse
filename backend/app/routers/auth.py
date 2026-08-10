from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import settings
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..services import auth, captcha, email_templates, mail_service, rate_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.AuthResponse)
def register(
    payload: schemas.RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not rate_limiter.register_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de tentatives, reessayez plus tard")
    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Verification anti-robot invalide ou expiree")

    email = payload.email.lower().strip()
    if db.query(models_db.User).filter_by(email=email).first():
        raise HTTPException(409, "Un compte existe deja avec cet email")

    is_first_user = db.query(models_db.User).count() == 0
    user = models_db.User(
        email=email,
        password_hash=auth.hash_password(payload.password),
        display_name=payload.display_name.strip(),
        role="admin" if is_first_user else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    subject, html, text = email_templates.welcome_email(user.display_name)
    background_tasks.add_task(mail_service.send_email, user.email, subject, html, text)

    token = auth.issue_user_token(user.id, user.role)
    return schemas.AuthResponse(access_token=token, user=user)


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    if not rate_limiter.login_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de tentatives, reessayez plus tard")

    email = payload.email.lower().strip()
    user = db.query(models_db.User).filter_by(email=email).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email ou mot de passe incorrect")

    token = auth.issue_user_token(user.id, user.role)
    return schemas.AuthResponse(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models_db.User = Depends(get_current_user)):
    return user


@router.get("/me/stats", response_model=schemas.MeStatsOut)
def me_stats(user: models_db.User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned = db.query(models_db.Space).filter_by(owner_id=user.id).all()
    member_space_ids = [
        m.space_id for m in db.query(models_db.SpaceMember).filter_by(user_id=user.id).all()
    ]
    all_space_ids = [s.id for s in owned] + member_space_ids

    document_count = 0
    storage_bytes = 0
    conversation_count = 0
    message_count = 0
    if all_space_ids:
        document_count = (
            db.query(func.count(models_db.Document.id))
            .filter(models_db.Document.space_id.in_(all_space_ids))
            .scalar()
            or 0
        )
        storage_bytes = (
            db.query(func.coalesce(func.sum(models_db.Document.size_bytes), 0))
            .filter(models_db.Document.space_id.in_(all_space_ids))
            .scalar()
            or 0
        )
        conversation_count = (
            db.query(func.count(models_db.Conversation.id))
            .filter(models_db.Conversation.space_id.in_(all_space_ids))
            .scalar()
            or 0
        )
        message_count = (
            db.query(func.count(models_db.Message.id))
            .join(
                models_db.Conversation,
                models_db.Message.conversation_id == models_db.Conversation.id,
            )
            .filter(models_db.Conversation.space_id.in_(all_space_ids))
            .scalar()
            or 0
        )

    return schemas.MeStatsOut(
        owned_spaces=len(owned),
        member_spaces=len(member_space_ids),
        document_count=document_count,
        conversation_count=conversation_count,
        message_count=message_count,
        storage_bytes=storage_bytes,
    )


@router.post("/forgot-password")
def forgot_password(
    payload: schemas.ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not rate_limiter.password_reset_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de tentatives, reessayez plus tard")

    email = payload.email.lower().strip()
    user = db.query(models_db.User).filter_by(email=email).first()
    if user:
        token = auth.issue_password_reset_token(user.id, user.password_hash)
        reset_url = f"{settings.frontend_base_url}/reset-password?token={token}"
        subject, html, text = email_templates.password_reset_email(reset_url)
        background_tasks.add_task(mail_service.send_email, user.email, subject, html, text)
    # Same response whether or not the email exists, so this endpoint can't
    # be used to enumerate registered accounts.
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    token_payload = auth.decode_password_reset_token(payload.token)
    user = db.get(models_db.User, token_payload.get("sub")) if token_payload else None
    if (
        not token_payload
        or not user
        or not auth.password_reset_token_is_current(token_payload, user.password_hash)
    ):
        raise HTTPException(400, "Lien de reinitialisation invalide, expire ou deja utilise")
    user.password_hash = auth.hash_password(payload.password)
    db.commit()
    return {"ok": True}
