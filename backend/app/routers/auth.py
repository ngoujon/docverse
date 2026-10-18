"""Email/password accounts: signup, login (+ optional TOTP second step),
profile, password changes and resets, email verification, and the GDPR
self-service routes (data export, account deletion)."""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import quota, settings
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..services import accounts, auth, captcha, mailer, rate_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth_response(user: models.User) -> schemas.AuthResponse:
    """A fresh session token for `user`, bound to its current token_version."""
    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.AuthResponse(access_token=token, user=user)


def _isoformat(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


@router.post("/register", response_model=schemas.AuthResponse)
def register(
    payload: schemas.RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    rate_limiter.enforce(rate_limiter.register_limiter, client_ip(request))
    if not captcha.verify_solution(payload.captcha_salt, payload.captcha_nonce):
        raise HTTPException(400, "Verification anti-robot invalide ou expiree")
    if not payload.terms_accepted:
        raise HTTPException(400, "Vous devez accepter les conditions d'utilisation")

    email = payload.email.lower().strip()
    if db.query(models.User).filter_by(email=email).first():
        # A distinct "this email is taken" answer is a free account
        # enumeration oracle on a public form, so the message stays
        # deliberately ambiguous between "already registered" and "not
        # allowed" - the person who actually owns the address recovers it
        # through the password-reset flow, which tells nobody anything.
        raise HTTPException(
            409,
            "Impossible de creer un compte avec cet email. S'il vous appartient deja, "
            "utilisez « mot de passe oublie » pour y acceder.",
        )

    is_first_user = db.query(models.User).count() == 0
    user = models.User(
        email=email,
        password_hash=auth.hash_password(payload.password),
        display_name=payload.display_name.strip(),
        role="admin" if is_first_user else "user",
        terms_accepted_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    welcome = mailer.welcome_email(user.display_name, f"{settings.frontend_base_url}/dashboard")
    mailer.send_later(background_tasks, user.email, welcome)
    accounts.send_verification_email(background_tasks, user)
    return _auth_response(user)


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    rate_limiter.enforce(rate_limiter.login_limiter, client_ip(request))

    email = payload.email.lower().strip()
    # Second, IP-independent bucket: an attacker rotating source addresses
    # slips past the per-IP limit above, but every one of those attempts
    # still targets this one address. Only failures are recorded and a
    # success clears the bucket (below), so a third party hammering your
    # email can never lock you out of your own account.
    account_key = f"login:{email}"
    rate_limiter.enforce_check(
        rate_limiter.login_account_limiter,
        account_key,
        "Trop de tentatives de connexion sur ce compte, reessayez plus tard",
    )

    user = db.query(models.User).filter_by(email=email).first()
    if not user:
        # Burn the same bcrypt time a real account would have cost:
        # answering "unknown email" in microseconds while "wrong password"
        # takes ~100ms tells an attacker exactly which addresses exist.
        auth.verify_password_dummy()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        rate_limiter.login_account_limiter.record(account_key)
        raise HTTPException(401, "Email ou mot de passe incorrect")
    if not user.is_active:
        raise HTTPException(403, "Ce compte a ete desactive")

    rate_limiter.login_account_limiter.reset(account_key)

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
    rate_limiter.enforce(rate_limiter.login_limiter, client_ip(request))
    user_id = auth.verify_purpose_token(payload.pending_token, "2fa_pending")
    user = db.get(models.User, user_id) if user_id else None
    if not user or not user.totp_enabled:
        raise HTTPException(400, "Session de connexion invalide ou expiree, reconnectez-vous")
    if not auth.verify_totp(user.totp_secret, payload.code):
        raise HTTPException(401, "Code de verification incorrect")
    return _auth_response(user)


@router.post("/2fa/setup", response_model=schemas.TwoFactorSetupResponse)
def setup_2fa(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(400, "La verification en deux etapes est deja activee")
    secret = auth.generate_totp_secret()
    user.totp_secret = secret  # not enabled until confirmed via /2fa/enable
    db.commit()
    return schemas.TwoFactorSetupResponse(
        secret=secret, provisioning_uri=auth.totp_provisioning_uri(secret, user.email)
    )


@router.post("/2fa/enable")
def enable_2fa(
    payload: schemas.TwoFactorEnableRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.totp_secret:
        raise HTTPException(400, "Lancez d'abord la configuration (/2fa/setup)")
    if not auth.verify_totp(user.totp_secret, payload.code):
        raise HTTPException(401, "Code de verification incorrect")
    user.totp_enabled = True
    db.commit()
    return {"ok": True}


@router.post("/2fa/disable")
def disable_2fa(
    payload: schemas.TwoFactorDisableRequest,
    user: models.User = Depends(get_current_user),
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
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Invalidates every session token issued before now, on every device -
    including the one making this request, which gets a fresh replacement
    token back so it isn't immediately logged out too."""
    user.token_version += 1
    db.commit()
    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return schemas.LogoutEverywhereResponse(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.ProfileUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.display_name = payload.display_name.strip()
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=schemas.AuthResponse)
def change_password(
    payload: schemas.ChangePasswordRequest,
    request: Request,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limiter.enforce(rate_limiter.login_limiter, client_ip(request))
    if not auth.verify_password(payload.current_password, user.password_hash):
        # 400 rather than 401: the session itself is valid, only the
        # confirmation is wrong - a 401 would read as "logged out".
        raise HTTPException(400, "Mot de passe actuel incorrect")
    user.password_hash = auth.hash_password(payload.new_password)
    # Same as a reset: other sessions (possibly opened with the old
    # password) stop working, and this one gets a fresh token.
    user.token_version += 1
    db.commit()
    db.refresh(user)
    return _auth_response(user)


@router.post("/resend-verification")
def resend_verification(
    background_tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user),
):
    if user.email_verified:
        return {"ok": True}
    rate_limiter.enforce(
        rate_limiter.verify_email_resend_limiter,
        user.id,
        "Un email de confirmation vient deja d'etre envoye, reessayez plus tard",
    )
    accounts.send_verification_email(background_tasks, user)
    return {"ok": True}


@router.get("/me/stats", response_model=schemas.MeStatsOut)
def me_stats(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_ids = [row[0] for row in db.query(models.Space.id).filter_by(owner_id=user.id)]
    member_ids = [row[0] for row in db.query(models.SpaceMember.space_id).filter_by(user_id=user.id)]
    space_ids = owned_ids + member_ids

    def count(query, space_column) -> int:
        if not space_ids:
            return 0
        return query.filter(space_column.in_(space_ids)).scalar() or 0

    messages_query = db.query(func.count(models.Message.id)).join(
        models.Conversation, models.Message.conversation_id == models.Conversation.id
    )
    return schemas.MeStatsOut(
        owned_spaces=len(owned_ids),
        space_limit=quota("spaces"),
        member_spaces=len(member_ids),
        document_count=count(db.query(func.count(models.Document.id)), models.Document.space_id),
        conversation_count=count(db.query(func.count(models.Conversation.id)), models.Conversation.space_id),
        message_count=count(messages_query, models.Conversation.space_id),
        storage_bytes=accounts.storage_bytes(db, space_ids),
        storage_limit_bytes=quota("storage_bytes"),
        messages_today=accounts.messages_today(user),
        messages_per_day_limit=quota("messages_per_day"),
    )


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user_id = auth.verify_purpose_token(token, "email_verify")
    if not user_id:
        raise HTTPException(400, "Lien de confirmation invalide ou expire")
    user = db.get(models.User, user_id)
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
    rate_limiter.enforce(rate_limiter.password_reset_limiter, client_ip(request))

    email = payload.email.lower().strip()
    user = db.query(models.User).filter_by(email=email).first()
    if user:
        token = auth.issue_password_reset_token(user.id, user.password_hash)
        reset_url = f"{settings.frontend_base_url}/reset-password?token={token}"
        mailer.send_later(background_tasks, user.email, mailer.password_reset_email(reset_url))
    else:
        # The response body was already identical either way, but the
        # timing was not: issuing a reset token costs a bcrypt-hash
        # fingerprint and a DB write that the unknown-address path skips
        # entirely. That measurable gap is enough to enumerate accounts, so
        # the miss branch pays a comparable cost.
        auth.verify_password_dummy()
    # Same response, and now the same cost, whether or not the email
    # exists - so this endpoint can't be used to enumerate accounts.
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    token_payload = auth.decode_password_reset_token(payload.token)
    user = db.get(models.User, token_payload.get("sub")) if token_payload else None
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
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Mot de passe incorrect")
    if user.role == "admin" and accounts.other_active_admins(db, user.id) == 0:
        raise HTTPException(400, "Impossible de supprimer le dernier compte administrateur actif de l'instance")
    accounts.purge_user(db, user)
    return {"ok": True}


@router.get("/me/export")
def export_account_data(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """GDPR right of access: everything the account owns or takes part in,
    as one JSON document."""
    owned = db.query(models.Space).filter_by(owner_id=user.id).all()
    memberships = db.query(models.SpaceMember).filter_by(user_id=user.id).all()

    def space_export(space: models.Space, role: str) -> dict:
        conversations = db.query(models.Conversation).filter_by(space_id=space.id).all()
        documents = db.query(models.Document).filter_by(space_id=space.id).all()
        return {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "my_role": role,
            "created_at": _isoformat(space.created_at),
            "conversations": [
                {
                    "id": c.id,
                    "title": c.title,
                    "created_at": _isoformat(c.created_at),
                    "messages": [
                        {"role": m.role, "content": m.content, "created_at": _isoformat(m.created_at)}
                        for m in c.messages
                    ],
                }
                for c in conversations
            ],
            "documents": [
                {"name": d.name, "doc_type": d.doc_type, "created_at": _isoformat(d.created_at)}
                for d in documents
            ],
        }

    member_spaces = [(db.get(models.Space, m.space_id), m.role) for m in memberships]
    return {
        "account": {
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "created_at": _isoformat(user.created_at),
        },
        "owned_spaces": [space_export(s, "owner") for s in owned],
        "member_spaces": [space_export(s, role) for s, role in member_spaces if s],
    }
