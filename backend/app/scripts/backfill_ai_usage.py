"""Reconstitue la consommation IA d'avant le suivi des tokens.

Le suivi réel (table ai_usage) n'existe que depuis sa mise en production :
les questions posées et les documents indexés avant ne laissent aucune
trace de coût. Ce script les rejoue « sur le papier » avec l'ancien
fonctionnement, mesuré par le benchmark (backend/benchmark, runs « avant ») :

- question : 3 appels Mistral Large (décision web ~110 tokens, tri des
  extraits ~1 830 tokens, réponse ~2 100 tokens + l'historique de la
  conversation) et 1 appel d'embedding ; la sortie de la réponse est
  estimée à partir de sa longueur réelle (≈ 4 caractères par token) ;
- document : embedding de ses extraits (~300 tokens par extrait) et, pour
  les pages scannées, lecture par Mistral Medium (~1 900 tokens envoyés,
  ~170 reçus par page).

Les lignes créées portent estimated=True. Le script est idempotent : un
message ou un document déjà présent dans ai_usage est ignoré. Il n'ajoute
que des lignes dans ai_usage et ne modifie rien d'autre.

Usage (dans le conteneur backend) :
    python -m app.scripts.backfill_ai_usage            # simulation
    python -m app.scripts.backfill_ai_usage --apply    # écrit en base
"""

import sys
from pathlib import Path

from .. import models
from ..database import SessionLocal
from ..services import usage
from ..services.document_processor import count_scanned_pages

CHAT_MODEL = "mistral-large-latest"
VISION_MODEL = "mistral-medium-latest"
EMBED_MODEL = "mistral-embed"
TOKENS_PER_CHUNK = 300
HISTORY_CAP_TOKENS = 3000


def _tok(text: str) -> int:
    return max(1, len(text or "") // 4)


def _rows_for_question(question: models.Message, answer: models.Message, history_tokens: int) -> list[dict]:
    q = _tok(question.content)
    return [
        dict(kind="embed", model=EMBED_MODEL, prompt_tokens=q, completion_tokens=0),
        dict(kind="classify", model=CHAT_MODEL, prompt_tokens=110 + q, completion_tokens=3),
        dict(kind="rerank", model=CHAT_MODEL, prompt_tokens=1830 + q, completion_tokens=13),
        dict(kind="chat", model=CHAT_MODEL, prompt_tokens=2100 + q + min(history_tokens, HISTORY_CAP_TOKENS),
             completion_tokens=_tok(answer.content)),
    ]


def _rows_for_document(doc: models.Document) -> list[dict]:
    rows = []
    path = Path(doc.file_path) if doc.file_path else None
    pages = 0
    if path and path.exists():
        try:
            pages = count_scanned_pages(doc.doc_type, path)
        except Exception:  # noqa: BLE001 - fichier illisible : pas de pages estimées
            pages = 0
    if pages:
        rows.append(dict(kind="vision", model=VISION_MODEL, prompt_tokens=1900 * pages,
                         completion_tokens=170 * pages))
    if doc.chunk_count:
        rows.append(dict(kind="embed", model=EMBED_MODEL, prompt_tokens=TOKENS_PER_CHUNK * doc.chunk_count,
                         completion_tokens=0))
    return rows


def backfill(db, apply: bool = False) -> dict:
    seen_messages = {m for (m,) in db.query(models.AIUsage.message_id).filter(models.AIUsage.message_id.isnot(None))}
    seen_docs = {d for (d,) in db.query(models.AIUsage.document_id).filter(models.AIUsage.document_id.isnot(None))}
    owners = dict(db.query(models.Space.id, models.Space.owner_id).all())
    new: list[models.AIUsage] = []

    def add(rows, *, created_at, user_id, space_id, conversation_id=None, message_id=None, document_id=None):
        for r in rows:
            new.append(models.AIUsage(
                user_id=user_id, space_id=space_id, conversation_id=conversation_id, message_id=message_id,
                document_id=document_id, own_key=False, estimated=True, cached_tokens=0, pages=0,
                cost_usd=usage.cost_usd(r["model"], r["prompt_tokens"], r["completion_tokens"]),
                created_at=created_at, **r,
            ))

    questions = 0
    for conv in db.query(models.Conversation).all():
        msgs = sorted(conv.messages, key=lambda m: m.created_at)
        history = 0
        for i, msg in enumerate(msgs):
            if msg.role == "assistant" and i > 0 and msgs[i - 1].role == "user" and msg.id not in seen_messages:
                add(_rows_for_question(msgs[i - 1], msg, history), created_at=msg.created_at,
                    user_id=owners.get(conv.space_id), space_id=conv.space_id, conversation_id=conv.id,
                    message_id=msg.id)
                questions += 1
            history += _tok(msg.content)

    documents = 0
    for doc in db.query(models.Document).filter(models.Document.status == "ready").all():
        if doc.id in seen_docs:
            continue
        rows = _rows_for_document(doc)
        if rows:
            add(rows, created_at=doc.created_at, user_id=doc.uploaded_by or owners.get(doc.space_id),
                space_id=doc.space_id, document_id=doc.id)
            documents += 1

    report = {"questions": questions, "documents": documents, "rows": len(new),
              "cost_usd": round(sum(r.cost_usd for r in new), 6)}
    if apply and new:
        db.add_all(new)
        db.commit()
    return report


def main() -> None:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    try:
        report = backfill(db, apply=apply)
    finally:
        db.close()
    mode = "écrit en base" if apply else "simulation (ajoutez --apply pour écrire)"
    print(f"{report['questions']} questions et {report['documents']} documents -> {report['rows']} lignes, "
          f"coût estimé {report['cost_usd']} $ [{mode}]")


if __name__ == "__main__":
    main()
