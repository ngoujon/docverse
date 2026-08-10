"""Per-space snapshots: a point-in-time copy of one space's SQL rows,
vector store, and uploaded files, kept for a rolling 7 days so an admin
can restore after a mistake or data problem - without touching any other
space. Snapshots are opportunistic (triggered by actual activity, at most
once per day per space) rather than a fixed-interval cron, so idle spaces
never waste disk space.

Layout on disk: BACKUP_DIR/{space_id}/{snapshot_id}/data.json + uploads/
"""

import json
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from ..config import BACKUP_DIR, UPLOAD_DIR
from ..database import SessionLocal
from .. import models_db
from . import vectorstore

logger = logging.getLogger("open-rag.backup")

_SNAPSHOT_INTERVAL = timedelta(hours=24)
_RETENTION = timedelta(days=7)


def _dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _serialize_space(db, space_id: str) -> dict | None:
    space = db.get(models_db.Space, space_id)
    if not space:
        return None
    conversations = (
        db.query(models_db.Conversation).filter_by(space_id=space_id).all()
    )
    conv_ids = [c.id for c in conversations]
    messages = (
        db.query(models_db.Message)
        .filter(models_db.Message.conversation_id.in_(conv_ids))
        .all()
        if conv_ids
        else []
    )
    documents = db.query(models_db.Document).filter_by(space_id=space_id).all()

    return {
        "space": {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "color": space.color,
            "owner_id": space.owner_id,
            "created_at": space.created_at.isoformat() if space.created_at else None,
        },
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ],
        "messages": [
            {
                "id": m.id,
                "conversation_id": m.conversation_id,
                "role": m.role,
                "content": m.content,
                "sources_json": m.sources_json,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
        "documents": [
            {
                "id": d.id,
                "name": d.name,
                "doc_type": d.doc_type,
                "source_url": d.source_url,
                "file_path": d.file_path,
                "status": d.status,
                "error_message": d.error_message,
                "chunk_count": d.chunk_count,
                "preview": d.preview,
                "size_bytes": d.size_bytes,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in documents
        ],
    }


def create_snapshot(space_id: str, force: bool = False) -> str | None:
    """Creates a snapshot now, unless one was already made within the last
    24h for this space and `force` isn't set. Returns the new snapshot id,
    or None if skipped/the space doesn't exist. Synchronous/blocking by
    design - callers run it via a background task."""
    db = SessionLocal()
    try:
        if not force:
            latest = (
                db.query(models_db.SpaceSnapshot)
                .filter_by(space_id=space_id)
                .order_by(models_db.SpaceSnapshot.created_at.desc())
                .first()
            )
            if latest and datetime.utcnow() - latest.created_at < _SNAPSHOT_INTERVAL:
                return None

        payload = _serialize_space(db, space_id)
        if payload is None:
            return None

        vectors = vectorstore.get_all(space_id)
        # numpy arrays (embeddings) aren't JSON-serializable as-is.
        payload["vectors"] = {
            "ids": list(vectors["ids"]),
            "embeddings": [list(map(float, e)) for e in vectors["embeddings"]],
            "documents": list(vectors["documents"]),
            "metadatas": list(vectors["metadatas"]),
        }

        snapshot_id = models_db.gen_id()
        snapshot_dir = BACKUP_DIR / space_id / snapshot_id
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        (snapshot_dir / "data.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )

        source_uploads = UPLOAD_DIR / space_id
        if source_uploads.exists():
            shutil.copytree(source_uploads, snapshot_dir / "uploads")

        size = _dir_size(snapshot_dir)
        row = models_db.SpaceSnapshot(
            id=snapshot_id,
            space_id=space_id,
            size_bytes=size,
            conversation_count=len(payload["conversations"]),
            document_count=len(payload["documents"]),
            path=f"{space_id}/{snapshot_id}",
        )
        db.add(row)
        db.commit()
        logger.info(
            "Snapshot cree pour l'espace %s (%s, %d octets)", space_id, snapshot_id, size
        )
        _prune(db, space_id)
        return snapshot_id
    except Exception:
        logger.exception("Echec de la creation du snapshot pour l'espace %s", space_id)
        return None
    finally:
        db.close()


def _prune(db, space_id: str) -> None:
    cutoff = datetime.utcnow() - _RETENTION
    old = (
        db.query(models_db.SpaceSnapshot)
        .filter(models_db.SpaceSnapshot.space_id == space_id)
        .filter(models_db.SpaceSnapshot.created_at < cutoff)
        .all()
    )
    for snap in old:
        shutil.rmtree(BACKUP_DIR / snap.path, ignore_errors=True)
        db.delete(snap)
    if old:
        db.commit()


def maybe_snapshot(space_id: str) -> None:
    """Fire-and-forget hook called after real activity (a chat message
    saved, a document finishing ingestion). Never raises - a backup
    failure must never break the actual feature that triggered it."""
    try:
        create_snapshot(space_id, force=False)
    except Exception:
        logger.exception("maybe_snapshot a echoue pour l'espace %s", space_id)


def delete_all_snapshots(space_id: str) -> None:
    """Called when a space itself is deleted - its snapshots are no
    longer restorable to anything and would otherwise leak disk space
    forever."""
    shutil.rmtree(BACKUP_DIR / space_id, ignore_errors=True)


def restore_snapshot(space_id: str, snapshot_id: str) -> bool:
    """Replaces the space's current conversations/messages/documents,
    vector collection, and uploaded files with what's in the snapshot.
    The Space row itself (name/description/color/owner) is left alone -
    only its content is restored."""
    db = SessionLocal()
    try:
        snap = db.get(models_db.SpaceSnapshot, snapshot_id)
        if not snap or snap.space_id != space_id:
            return False
        space = db.get(models_db.Space, space_id)
        if not space:
            return False

        snapshot_dir = BACKUP_DIR / snap.path
        data_file = snapshot_dir / "data.json"
        if not data_file.exists():
            return False
        payload = json.loads(data_file.read_text(encoding="utf-8"))

        # Wipe current content and reinsert from the snapshot. Query.delete()
        # issues a bulk DELETE that bypasses the ORM entirely, so it does
        # NOT trigger the Conversation -> Message cascade - messages have
        # to be deleted explicitly first, or restoring twice collides on
        # their original ids (UNIQUE constraint) against orphaned rows
        # left behind by the first restore.
        conv_ids = [
            row[0]
            for row in db.query(models_db.Conversation.id).filter_by(space_id=space_id).all()
        ]
        if conv_ids:
            db.query(models_db.Message).filter(
                models_db.Message.conversation_id.in_(conv_ids)
            ).delete(synchronize_session=False)
        db.query(models_db.Conversation).filter_by(space_id=space_id).delete(
            synchronize_session=False
        )
        db.query(models_db.Document).filter_by(space_id=space_id).delete(
            synchronize_session=False
        )
        db.commit()

        for c in payload["conversations"]:
            db.add(
                models_db.Conversation(
                    id=c["id"],
                    space_id=space_id,
                    title=c["title"],
                    created_at=datetime.fromisoformat(c["created_at"]) if c["created_at"] else None,
                    updated_at=datetime.fromisoformat(c["updated_at"]) if c["updated_at"] else None,
                )
            )
        for d in payload["documents"]:
            db.add(
                models_db.Document(
                    id=d["id"],
                    space_id=space_id,
                    name=d["name"],
                    doc_type=d["doc_type"],
                    source_url=d["source_url"],
                    file_path=d["file_path"],
                    status=d["status"],
                    error_message=d["error_message"],
                    chunk_count=d["chunk_count"],
                    preview=d["preview"],
                    size_bytes=d["size_bytes"],
                    created_at=datetime.fromisoformat(d["created_at"]) if d["created_at"] else None,
                )
            )
        db.commit()
        for m in payload["messages"]:
            db.add(
                models_db.Message(
                    id=m["id"],
                    conversation_id=m["conversation_id"],
                    role=m["role"],
                    content=m["content"],
                    sources_json=m["sources_json"],
                    created_at=datetime.fromisoformat(m["created_at"]) if m["created_at"] else None,
                )
            )
        db.commit()

        # Restore the vector collection from the snapshot's dump. Adding
        # directly with the original ids/embeddings/metadatas (rather than
        # replaying per-document add_chunks() calls) avoids needing to
        # reconstruct the original per-document groupings.
        vectorstore.delete_space(space_id)
        vecs = payload.get("vectors") or {}
        if vecs.get("ids"):
            collection = vectorstore.get_collection(space_id)
            collection.add(
                ids=vecs["ids"],
                documents=vecs["documents"],
                embeddings=vecs["embeddings"],
                metadatas=vecs["metadatas"],
            )

        # Restore uploaded files.
        current_uploads = UPLOAD_DIR / space_id
        shutil.rmtree(current_uploads, ignore_errors=True)
        snapshot_uploads = snapshot_dir / "uploads"
        if snapshot_uploads.exists():
            shutil.copytree(snapshot_uploads, current_uploads)

        logger.warning(
            "Espace %s restaure depuis le snapshot %s", space_id, snapshot_id
        )
        return True
    except Exception:
        logger.exception("Echec de la restauration du snapshot %s", snapshot_id)
        return False
    finally:
        db.close()


def list_snapshots(space_id: str) -> list["models_db.SpaceSnapshot"]:
    db = SessionLocal()
    try:
        return (
            db.query(models_db.SpaceSnapshot)
            .filter_by(space_id=space_id)
            .order_by(models_db.SpaceSnapshot.created_at.desc())
            .all()
        )
    finally:
        db.close()
