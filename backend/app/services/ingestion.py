"""Indexing queue: documents are indexed one at a time, never all at once.

The database is the queue: every document with status "pending" waits its
turn. A single worker task (started with the app) takes the next one, runs
the pipeline (read -> chunk -> embed -> index) and writes its progress on
the row so the interface can show a progress bar. The order is fair: when
several people drop files at the same time, their documents alternate
instead of one big upload blocking everyone else.

Why one at a time: dropping 20 files used to start 20 ingestions together,
each holding a database connection, which exhausted the pool and made every
other request of the app fail. Nothing here keeps a database session open
across an `await`, and every slow synchronous step runs in a worker thread,
so an ingestion never freezes the rest of the site.

After a restart (deploy, crash), documents left "processing" are put back
in the queue; one that crashes the server twice is marked in error instead
of looping forever.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime

import httpx
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from .. import models
from ..config import UPLOAD_DIR, quota, settings
from ..database import SessionLocal
from . import accounts, backup, document_processor, llm_provider, usage, vectorstore

logger = logging.getLogger("docverse.ingestion")

# A document that was being indexed when the server stopped is retried
# once; if it stops the server again it is put in error.
MAX_ATTEMPTS = 2

# Progress bar ranges (percent) for each stage.
_READ_START, _READ_END = 5, 50
_EMBED_END = 90
_SAVING = 95

# The worker re-checks the queue at least this often, even if a
# notification was missed.
_IDLE_POLL_SECONDS = 5

_loop: asyncio.AbstractEventLoop | None = None
_wakeup: asyncio.Event | None = None
_worker: asyncio.Task | None = None
# uploader id -> turn number of their last indexed document (fair order).
_last_served: dict[str | None, int] = {}
_turn = 0


class IngestionError(Exception):
    """Failure whose message is meant for the user, as is."""


class ScanQuotaExceeded(IngestionError):
    pass


# --- Queue ------------------------------------------------------------------------


def _pending_in_order(db: Session) -> list:
    """Pending documents in the order they will be indexed: oldest first,
    alternating between uploaders (the one served least recently goes
    first)."""
    rows = (
        db.query(models.Document.id, models.Document.uploaded_by, models.Document.created_at)
        .filter(models.Document.status == "pending")
        .order_by(models.Document.created_at, models.Document.id)
        .all()
    )
    by_uploader: dict[str | None, deque] = {}
    for row in rows:
        by_uploader.setdefault(row.uploaded_by, deque()).append(row)

    served = dict(_last_served)
    turn = _turn
    ordered = []
    while by_uploader:
        uploader = min(
            by_uploader,
            key=lambda u: (served.get(u, 0), by_uploader[u][0].created_at or datetime.min),
        )
        queue = by_uploader[uploader]
        ordered.append(queue.popleft())
        if not queue:
            del by_uploader[uploader]
        turn += 1
        served[uploader] = turn
    return ordered


def documents_ahead(db: Session) -> dict[str, int]:
    """document id -> number of documents that will be indexed before it
    (the one being indexed right now included)."""
    in_progress = (
        db.query(func.count(models.Document.id))
        .filter(models.Document.status == "processing")
        .scalar()
        or 0
    )
    return {row.id: index + in_progress for index, row in enumerate(_pending_in_order(db))}


def annotate_queue(db: Session, documents: list[models.Document]) -> list[models.Document]:
    """Fills `queue_position` on the pending documents of a response."""
    if any(d.status == "pending" for d in documents):
        ahead = documents_ahead(db)
        for doc in documents:
            if doc.status == "pending":
                doc.queue_position = ahead.get(doc.id)
    return documents


def notify() -> None:
    """Wakes the worker up (new or retried document). Safe from any thread:
    sync route handlers run in the threadpool, not on the event loop."""
    if _loop is not None and _wakeup is not None and not _loop.is_closed():
        _loop.call_soon_threadsafe(_wakeup.set)


def _claim_next() -> str | None:
    """Marks the next pending document as processing and returns its id."""
    global _turn
    db = SessionLocal()
    try:
        for row in _pending_in_order(db):
            doc = db.get(models.Document, row.id)
            if doc is None or doc.status != "pending":
                continue
            if (doc.ingest_attempts or 0) >= MAX_ATTEMPTS:
                doc.status = "error"
                doc.stage = None
                doc.error_message = (
                    "L'indexation de ce document a été interrompue à plusieurs reprises. "
                    "Il est peut-être trop volumineux ou endommagé : essayez une version plus "
                    "légère, ou cliquez sur Réessayer."
                )
                db.commit()
                continue
            claimed = db.execute(
                update(models.Document)
                .where(models.Document.id == row.id, models.Document.status == "pending")
                .values(
                    status="processing",
                    stage="reading",
                    progress=_READ_START,
                    error_message=None,
                    ingest_attempts=func.coalesce(models.Document.ingest_attempts, 0) + 1,
                )
            ).rowcount
            db.commit()
            if claimed:
                _turn += 1
                _last_served[row.uploaded_by] = _turn
                return row.id
        return None
    finally:
        db.close()


def recover_interrupted() -> int:
    """Startup: documents left "processing" by a stopped server go back to
    the queue. Returns how many were requeued."""
    db = SessionLocal()
    try:
        count = (
            db.query(models.Document)
            .filter(models.Document.status == "processing")
            .update(
                {"status": "pending", "stage": "queued", "progress": 0},
                synchronize_session=False,
            )
        )
        db.commit()
        return count
    finally:
        db.close()


async def _run_worker() -> None:
    assert _wakeup is not None
    while True:
        _wakeup.clear()
        try:
            document_id = await asyncio.to_thread(_claim_next)
        except Exception:  # noqa: BLE001
            logger.exception("File d'indexation : lecture de la file impossible")
            document_id = None
        if document_id is None:
            try:
                await asyncio.wait_for(_wakeup.wait(), timeout=_IDLE_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass
            continue
        # Own task: the usage meter (a ContextVar holding the uploader's
        # API key) can't leak from one document to the next.
        await asyncio.create_task(ingest_document(document_id))


def start() -> None:
    """Starts the worker on the running loop (app startup)."""
    global _loop, _wakeup, _worker
    _loop = asyncio.get_running_loop()
    _wakeup = asyncio.Event()
    requeued = recover_interrupted()
    if requeued:
        logger.warning("File d'indexation : %s document(s) interrompu(s) remis en file", requeued)
    _worker = asyncio.create_task(_run_worker())


async def stop() -> None:
    global _loop, _wakeup, _worker
    if _worker is not None:
        _worker.cancel()
        try:
            await _worker
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
    _loop = _wakeup = _worker = None


# --- Pipeline ---------------------------------------------------------------------


def _write(document_id: str, **values) -> None:
    db = SessionLocal()
    try:
        db.query(models.Document).filter(models.Document.id == document_id).update(
            values, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


class _Progress:
    """Writes the stage / percentage on the row, only when it changes."""

    def __init__(self, document_id: str):
        self.document_id = document_id
        self.last: tuple[str, int] | None = None

    async def set(self, stage: str, percent: int) -> None:
        percent = max(0, min(100, int(percent)))
        if self.last == (stage, percent):
            return
        self.last = (stage, percent)
        await asyncio.to_thread(_write, self.document_id, stage=stage, progress=percent)

    def between(self, stage: str, low: int, high: int):
        async def report(done: int, total: int) -> None:
            if total > 0:
                await self.set(stage, low + (high - low) * done / total)

        return report


def reserve_scanned_pages(user: models.User, pages: int, own_key: bool, db: Session) -> None:
    """Counts the pages the AI is about to read against the uploader's daily
    quota, before any paid call. With their own key there is no platform
    limit (quota 0), only the monthly budget they set themselves."""
    if own_key and usage.own_key_budget_reached(db, user):
        raise ScanQuotaExceeded(
            "Le budget mensuel que vous avez fixé pour votre clé API Mistral est atteint. "
            "Modifiez-le dans vos paramètres pour indexer ce document."
        )
    today = accounts.utc_today()
    if user.scan_day != today:
        user.scan_day = today
        user.scan_pages_today = 0
    limit = quota("scanned_pages_per_day", own_key=own_key)
    if limit and user.scan_pages_today + pages > limit:
        remaining = max(limit - user.scan_pages_today, 0)
        raise ScanQuotaExceeded(
            f"Limite de {limit} pages scannées par jour atteinte (ce document en compte {pages}, "
            f"il en reste {remaining} aujourd'hui). Réessayez demain, ou ajoutez votre propre "
            "clé API Mistral dans vos paramètres pour lever cette limite."
        )
    user.scan_pages_today += pages
    db.commit()


def _reserve_for_document(document_id: str, uploader_id: str, pages: int, own_key: bool) -> None:
    db = SessionLocal()
    try:
        user = db.get(models.User, uploader_id)
        if user is None:
            return
        reserve_scanned_pages(user, pages, own_key, db)
        db.query(models.Document).filter(models.Document.id == document_id).update(
            {"scan_pages_reserved": pages}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _index(space_id: str, document_id: str, name: str, chunks: list[str], embeddings) -> None:
    # A retried document may already have (partial) chunks in the index.
    vectorstore.delete_document(space_id, document_id)
    vectorstore.add_chunks(space_id, document_id, name, chunks, embeddings)


def _finish(document_id: str, meter, *, error: str | None = None, **ready_values) -> bool:
    """Final write (ready or error) plus the AI usage. Returns False when
    the document was deleted in the meantime."""
    db = SessionLocal()
    try:
        doc = db.get(models.Document, document_id)
        if doc is None:
            return False
        if error is None:
            doc.status = "ready"
            doc.stage = None
            doc.progress = 100
            doc.error_message = None
            for key, value in ready_values.items():
                setattr(doc, key, value)
        else:
            doc.status = "error"
            doc.stage = None
            doc.progress = 0
            doc.error_message = error[:500]
        doc.usage_json = usage.summary_json(meter)
        # Calls made before a failure were still billed.
        usage.persist(db, meter, user_id=doc.uploaded_by, space_id=doc.space_id, document_id=doc.id)
        db.commit()
        return True
    finally:
        db.close()


async def ingest_document(document_id: str) -> None:
    """Runs the whole pipeline for one document. Never raises: any failure
    ends up on the row (status="error") with a message the user can act on."""
    db = SessionLocal()
    try:
        doc = db.get(models.Document, document_id)
        if doc is None:
            return
        info = {
            "space_id": doc.space_id,
            "doc_type": doc.doc_type,
            "file_path": doc.file_path,
            "source_url": doc.source_url,
            "uploaded_by": doc.uploaded_by,
            "name": doc.name,
            "scan_reserved": doc.scan_pages_reserved or 0,
        }
        uploader = db.get(models.User, doc.uploaded_by) if doc.uploaded_by else None
        own_key = accounts.own_api_key(uploader)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Echec de l'ingestion du document %s", document_id)
        _safe_mark_error(document_id, friendly_error(exc))
        return
    finally:
        db.close()

    meter = usage.start(own_key)
    progress = _Progress(document_id)
    try:
        file_path = UPLOAD_DIR / info["file_path"] if info["file_path"] else None
        if file_path is not None and not file_path.is_file():
            raise IngestionError(
                "Le fichier est introuvable sur le serveur. Supprimez ce document puis déposez-le à nouveau."
            )
        if not info["scan_reserved"] and info["uploaded_by"]:
            pages = await asyncio.to_thread(
                document_processor.count_scanned_pages, info["doc_type"], file_path
            )
            if pages:
                await asyncio.to_thread(
                    _reserve_for_document, document_id, info["uploaded_by"], pages, own_key is not None
                )

        await progress.set("reading", _READ_START)
        title, text = await document_processor.process_document(
            info["doc_type"],
            file_path=file_path,
            url=info["source_url"],
            on_progress=progress.between("reading", _READ_START, _READ_END),
        )
        name = info["name"]
        if info["doc_type"] == "url":
            name = document_processor.clean_document_name(title) or name

        chunks = await asyncio.to_thread(
            document_processor.split_text, text, settings.chunk_size, settings.chunk_overlap
        )
        if not chunks:
            raise IngestionError(
                "Aucun texte n'a pu être extrait de ce document (fichier vide, ou image sans texte lisible)."
            )

        await progress.set("embedding", _READ_END)
        embeddings = await llm_provider.embed_batch(
            chunks, on_progress=progress.between("embedding", _READ_END, _EMBED_END)
        )

        await progress.set("saving", _SAVING)
        await asyncio.to_thread(_index, info["space_id"], document_id, name, chunks, embeddings)

        still_there = await asyncio.to_thread(
            _finish,
            document_id,
            meter,
            name=name,
            chunk_count=len(chunks),
            preview=text[:400],
        )
        if not still_there:
            # Deleted while being indexed: don't leave its chunks behind.
            await asyncio.to_thread(vectorstore.delete_document, info["space_id"], document_id)
            return
        await asyncio.to_thread(backup.maybe_snapshot, info["space_id"])
    except IngestionError as exc:
        await asyncio.to_thread(_safe_finish_error, document_id, meter, str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Echec de l'ingestion du document %s", document_id)
        await asyncio.to_thread(
            _safe_finish_error, document_id, meter, friendly_error(exc, info["doc_type"], own_key is not None)
        )


def _safe_finish_error(document_id: str, meter, message: str) -> None:
    try:
        _finish(document_id, meter, error=message)
    except Exception:  # noqa: BLE001
        logger.exception("Impossible d'enregistrer l'erreur du document %s", document_id)
        _safe_mark_error(document_id, message)


def _safe_mark_error(document_id: str, message: str) -> None:
    try:
        _write(document_id, status="error", stage=None, progress=0, error_message=message[:500])
    except Exception:  # noqa: BLE001
        logger.exception("Impossible de marquer le document %s en erreur", document_id)


# --- Messages d'erreur ------------------------------------------------------------

_RETRY_LATER = "Réessayez dans quelques minutes."


def _is_mistral(exc: httpx.HTTPError) -> bool:
    try:
        return "mistral" in exc.request.url.host
    except RuntimeError:  # no request attached
        return False


def friendly_error(exc: Exception, doc_type: str | None = None, own_key: bool = False) -> str:
    """Turns a technical failure into a message the user understands and
    can act on. The raw error stays in the logs."""
    if isinstance(exc, IngestionError):
        return str(exc)
    if isinstance(exc, llm_provider.LLMRateLimited):
        return f"Le service d'IA est très sollicité en ce moment. {_RETRY_LATER}"
    if isinstance(exc, llm_provider.LLMNotConfigured):
        return "L'indexation par IA n'est pas disponible pour le moment. Contactez le support."
    if isinstance(exc, document_processor.UnsafeUrlError):
        return f"Ce lien n'a pas pu être importé : {exc}"
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if not _is_mistral(exc):
            return f"La page n'a pas pu être récupérée (le site a répondu avec l'erreur {status})."
        if status in (401, 403):
            if own_key:
                return "Votre clé API Mistral a été refusée. Vérifiez-la dans vos paramètres, puis réessayez."
            return f"Le service d'IA a refusé la demande. {_RETRY_LATER}"
        if status in (400, 413, 422):
            return "Le service d'IA n'a pas pu lire ce document (trop volumineux ou format non pris en charge)."
        return f"Le service d'IA est momentanément indisponible. {_RETRY_LATER}"
    if isinstance(exc, httpx.TimeoutException):
        if doc_type == "url" and not _is_mistral(exc):
            return "Le site de ce lien a mis trop de temps à répondre."
        return f"Le service d'IA a mis trop de temps à répondre. {_RETRY_LATER}"
    if isinstance(exc, httpx.HTTPError):
        if doc_type == "url" and not _is_mistral(exc):
            return "Le site de ce lien est injoignable."
        return f"Impossible de joindre le service d'IA. {_RETRY_LATER}"
    if isinstance(exc, RuntimeError) and "Mistral" in str(exc):
        return f"Le service d'IA est momentanément indisponible. {_RETRY_LATER}"
    if doc_type == "pdf" and type(exc).__module__.split(".")[0] in ("fitz", "pymupdf"):
        return "Ce PDF n'a pas pu être ouvert : il est peut-être endommagé ou protégé par un mot de passe."
    if doc_type == "audio":
        return "Ce fichier audio n'a pas pu être transcrit. Vérifiez qu'il n'est pas endommagé."
    if doc_type == "docx":
        return "Ce fichier Word n'a pas pu être lu. Vérifiez qu'il n'est pas endommagé."
    return (
        "Une erreur inattendue a empêché l'indexation de ce document. "
        "Cliquez sur Réessayer ; si le problème continue, contactez le support."
    )


def reset_for_retry(db: Session, document: models.Document) -> bool:
    """error -> pending (atomically). Returns False if it wasn't in error."""
    changed = db.execute(
        update(models.Document)
        .where(models.Document.id == document.id, models.Document.status == "error")
        .values(status="pending", stage="queued", progress=0, error_message=None, ingest_attempts=0)
    ).rowcount
    db.commit()
    return bool(changed)


__all__ = [
    "IngestionError",
    "ScanQuotaExceeded",
    "annotate_queue",
    "friendly_error",
    "ingest_document",
    "notify",
    "reserve_scanned_pages",
    "reset_for_retry",
    "start",
    "stop",
]
