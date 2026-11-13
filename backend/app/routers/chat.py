"""Workspace chat: answers a question from the space's documents (RAG) and
streams the reply token by token over Server-Sent Events."""

import asyncio
import json
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import quota, settings
from ..database import SessionLocal, get_db
from ..deps import SpaceAccess, client_ip, require_conversation_access
from ..services import accounts, backup, llm_provider, rag, rate_limiter, usage

logger = logging.getLogger("docverse.chat")
router = APIRouter(prefix="/api", tags=["chat"])

def _consume_daily_message(user: models.User, db: Session, own_key: bool) -> None:
    """Counts one AI question against the account's daily quota
    (config.FREE_QUOTAS["messages_per_day"]), or refuses it with a 429
    once the quota is used up. The service is free, so this - not a
    bill - is what keeps one account from running up the LLM cost for
    everyone; unlike the per-IP chat_limiter it survives IP rotation and
    restarts because it lives in the database.

    With their own Mistral key, the platform quota no longer applies: only
    the limits the user set for themselves (questions per day, monthly
    budget) do, since the bill is theirs."""
    today = accounts.utc_today()
    if user.messages_day != today:
        user.messages_day = today
        user.messages_today = 0
    if own_key:
        limit = user.own_key_daily_messages or 0
        if usage.own_key_budget_reached(db, user):
            raise HTTPException(
                429,
                "Le budget mensuel que vous avez fixé pour votre clé API Mistral est atteint "
                "(modifiable dans vos paramètres)",
            )
        if limit and user.messages_today >= limit:
            raise HTTPException(
                429,
                f"Vous avez atteint la limite de {limit} questions par jour que vous avez fixée "
                "pour votre clé API (modifiable dans vos paramètres)",
            )
    else:
        limit = quota("messages_per_day")
        if user.messages_today >= limit:
            raise HTTPException(
                429,
                f"Limite de {limit} questions par jour atteinte pour votre compte, réessayez demain "
                "(ou ajoutez votre propre clé API Mistral dans vos paramètres)",
            )
    user.messages_today += 1


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    payload: schemas.ChatRequest,
    request: Request,
    access: SpaceAccess = Depends(require_conversation_access),
    db: Session = Depends(get_db),
):
    access.require_write()
    rate_limiter.enforce(rate_limiter.chat_limiter, client_ip(request), "Trop de messages envoyés, patientez un instant")

    conv = access.conversation
    conversation_id = conv.id
    space = access.space

    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(400, "Message vide")

    # Charged to whoever asks; a share-link visitor always has an account
    # (see deps._resolve_role), but fall back to the space owner anyway.
    quota_user = access.user or db.get(models.User, space.owner_id)
    own_key = accounts.own_api_key(quota_user)
    if quota_user:
        _consume_daily_message(quota_user, db, own_key is not None)
    quota_user_id = quota_user.id if quota_user else None

    # Trust nothing from the client about which documents it's allowed to
    # scope retrieval to - drop any id that isn't actually in this space,
    # otherwise a crafted doc_id could pull chunks from a space this user
    # has no access to.
    doc_ids = payload.doc_ids
    if doc_ids:
        valid_ids = {
            row[0]
            for row in db.query(models.Document.id).filter(
                models.Document.space_id == conv.space_id,
                models.Document.id.in_(doc_ids),
            )
        }
        doc_ids = [d for d in doc_ids if d in valid_ids]

    history = rag.trim_history(
        [{"role": m.role, "content": m.content} for m in conv.messages],
        settings.own_key_history_limit if own_key else settings.chat_history_limit,
        settings.chat_history_max_chars,
    )
    is_first_message = len(conv.messages) == 0

    user_msg = models.Message(
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
    space_documents = [
        {"id": d_id, "name": d_name}
        for d_id, d_name in db.query(models.Document.id, models.Document.name)
        .filter(models.Document.space_id == space_id, models.Document.status == "ready")
        .order_by(models.Document.created_at)
    ]

    async def event_stream():
        # Opened inside the generator: it's what runs the AI calls, in the
        # streaming task's own context.
        meter = usage.start(own_key)
        yield llm_provider.sse_event({"type": "user_message_id", "id": user_msg_id})
        if llm_provider.is_busy():
            waiting = await llm_provider.waiting_count()
            yield llm_provider.sse_event({"type": "queued", "position": waiting + 1})
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
                assistant_msg = models.Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_text,
                    sources_json=json.dumps(sources, ensure_ascii=False),
                    usage_json=usage.summary_json(meter),
                )
                save_db.add(assistant_msg)
                save_db.flush()
                usage.persist(
                    save_db, meter, user_id=quota_user_id, space_id=space_id,
                    conversation_id=conversation_id, message_id=assistant_msg.id,
                )
                conv_row = save_db.get(models.Conversation, conversation_id)
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
                context_block, sources = await rag.gather_context(
                    space_id, user_message, doc_ids, documents=space_documents
                )
                messages = rag.build_llm_messages(
                    space_name, history, context_block, user_message, documents=space_documents
                )
                async for token in llm_provider.chat_stream(messages):
                    full_text += token
                    yield llm_provider.sse_event({"type": "token", "content": token})
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erreur pendant la generation de la reponse")
                if own_key and isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 401:
                    detail = "votre clé API Mistral a été refusée, vérifiez-la dans vos paramètres"
                else:
                    detail = str(exc)
                error_text = (
                    "\n\n*Une erreur est survenue pendant la génération "
                    f"({detail}). Le service d'IA est momentanément "
                    "indisponible, réessayez dans quelques instants.*"
                )
                full_text += error_text
                yield llm_provider.sse_event({"type": "token", "content": error_text})

            message_id = persist()
            yield llm_provider.sse_event({
                "type": "done", "message_id": message_id, "sources": sources, "usage": meter.summary(),
            })
        finally:
            # No-op if `persist()` above already ran; saves whatever was
            # generated so far if we get here via cancellation instead.
            persist()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
