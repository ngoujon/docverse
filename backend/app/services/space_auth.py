from datetime import datetime, timedelta, timezone

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


def issue_token(space_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.space_token_ttl_hours
    )
    payload = {"space_id": space_id, "exp": expires_at}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def verify_token(space_id: str, token: str) -> bool:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return False
    return payload.get("space_id") == space_id
