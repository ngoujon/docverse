import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db, SessionLocal
from ..deps import ConversationAccess, require_conversation_access, client_ip
from ..services import backup, llm_provider, queue_manager, rag, rate_limiter

logger = logging.getLogger("hyaides.chat")
router = APIRouter(prefix="/api", tags=["chat"])

_HISTORY_LIMIT = 20


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    payload: schemas.ChatRequest,
    request: Request,
    access: ConversationAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    rate_limiter.enforce(rate_limiter.chat_limiter, client_ip(request), "Trop de messages envoyes, patientez un instant")

    conv = access.conversation
    conversation_id = conv.id
    space = db.get(models_db.Space, conv.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")

    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(400, "Message vide")

    # Trust nothing from the client about which documents it's allowed to
    # scope retrieval to - drop any id that isn't actually in this space,
    # otherwise a crafted doc_id could pull chunks from a space this user
    # has no access to.
    doc_ids = payload.doc_ids
    if doc_ids:
        valid_ids = {
            row[0]
            for row in db.query(models_db.Document.id).filter(
                models_db.Document.space_id == conv.space_id,
                models_db.Document.id.in_(doc_ids),
            )
        }
        doc_ids = [d for d in doc_ids if d in valid_ids]

    history = [
        {"role": m.role, "content": m.content} for m in conv.messages[-_HISTORY_LIMIT:]
    ]
    is_first_message = len(conv.messages) == 0

    user_msg = models_db.Message(
        conversation_id=conversation_id, role="user", content=user_message
    )
    db.add(user_msg)

    if is_first_message:
        conv.title = user_message[:60] + ("…" if len(user_message) > 60 else "")

    db.commit()

    # Extract plain values while the request-scoped session is still open:
    # the ORM objects themselves become unusable once this session is
    # closed (which happens before the streaming generator below runs).
    user_msg_id = user_msg.id
    space_id = space.id
    space_name = space.name

    async def event_stream():
        yield _sse({"type": "user_message_id", "id": user_msg_id})
        if queue_manager.is_busy():
            waiting = await queue_manager.waiting_count()
            yield _sse({"type": "queued", "position": waiting + 1})
        full_text = ""
        sources: list[dict] = []
        saved_id: str | None = None
        saved = False

        def persist() -> str | None:
            # Called both on normal completion and from the outer `finally`
            # (which also runs if the client disconnects mid-stream, e.g. a
            # tab closed or reloaded before generation finished) so a
            # partial-or-full answer is never silently lost.
            nonlocal saved, saved_id
            if saved or not full_text.strip():
                return saved_id
            saved = True
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
                    conv_row.updated_at = datetime.utcnow()
                save_db.commit()
                save_db.refresh(assistant_msg)
                saved_id = assistant_msg.id
                # Fire-and-forget: opportunistic daily snapshot, throttled
                # and pruned inside backup.maybe_snapshot itself. Runs in a
                # thread so the (blocking) file/DB work never stalls the
                # response stream.
                asyncio.get_event_loop().run_in_executor(
                    None, backup.maybe_snapshot, space_id
                )
                return saved_id
            finally:
                save_db.close()

        try:
            try:
                context_block, sources = await rag.gather_context(space_id, user_message, doc_ids)
                messages = rag.build_llm_messages(
                    space_name, history, context_block, user_message
                )
                async for token in llm_provider.chat_stream(messages):
                    full_text += token
                    yield _sse({"type": "token", "content": token})
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erreur pendant la generation de la reponse")
                error_text = (
                    "\n\n*Une erreur est survenue pendant la generation "
                    f"({exc}). Le service d'IA est momentanement "
                    "indisponible, reessayez dans quelques instants.*"
                )
                full_text += error_text
                yield _sse({"type": "token", "content": error_text})

            message_id = persist()
            yield _sse({"type": "done", "message_id": message_id, "sources": sources})
        finally:
            # No-op if `persist()` above already ran; saves whatever was
            # generated so far if we get here via cancellation instead.
            persist()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
