"""Documents of a space: listing, file upload / URL ingestion (queued, then
indexed one at a time by services/ingestion.py: extract -> chunk -> embed ->
index), retry after a failure, renaming, viewing and deletion."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import UPLOAD_DIR, quota, settings
from ..database import get_db
from ..deps import SpaceAccess, require_document_access, require_space_access
from ..services import accounts, auth, document_processor, ingestion, vectorstore

logger = logging.getLogger("docverse.documents")
router = APIRouter(prefix="/api", tags=["documents"])


@router.get("/spaces/{space_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(
    access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)
):
    documents = (
        db.query(models.Document)
        .filter(models.Document.space_id == access.space.id)
        .order_by(models.Document.created_at.desc())
        .all()
    )
    return ingestion.annotate_queue(db, documents)


@router.post("/spaces/{space_id}/documents/upload", response_model=schemas.DocumentOut)
async def upload_document(
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
            400, "Le contenu du fichier ne correspond pas à son extension"
        )

    storage_limit = quota("storage_bytes", own_key=accounts.has_own_key(space.owner))
    if accounts.storage_bytes(db, [space.id]) + len(content) > storage_limit:
        limit_mb = storage_limit // (1024 * 1024)
        raise HTTPException(
            400,
            f"Limite de stockage de {limit_mb} Mo atteinte pour cet espace",
        )

    # The file is written before the row exists: the indexing worker may
    # pick a "pending" document up the instant it is committed.
    doc_id = models.gen_id()
    (UPLOAD_DIR / space.id).mkdir(parents=True, exist_ok=True)
    relative_path = f"{space.id}/{doc_id}_{file.filename}"
    (UPLOAD_DIR / relative_path).write_bytes(content)

    doc = models.Document(
        id=doc_id,
        space_id=space.id,
        name=document_processor.clean_document_name(file.filename) or "document",
        doc_type=doc_type,
        status="pending",
        stage="queued",
        progress=0,
        size_bytes=len(content),
        file_path=relative_path,
        uploaded_by=access.user.id if access.user else None,
    )
    db.add(doc)
    try:
        db.commit()
    except Exception:
        (UPLOAD_DIR / relative_path).unlink(missing_ok=True)
        raise
    db.refresh(doc)

    ingestion.notify()
    ingestion.annotate_queue(db, [doc])
    return doc


@router.post("/spaces/{space_id}/documents/url", response_model=schemas.DocumentOut)
def ingest_url(
    payload: schemas.UrlIngestRequest,
    access: SpaceAccess = Depends(require_space_access),
    db: Session = Depends(get_db),
):
    access.require_upload()
    doc = models.Document(
        space_id=access.space.id,
        name=document_processor.clean_document_name(payload.url) or "lien",
        doc_type="url",
        source_url=payload.url,
        status="pending",
        stage="queued",
        progress=0,
        uploaded_by=access.user.id if access.user else None,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    ingestion.notify()
    ingestion.annotate_queue(db, [doc])
    return doc


@router.post("/documents/{document_id}/retry", response_model=schemas.DocumentOut)
def retry_document(
    access: SpaceAccess = Depends(require_document_access),
    db: Session = Depends(get_db),
):
    """Puts a document that failed back in the indexing queue."""
    access.require_upload()
    doc = access.document
    if not ingestion.reset_for_retry(db, doc):
        raise HTTPException(409, "Ce document n'est pas en erreur : il est déjà indexé ou en cours d'indexation")
    db.refresh(doc)
    ingestion.notify()
    ingestion.annotate_queue(db, [doc])
    return doc


@router.patch("/documents/{document_id}", response_model=schemas.DocumentOut)
def rename_document(
    payload: schemas.DocumentRename,
    access: SpaceAccess = Depends(require_document_access),
    db: Session = Depends(get_db),
):
    """Changes only the display name: the stored file, its path and the
    indexed text are left as they are."""
    access.require_rename()
    doc = access.document
    if doc.status in ("pending", "processing"):
        # The ingestion task would write the old name into the index.
        raise HTTPException(409, "Ce document est en cours d'indexation, réessayez dans un instant")
    name = document_processor.clean_document_name(payload.name)
    if not name:
        raise HTTPException(400, "Le nom du document ne peut pas être vide")
    if name != doc.name:
        # Index first: if it fails, the name stays unchanged everywhere.
        try:
            vectorstore.rename_document(doc.space_id, doc.id, name)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Echec du renommage du document %s dans l'index", doc.id)
            raise HTTPException(500, "Le renommage a échoué, réessayez") from exc
        doc.name = name
        db.commit()
        db.refresh(doc)
    return doc


_VIEW_TOKEN_PURPOSE = "document_view"
_VIEW_TOKEN_TTL_MINUTES = 5


@router.post("/documents/{document_id}/view-link", response_model=schemas.DocumentViewLinkOut)
def document_view_link(access: SpaceAccess = Depends(require_document_access)):
    """A browser tab can't send the Authorization header, so the viewer
    opens a short-lived link instead. Access to the space is checked here;
    the token only ever opens this one document."""
    doc = access.document
    if not doc.file_path:
        raise HTTPException(404, "Aucun fichier à afficher pour ce document")
    token = auth.issue_purpose_token(doc.id, _VIEW_TOKEN_PURPOSE, _VIEW_TOKEN_TTL_MINUTES)
    return {"url": f"/api/documents/{doc.id}/file?token={token}"}


@router.get("/documents/{document_id}/file")
def document_file(document_id: str, token: str, db: Session = Depends(get_db)):
    if auth.verify_purpose_token(token, _VIEW_TOKEN_PURPOSE) != document_id:
        raise HTTPException(403, "Lien expiré ou invalide - rouvrez le document depuis l'espace")
    doc = db.get(models.Document, document_id)
    if not doc or not doc.file_path:
        raise HTTPException(404, "Document introuvable")
    # The file must sit in its own space's folder, whatever the stored path says.
    space_dir = (UPLOAD_DIR / doc.space_id).resolve()
    path = (UPLOAD_DIR / doc.file_path).resolve()
    if not path.is_relative_to(space_dir) or not path.is_file():
        raise HTTPException(404, "Fichier introuvable")
    media_type, inline = document_processor.viewer_media_type(path.name)
    filename = doc.name if doc.name.lower().endswith(path.suffix.lower()) else f"{doc.name}{path.suffix}"
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="inline" if inline else "attachment",
    )


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
