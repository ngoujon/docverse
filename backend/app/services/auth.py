import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

from ..config import settings

_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def issue_user_token(user_id: str, role: str, token_version: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.user_token_ttl_days)
    payload = {
        "sub": user_id,
        "role": role,
        "tv": token_version,
        "purpose": "session",
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def verify_user_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != "session":
        return None
    return payload


def issue_purpose_token(subject: str, purpose: str, ttl_minutes: int) -> str:
    """Short-lived, single-purpose token (newsletter double opt-in,
    unsubscribe, ...). Not single-use-tracked server-side - fine given the
    short TTL and that replaying these has no meaningful consequence."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    payload = {"sub": subject, "purpose": purpose, "exp": expires_at}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def verify_purpose_token(token: str, purpose: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != purpose:
        return None
    return payload.get("sub")


def _password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def issue_password_reset_token(user_id: str, current_password_hash: str) -> str:
    """Unlike issue_purpose_token, this binds the token to a fingerprint of
    the password hash at issue time: once the password is actually
    changed, every outstanding reset token (including the one just used)
    stops matching and is rejected - single-use without a DB table."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)
    payload = {
        "sub": user_id,
        "purpose": "password_reset",
        "pwv": _password_fingerprint(current_password_hash),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_password_reset_token(token: str) -> Optional[dict]:
    """Returns the raw payload ({"sub": user_id, "pwv": fingerprint, ...})
    without checking the fingerprint yet - the caller needs to look the
    user up by `sub` first to get their current password_hash before it
    can call password_reset_token_is_current() below."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != "password_reset":
        return None
    return payload


def password_reset_token_is_current(payload: dict, current_password_hash: str) -> bool:
    return payload.get("pwv") == _password_fingerprint(current_password_hash)
