from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from . import models_db
from .database import get_db
from .services import auth

SHARE_TOKEN_HEADER = "X-Share-Token"


def client_ip(request: Request) -> str:
    # X-Real-IP is set by our nginx config from $remote_addr, overwriting
    # anything the client sent - it can't be spoofed by the caller.
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    # X-Forwarded-For is only appended to by nginx ($proxy_add_x_forwarded_for),
    # not replaced, so a client can prepend arbitrary values - the real
    # client IP is always the last entry, never the first.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[models_db.User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    payload = auth.verify_user_token(authorization[7:].strip())
    if not payload:
        return None
    return db.get(models_db.User, payload.get("sub"))


def get_current_user(
    user: Optional[models_db.User] = Depends(get_current_user_optional),
) -> models_db.User:
    if not user:
        raise HTTPException(401, "Authentification requise")
    return user


def require_admin(user: models_db.User = Depends(get_current_user)) -> models_db.User:
    if user.role != "admin":
        raise HTTPException(403, "Reserve aux administrateurs")
    return user


@dataclass
class SpaceAccess:
    space: models_db.Space
    role: str  # "owner" | "editor" | "viewer"
    user: Optional[models_db.User]

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "editor")

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


def _resolve_role(
    space: models_db.Space,
    user: Optional[models_db.User],
    share_token: Optional[str],
    db: Session,
) -> SpaceAccess:
    if user:
        if space.owner_id == user.id:
            return SpaceAccess(space, "owner", user)
        member = (
            db.query(models_db.SpaceMember)
            .filter_by(space_id=space.id, user_id=user.id)
            .first()
        )
        if member:
            return SpaceAccess(space, member.role, user)
        if user.role == "admin":
            # Admins can see any space from the admin dashboard, but that
            # doesn't imply edit rights over content they don't own or
            # aren't a member of.
            return SpaceAccess(space, "viewer", user)
    if share_token:
        link = db.get(models_db.ShareLink, share_token)
        if (
            link
            and link.space_id == space.id
            and not link.revoked
            and (not link.expires_at or link.expires_at > datetime.utcnow())
        ):
            return SpaceAccess(space, link.role, None)
    raise HTTPException(401, "Acces non autorise a cet espace")


def require_space_access(
    space_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models_db.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> SpaceAccess:
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return _resolve_role(space, user, x_share_token, db)


def require_space_owner(access: SpaceAccess = Depends(require_space_access)) -> SpaceAccess:
    if not access.is_owner:
        raise HTTPException(403, "Reserve au proprietaire de l'espace")
    return access


@dataclass
class ConversationAccess:
    conversation: models_db.Conversation
    role: str
    user: Optional[models_db.User]

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "editor")


def require_conversation_access(
    conversation_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models_db.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ConversationAccess:
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    space = db.get(models_db.Space, conv.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    access = _resolve_role(space, user, x_share_token, db)
    return ConversationAccess(conv, access.role, access.user)


@dataclass
class DocumentAccess:
    document: models_db.Document
    role: str
    user: Optional[models_db.User]

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "editor")


def require_document_access(
    document_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models_db.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> DocumentAccess:
    doc = db.get(models_db.Document, document_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    space = db.get(models_db.Space, doc.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    access = _resolve_role(space, user, x_share_token, db)
    return DocumentAccess(doc, access.role, access.user)
