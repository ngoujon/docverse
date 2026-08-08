import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db

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
def list_conversations(space_id: str, db: Session = Depends(get_db)):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    convs = (
        db.query(models_db.Conversation)
        .filter(models_db.Conversation.space_id == space_id)
        .order_by(models_db.Conversation.updated_at.desc())
        .all()
    )
    return convs


@router.post("/spaces/{space_id}/conversations", response_model=schemas.ConversationOut)
def create_conversation(
    space_id: str, payload: schemas.ConversationCreate, db: Session = Depends(get_db)
):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    conv = models_db.Conversation(space_id=space_id, title=payload.title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    return conv


@router.get(
    "/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut]
)
def list_messages(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    return [_msg_out(m) for m in conv.messages]


@router.patch("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
def update_conversation(
    conversation_id: str, payload: schemas.ConversationUpdate, db: Session = Depends(get_db)
):
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    if payload.title is not None:
        conv.title = payload.title
    if payload.web_search_enabled is not None:
        conv.web_search_enabled = payload.web_search_enabled
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    db.delete(conv)
    db.commit()
    return {"ok": True}
