import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db
from ..deps import require_conversation_access, require_space_access

router = APIRouter(prefix="/api", tags=["conversations"])


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
    space: models_db.Space = Depends(require_space_access), db: Session = Depends(get_db)
):
    convs = (
        db.query(models_db.Conversation)
        .filter(models_db.Conversation.space_id == space.id)
        .order_by(models_db.Conversation.updated_at.desc())
        .all()
    )
    return convs


@router.post("/spaces/{space_id}/conversations", response_model=schemas.ConversationOut)
def create_conversation(
    payload: schemas.ConversationCreate,
    space: models_db.Space = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    conv = models_db.Conversation(space_id=space.id, title=payload.title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def get_conversation(conv: models_db.Conversation = Depends(require_conversation_access)):
    return conv


@router.get(
    "/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut]
)
def list_messages(conv: models_db.Conversation = Depends(require_conversation_access)):
    return [_msg_out(m) for m in conv.messages]


@router.patch("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def update_conversation(
    payload: schemas.ConversationUpdate,
    conv: models_db.Conversation = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    if payload.title is not None:
        conv.title = payload.title
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conv: models_db.Conversation = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    db.delete(conv)
    db.commit()
    return {"ok": True}
