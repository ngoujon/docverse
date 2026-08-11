import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db
from ..deps import ConversationAccess, SpaceAccess, require_conversation_access, require_space_access
from ..services import export as export_service

router = APIRouter(prefix="/api", tags=["conversations"])

_EXPORT_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _msg_out(m: models_db.Message) -> schemas.MessageOut:
    return schemas.MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,
        content=m.content,
        sources=json.loads(m.sources_json or "[]"),
        created_at=m.created_at,
    )


@router.get("/spaces/{space_id}/conversations", response_model=list[schemas.ConversationOut])
def list_conversations(
    access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)
):
    convs = (
        db.query(models_db.Conversation)
        .filter(models_db.Conversation.space_id == access.space.id)
        .order_by(models_db.Conversation.updated_at.desc())
        .all()
    )
    return convs


@router.post("/spaces/{space_id}/conversations", response_model=schemas.ConversationOut)
def create_conversation(
    payload: schemas.ConversationCreate,
    access: SpaceAccess = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    conv = models_db.Conversation(space_id=access.space.id, title=payload.title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def get_conversation(access: ConversationAccess = Depends(require_conversation_access)):
    return access.conversation


@router.get(
    "/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut]
)
def list_messages(access: ConversationAccess = Depends(require_conversation_access)):
    return [_msg_out(m) for m in access.conversation.messages]


def _safe_filename(title: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in " -_" else "" for c in title).strip()
    return (cleaned or "conversation")[:80]


@router.get("/conversations/{conversation_id}/export")
def export_conversation(
    format: str = "pdf",
    access: ConversationAccess = Depends(require_conversation_access),
):
    if format not in _EXPORT_CONTENT_TYPES:
        raise HTTPException(400, "Format d'export non supporte (pdf ou docx)")

    conv = access.conversation
    space_name = conv.space.name if conv.space else ""
    if format == "pdf":
        content = export_service.build_pdf(conv, space_name)
    else:
        content = export_service.build_docx(conv, space_name)

    filename = f"{_safe_filename(conv.title or 'conversation')}.{format}"
    return Response(
        content=content,
        media_type=_EXPORT_CONTENT_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def update_conversation(
    payload: schemas.ConversationUpdate,
    access: ConversationAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    if payload.title is not None:
        access.conversation.title = payload.title
    db.commit()
    db.refresh(access.conversation)
    return access.conversation


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    access: ConversationAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    db.delete(access.conversation)
    db.commit()
    return {"ok": True}
