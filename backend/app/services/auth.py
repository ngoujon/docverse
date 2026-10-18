"""Account security primitives: password hashing, signed tokens (session,
single-purpose, password reset) and TOTP two-factor codes."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import pyotp

from ..config import settings

_ALGORITHM = "HS256"


# --- Passwords ------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# A bcrypt hash of a value nobody can supply, used only to burn the same
# ~100ms verify_password() would have cost. Computed once at import.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def verify_password_dummy() -> None:
    """Run a throwaway bcrypt verification.

    Skipping the hash comparison when an email doesn't exist makes "unknown
    address" answer in microseconds while "known address, wrong password"
    takes the full bcrypt work factor. That gap is trivially measurable and
    turns any login or password-reset form into an account enumeration
    oracle, whatever the response body says. Callers on the not-found path
    call this so both branches cost the same."""
    bcrypt.checkpw(b"invalid", _DUMMY_HASH.encode("utf-8"))


# --- Signed tokens ----------------------------------------------------------


def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def _decode(token: str, purpose: str) -> Optional[dict]:
    """Decodes a token and checks it was minted for `purpose` - a session
    token must never be accepted as a password-reset token, and so on."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("purpose") == purpose else None


def issue_user_token(user_id: str, role: str, token_version: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.user_token_ttl_days)
    payload = {
        "sub": user_id,
        "role": role,
        "tv": token_version,
        "purpose": "session",
        "exp": expires_at,
    }
    return _encode(payload)


def verify_user_token(token: str) -> Optional[dict]:
    return _decode(token, "session")


def issue_purpose_token(subject: str, purpose: str, ttl_minutes: int) -> str:
    """Short-lived, single-purpose token (newsletter double opt-in,
    unsubscribe, ...). Not single-use-tracked server-side - fine given the
    short TTL and that replaying these has no meaningful consequence."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    return _encode({"sub": subject, "purpose": purpose, "exp": expires_at})


def verify_purpose_token(token: str, purpose: str) -> Optional[str]:
    payload = _decode(token, purpose)
    return payload.get("sub") if payload else None


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
    return _encode(payload)


def decode_password_reset_token(token: str) -> Optional[dict]:
    """Returns the raw payload ({"sub": user_id, "pwv": fingerprint, ...})
    without checking the fingerprint yet - the caller needs to look the
    user up by `sub` first to get their current password_hash before it
    can call password_reset_token_is_current() below."""
    return _decode(token, "password_reset")


def password_reset_token_is_current(payload: dict, current_password_hash: str) -> bool:
    return payload.get("pwv") == _password_fingerprint(current_password_hash)


# --- Two-factor authentication (TOTP) ---------------------------------------


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    """otpauth:// URI an authenticator app imports (as text or QR code)."""
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Docverse")


def verify_totp(secret: str, code: str) -> bool:
    # valid_window=1 tolerates one 30s step of clock drift on the phone.
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except Exception:
        return False
