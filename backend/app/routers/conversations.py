"""Conversations of a space: CRUD, message history and PDF/DOCX export."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import SpaceAccess, require_conversation_access, require_space_access
from ..services import export as export_service

router = APIRouter(prefix="/api", tags=["conversations"])

_EXPORT_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("/spaces/{space_id}/conversations", response_model=list[schemas.ConversationOut])
def list_conversations(
    access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)
):
    return (
        db.query(models.Conversation)
        .filter(models.Conversation.space_id == access.space.id)
        .order_by(models.Conversation.updated_at.desc())
        .all()
    )


@router.post("/spaces/{space_id}/conversations", response_model=schemas.ConversationOut)
def create_conversation(
    payload: schemas.ConversationCreate,
    access: SpaceAccess = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    access.require_write()
    conv = models.Conversation(space_id=access.space.id, title=payload.title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def get_conversation(access: SpaceAccess = Depends(require_conversation_access)):
    return access.conversation


@router.get(
    "/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut]
)
def list_messages(access: SpaceAccess = Depends(require_conversation_access)):
    return [schemas.MessageOut.from_message(m) for m in access.conversation.messages]


def _safe_filename(title: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in " -_" else "" for c in title).strip()
    return (cleaned or "conversation")[:80]


@router.get("/conversations/{conversation_id}/export")
def export_conversation(
    format: str = "pdf",
    access: SpaceAccess = Depends(require_conversation_access),
):
    if format not in _EXPORT_CONTENT_TYPES:
        raise HTTPException(400, "Format d'export non supporte (pdf ou docx)")

    conv = access.conversation
    build = export_service.build_pdf if format == "pdf" else export_service.build_docx
    content = build(conv, access.space.name)

    filename = f"{_safe_filename(conv.title or 'conversation')}.{format}"
    return Response(
        content=content,
        media_type=_EXPORT_CONTENT_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def update_conversation(
    payload: schemas.ConversationUpdate,
    access: SpaceAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    access.require_write()
    if payload.title is not None:
        access.conversation.title = payload.title
    db.commit()
    db.refresh(access.conversation)
    return access.conversation


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    access: SpaceAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    access.require_write()
    db.delete(access.conversation)
    db.commit()
    return {"ok": True}
