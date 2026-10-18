"""Documents of a space: listing, file upload / URL ingestion (processed in
a background task: extract -> chunk -> embed -> index) and deletion."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import UPLOAD_DIR, quota, settings
from ..database import SessionLocal, get_db
from ..deps import SpaceAccess, require_document_access, require_space_access
from ..services import accounts, backup, document_processor, llm_provider, vectorstore

logger = logging.getLogger("docverse.documents")
router = APIRouter(prefix="/api", tags=["documents"])


@router.get("/spaces/{space_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(
    access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)
):
    return (
        db.query(models.Document)
        .filter(models.Document.space_id == access.space.id)
        .order_by(models.Document.created_at.desc())
        .all()
    )


async def _ingest(document_id: str) -> None:
    """Background pipeline for one document; any failure is stored on the
    row (status="error") so the UI can show it instead of spinning forever."""
    db = SessionLocal()
    try:
        doc = db.get(models.Document, document_id)
        if not doc:
            return
        doc.status = "processing"
        db.commit()

        try:
            file_path = UPLOAD_DIR / doc.file_path if doc.file_path else None
            title, text = await document_processor.process_document(
                doc.doc_type,
                file_path=file_path,
                url=doc.source_url,
            )
            if doc.doc_type == "url":
                doc.name = title or doc.name

            chunks = document_processor.split_text(text, settings.chunk_size, settings.chunk_overlap)
            if not chunks:
                doc.status = "error"
                doc.error_message = "Aucun contenu exploitable n'a ete extrait de ce document."
                db.commit()
                return

            # Un seul appel par lot de chunks : l'API Mistral vectorise
            # plusieurs textes a la fois, la ou l'ancien Ollama local
            # imposait une requete par chunk.
            embeddings = await llm_provider.embed_batch(chunks)

            vectorstore.add_chunks(doc.space_id, doc.id, doc.name, chunks, embeddings)

            doc.status = "ready"
            doc.chunk_count = len(chunks)
            doc.preview = text[:400]
            doc.error_message = None
            db.commit()
            # Already running in a background task, so a blocking snapshot
            # call here doesn't stall any request/response.
            backup.maybe_snapshot(doc.space_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Echec de l'ingestion du document %s", document_id)
            doc.status = "error"
            doc.error_message = str(exc)[:500]
            db.commit()
    finally:
        db.close()


@router.post("/spaces/{space_id}/documents/upload", response_model=schemas.DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    access: SpaceAccess = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    access.require_upload()
    space = access.space
    try:
        doc_type = document_processor.guess_doc_type(file.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # Read in 1 MiB slices so an oversized upload is rejected as soon as it
    # crosses the limit, without buffering the whole thing first.
    max_bytes = settings.max_upload_mb * 1024 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(400, f"Fichier trop volumineux (max {settings.max_upload_mb} Mo)")
        chunks.append(chunk)
    content = b"".join(chunks)

    if not document_processor.content_matches_type(doc_type, content):
        raise HTTPException(
            400, "Le contenu du fichier ne correspond pas a son extension"
        )

    storage_limit = quota("storage_bytes")
    if accounts.storage_bytes(db, [space.id]) + len(content) > storage_limit:
        limit_mb = storage_limit // (1024 * 1024)
        raise HTTPException(
            400,
            f"Limite de stockage de {limit_mb} Mo atteinte pour cet espace",
        )

    doc = models.Document(
        space_id=space.id,
        name=file.filename,
        doc_type=doc_type,
        status="pending",
        size_bytes=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    (UPLOAD_DIR / space.id).mkdir(parents=True, exist_ok=True)
    relative_path = f"{space.id}/{doc.id}_{file.filename}"
    (UPLOAD_DIR / relative_path).write_bytes(content)
    doc.file_path = relative_path
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_ingest, doc.id)
    return doc


@router.post("/spaces/{space_id}/documents/url", response_model=schemas.DocumentOut)
def ingest_url(
    payload: schemas.UrlIngestRequest,
    background_tasks: BackgroundTasks,
    access: SpaceAccess = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    access.require_upload()
    doc = models.Document(
        space_id=access.space.id,
        name=payload.url,
        doc_type="url",
        source_url=payload.url,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_ingest, doc.id)
    return doc


@router.delete("/documents/{document_id}")
def delete_document(
    access: SpaceAccess = Depends(require_document_access),
    db: Session = Depends(get_db),
):
    access.require_upload()
    doc = access.document
    vectorstore.delete_document(doc.space_id, doc.id)
    if doc.file_path:
        (UPLOAD_DIR / doc.file_path).unlink(missing_ok=True)

    db.delete(doc)
    db.commit()
    return {"ok": True}
