import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import UPLOAD_DIR, settings
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..services import auth, backup, captcha, email_templates, mail_service, rate_limiter, twofa, vectorstore

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

    verify_token = auth.issue_purpose_token(user.id, "email_verify", ttl_minutes=60 * 48)
    verify_url = f"{settings.frontend_base_url}/verify-email?token={verify_token}"
    subject, html, text = email_templates.verify_email_email(verify_url)
    background_tasks.add_task(mail_service.send_email, user.email, subject, html, text)

    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.AuthResponse(access_token=token, user=user)


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    if not rate_limiter.login_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de tentatives, reessayez plus tard")

    email = payload.email.lower().strip()
    user = db.query(models_db.User).filter_by(email=email).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    if not user.is_active:
        raise HTTPException(403, "Ce compte a ete desactive")

    if user.totp_enabled:
        pending_token = auth.issue_purpose_token(user.id, "2fa_pending", ttl_minutes=5)
        return schemas.LoginResponse(requires_2fa=True, pending_token=pending_token)

    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.LoginResponse(access_token=token, user=user)


@router.post("/2fa/verify", response_model=schemas.AuthResponse)
def verify_login_2fa(
    payload: schemas.TwoFactorVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not rate_limiter.login_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de tentatives, reessayez plus tard")
    user_id = auth.verify_purpose_token(payload.pending_token, "2fa_pending")
    user = db.get(models_db.User, user_id) if user_id else None
    if not user or not user.totp_enabled:
        raise HTTPException(400, "Session de connexion invalide ou expiree, reconnectez-vous")
    if not twofa.verify_code(user.totp_secret, payload.code):
        raise HTTPException(401, "Code de verification incorrect")

    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.AuthResponse(access_token=token, user=user)


@router.post("/2fa/setup", response_model=schemas.TwoFactorSetupResponse)
def setup_2fa(user: models_db.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(400, "La verification en deux etapes est deja activee")
    secret = twofa.generate_secret()
    user.totp_secret = secret  # not enabled until confirmed via /2fa/enable
    db.commit()
    return schemas.TwoFactorSetupResponse(
        secret=secret, provisioning_uri=twofa.provisioning_uri(secret, user.email)
    )


@router.post("/2fa/enable")
def enable_2fa(
    payload: schemas.TwoFactorEnableRequest,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.totp_secret:
        raise HTTPException(400, "Lancez d'abord la configuration (/2fa/setup)")
    if not twofa.verify_code(user.totp_secret, payload.code):
        raise HTTPException(401, "Code de verification incorrect")
    user.totp_enabled = True
    db.commit()
    return {"ok": True}


@router.post("/2fa/disable")
def disable_2fa(
    payload: schemas.TwoFactorDisableRequest,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Mot de passe incorrect")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"ok": True}


@router.post("/logout-everywhere", response_model=schemas.LogoutEverywhereResponse)
def logout_everywhere(
    user: models_db.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Invalidates every session token issued before now, on every device -
    including the one making this request, which gets a fresh replacement
    token back so it isn't immediately logged out too."""
    user.token_version += 1
    db.commit()
    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.LogoutEverywhereResponse(access_token=token)


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


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user_id = auth.verify_purpose_token(token, "email_verify")
    if not user_id:
        raise HTTPException(400, "Lien de confirmation invalide ou expire")
    user = db.get(models_db.User, user_id)
    if not user:
        raise HTTPException(400, "Lien de confirmation invalide ou expire")
    user.email_verified = True
    db.commit()
    return {"ok": True}


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
    # A password reset is exactly the moment an attacker's still-valid
    # session (if the password leaked) should stop working too.
    user.token_version += 1
    db.commit()
    return {"ok": True}


@router.delete("/me")
def delete_account(
    payload: schemas.DeleteAccountRequest,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Mot de passe incorrect")
    if user.role == "admin":
        remaining_admins = (
            db.query(models_db.User)
            .filter(models_db.User.role == "admin", models_db.User.id != user.id)
            .filter(models_db.User.is_active.is_(True))
            .count()
        )
        if remaining_admins == 0:
            raise HTTPException(
                400,
                "Impossible de supprimer le dernier compte administrateur actif de l'instance",
            )

    owned_spaces = db.query(models_db.Space).filter_by(owner_id=user.id).all()
    for space in owned_spaces:
        space_id = space.id
        db.delete(space)
        db.commit()
        vectorstore.delete_space(space_id)
        backup.delete_all_snapshots(space_id)
        space_dir = UPLOAD_DIR / space_id
        if space_dir.exists():
            shutil.rmtree(space_dir, ignore_errors=True)

    db.query(models_db.SpaceMember).filter_by(user_id=user.id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.get("/me/export")
def export_account_data(
    user: models_db.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    owned = db.query(models_db.Space).filter_by(owner_id=user.id).all()
    member_rows = db.query(models_db.SpaceMember).filter_by(user_id=user.id).all()
    member_spaces = [db.get(models_db.Space, m.space_id) for m in member_rows]

    def space_export(space: models_db.Space, role: str) -> dict:
        conversations = (
            db.query(models_db.Conversation).filter_by(space_id=space.id).all()
        )
        return {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "my_role": role,
            "created_at": space.created_at.isoformat() if space.created_at else None,
            "conversations": [
                {
                    "id": c.id,
                    "title": c.title,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "messages": [
                        {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None}
                        for m in c.messages
                    ],
                }
                for c in conversations
            ],
            "documents": [
                {"name": d.name, "doc_type": d.doc_type, "created_at": d.created_at.isoformat() if d.created_at else None}
                for d in db.query(models_db.Document).filter_by(space_id=space.id).all()
            ],
        }

    return {
        "account": {
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "owned_spaces": [space_export(s, "owner") for s in owned],
        "member_spaces": [
            space_export(s, next(m.role for m in member_rows if m.space_id == s.id))
            for s in member_spaces
            if s
        ],
    }
