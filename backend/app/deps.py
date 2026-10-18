"""FastAPI dependencies: client IP, the signed-in user, admin guard,
per-space access control (owner / member / share link / admin view) and
offset pagination."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from fastapi import Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Query as SQLQuery
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .services import auth

SHARE_TOKEN_HEADER = "X-Share-Token"


def client_ip(request: Request) -> str:
    # X-Real-IP is set by our nginx config from $remote_addr, overwriting
    # anything the client sent - it can't be spoofed by the caller. Behind
    # Caddy, nginx's realip module resolves $remote_addr back to the true
    # client (trusting only private ranges), so this is the visitor's IP
    # and not the edge proxy's.
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
) -> Optional[models.User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    payload = auth.verify_user_token(authorization[7:].strip())
    if not payload:
        return None
    user = db.get(models.User, payload.get("sub"))
    if not user or not user.is_active:
        return None
    # Lets a password change or an explicit "log out everywhere" invalidate
    # every outstanding session token immediately, instead of waiting out
    # their natural expiry.
    if payload.get("tv") != user.token_version:
        return None
    return user


def get_current_user(
    user: Optional[models.User] = Depends(get_current_user_optional),
) -> models.User:
    if not user:
        raise HTTPException(401, "Authentification requise")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Reserve aux administrateurs")
    # 2FA stays available but optional for admins too (owner's choice) - the
    # instance has a single admin account, set with app.scripts.set_admin.
    return user


@dataclass
class SpaceAccess:
    """What the caller may do in one space. Routes scoped to a conversation
    or a document get the same object, with that resource attached."""

    space: models.Space
    role: str  # "owner" | "member" | "admin_view"
    user: Optional[models.User]
    can_upload: bool = False
    conversation: Optional[models.Conversation] = None
    document: Optional[models.Document] = None

    @property
    def can_write(self) -> bool:
        # Chatting and managing your own conversations is a baseline
        # capability of any real member (never gated), unlike uploading
        # documents (see can_upload) - only an admin browsing a space they
        # don't belong to (role="admin_view") is denied this.
        return self.role in ("owner", "member")

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"

    def require_write(self) -> None:
        if not self.can_write:
            raise HTTPException(403, "Acces en lecture seule a cet espace")

    def require_upload(self) -> None:
        if not self.can_upload:
            raise HTTPException(403, "Vous n'avez pas la permission de gerer les documents de cet espace")


def _resolve_role(
    space: models.Space,
    user: Optional[models.User],
    share_token: Optional[str],
    db: Session,
) -> SpaceAccess:
    if user:
        if space.owner_id == user.id:
            return SpaceAccess(space, "owner", user, can_upload=True)
        member = db.query(models.SpaceMember).filter_by(space_id=space.id, user_id=user.id).first()
        if member:
            return SpaceAccess(space, "member", user, can_upload=member.can_upload)
        # A share link grants access, but only to a signed-in visitor - an
        # anonymous seat doesn't count against the owner's member quota
        # (config.FREE_QUOTAS) and would make member limits meaningless.
        # The visitor's own account is what's checked here, not the space
        # owner's, so anyone with an account can follow a share link.
        if share_token:
            link = db.get(models.ShareLink, share_token)
            if (
                link
                and link.space_id == space.id
                and not link.revoked
                and (not link.expires_at or link.expires_at > datetime.utcnow())
            ):
                return SpaceAccess(space, "member", user, can_upload=link.can_upload)
        if user.role == "admin":
            # Admins can see any space from the admin dashboard, but that
            # doesn't imply chat/edit rights over content they don't own or
            # aren't a member of.
            return SpaceAccess(space, "admin_view", user, can_upload=False)
    raise HTTPException(401, "Acces non autorise a cet espace - connectez-vous pour utiliser ce lien de partage")


def _space_access(space_id: str, user, share_token, db: Session) -> SpaceAccess:
    space = db.get(models.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return _resolve_role(space, user, share_token, db)


def require_space_access(
    space_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> SpaceAccess:
    return _space_access(space_id, user, x_share_token, db)


def require_space_owner(access: SpaceAccess = Depends(require_space_access)) -> SpaceAccess:
    if not access.is_owner:
        raise HTTPException(403, "Reserve au proprietaire de l'espace")
    return access


def require_conversation_access(
    conversation_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> SpaceAccess:
    conversation = db.get(models.Conversation, conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation introuvable")
    access = _space_access(conversation.space_id, user, x_share_token, db)
    access.conversation = conversation
    return access


def require_document_access(
    document_id: str,
    x_share_token: Optional[str] = Header(default=None, alias=SHARE_TOKEN_HEADER),
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> SpaceAccess:
    document = db.get(models.Document, document_id)
    if not document:
        raise HTTPException(404, "Document introuvable")
    access = _space_access(document.space_id, user, x_share_token, db)
    access.document = document
    return access


# --- Pagination -------------------------------------------------------------------


@dataclass
class Pagination:
    limit: int
    offset: int

    def apply(self, query: SQLQuery) -> dict[str, Any]:
        """Runs `query` for this page; the dict matches schemas.Page."""
        total = query.count()
        items = query.offset(self.offset).limit(self.limit).all()
        return {"items": items, "total": total, "limit": self.limit, "offset": self.offset}


def pagination(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Pagination:
    return Pagination(limit, offset)
