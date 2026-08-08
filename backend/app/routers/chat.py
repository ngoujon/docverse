import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db, SessionLocal
from ..services import ollama_client, rag

logger = logging.getLogger("open-rag.chat")
router = APIRouter(prefix="/api", tags=["chat"])

_HISTORY_LIMIT = 20


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    conversation_id: str, payload: schemas.ChatRequest, db: Session = Depends(get_db)
):
    conv = db.get(models_db.Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    space = db.get(models_db.Space, conv.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")

    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(400, "Message vide")

    history = [
        {"role": m.role, "content": m.content} for m in conv.messages[-_HISTORY_LIMIT:]
    ]
    is_first_message = len(conv.messages) == 0

    user_msg = models_db.Message(
        conversation_id=conversation_id, role="user", content=user_message
    )
    db.add(user_msg)

    conv.web_search_enabled = payload.web_search
    if is_first_message:
        conv.title = user_message[:60] + ("…" if len(user_message) > 60 else "")

    db.commit()

    space_id = space.id
    space_name = space.name

    async def event_stream():
        yield _sse({"type": "user_message_id", "id": user_msg.id})
        full_text = ""
        sources: list[dict] = []
        try:
            context_block, sources = await rag.gather_context(
                space_id, user_message, payload.web_search
            )
            messages = rag.build_llm_messages(
                space_name, history, context_block, user_message
            )
            async for token in ollama_client.chat_stream(messages):
                full_text += token
                yield _sse({"type": "token", "content": token})
        except Exception as exc:  # noqa: BLE001
            logger.exception("Erreur pendant la generation de la reponse")
            error_text = (
                "\n\n*Une erreur est survenue pendant la generation "
                f"({exc}). Verifiez qu'Ollama est bien demarre et que les "
                "modeles sont telecharges.*"
            )
            full_text += error_text
            yield _sse({"type": "token", "content": error_text})

        save_db = SessionLocal()
        try:
            assistant_msg = models_db.Message(
                conversation_id=conversation_id,
                role="assistant",
                content=full_text,
                sources_json=json.dumps(sources, ensure_ascii=False),
            )
            save_db.add(assistant_msg)
            conv_row = save_db.get(models_db.Conversation, conversation_id)
            if conv_row:
                from datetime import datetime

                conv_row.updated_at = datetime.utcnow()
            save_db.commit()
            save_db.refresh(assistant_msg)
            yield _sse(
                {
                    "type": "done",
                    "message_id": assistant_msg.id,
                    "sources": sources,
                }
            )
        finally:
            save_db.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
