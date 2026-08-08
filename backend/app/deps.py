from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from . import models_db
from .database import get_db
from .services import space_auth

SPACE_TOKEN_HEADER = "X-Space-Token"


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_token(space: models_db.Space, token: Optional[str]) -> None:
    if not space.password_hash:
        return
    if not token or not space_auth.verify_token(space.id, token):
        raise HTTPException(401, "Mot de passe requis pour cet espace")


def require_space_access(
    space_id: str,
    x_space_token: Optional[str] = Header(default=None, alias=SPACE_TOKEN_HEADER),
    db: Session = Depends(get_db),
) -> models_db.Space:
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    _check_token(space, x_space_token)
    return space


def require_conversation_access(
    conversation_id: str,
    x_space_token: Optional[str] = Header(default=None, alias=SPACE_TOKEN_HEADER),
    db: Session = Depends(get_db),
) -> models_db.Conversation:
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    space = db.get(models_db.Space, conv.space_id)
    if space:
        _check_token(space, x_space_token)
    return conv


def require_document_access(
    document_id: str,
    x_space_token: Optional[str] = Header(default=None, alias=SPACE_TOKEN_HEADER),
    db: Session = Depends(get_db),
) -> models_db.Document:
    doc = db.get(models_db.Document, document_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    space = db.get(models_db.Space, doc.space_id)
    if space:
        _check_token(space, x_space_token)
    return doc
