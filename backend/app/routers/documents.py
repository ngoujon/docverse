import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import UPLOAD_DIR, settings
from ..database import get_db, SessionLocal
from ..deps import DocumentAccess, SpaceAccess, require_space_access, require_document_access
from ..services import document_processor, ollama_client, vectorstore
from ..utils.chunking import split_text

logger = logging.getLogger("open-rag.documents")
router = APIRouter(prefix="/api", tags=["documents"])


@router.get("/spaces/{space_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(
    access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)
):
    docs = (
        db.query(models_db.Document)
        .filter(models_db.Document.space_id == access.space.id)
        .order_by(models_db.Document.created_at.desc())
        .all()
    )
    return docs


async def _ingest(document_id: str) -> None:
    db = SessionLocal()
    try:
        doc = db.get(models_db.Document, document_id)
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

            chunks = split_text(text, settings.chunk_size, settings.chunk_overlap)
            if not chunks:
                doc.status = "error"
                doc.error_message = "Aucun contenu exploitable n'a ete extrait de ce document."
                db.commit()
                return

            embeddings = []
            for chunk in chunks:
                embeddings.append(await ollama_client.embed(chunk))

            vectorstore.add_chunks(doc.space_id, doc.id, doc.name, chunks, embeddings)

            doc.status = "ready"
            doc.chunk_count = len(chunks)
            doc.preview = text[:400]
            doc.error_message = None
            db.commit()
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
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    space = access.space
    try:
        doc_type = document_processor.guess_doc_type(file.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    max_bytes = settings.max_upload_mb * 1024 * 1024
    chunk_size = 1024 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(400, f"Fichier trop volumineux (max {settings.max_upload_mb} Mo)")
        chunks.append(chunk)
    content = b"".join(chunks)

    doc = models_db.Document(
        space_id=space.id,
        name=file.filename,
        doc_type=doc_type,
        status="pending",
        size_bytes=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    space_dir = UPLOAD_DIR / space.id
    space_dir.mkdir(parents=True, exist_ok=True)
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
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    doc = models_db.Document(
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
    access: DocumentAccess = Depends(require_document_access),
    db: Session = Depends(get_db),
):
    if not access.can_write:
        raise HTTPException(403, "Acces en lecture seule a cet espace")
    doc = access.document
    vectorstore.delete_document(doc.space_id, doc.id)
    if doc.file_path:
        path = UPLOAD_DIR / doc.file_path
        if path.exists():
            path.unlink()

    db.delete(doc)
    db.commit()
    return {"ok": True}
