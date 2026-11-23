"""Indexing queue (services/ingestion.py): one document at a time, fair
order, progress, clear errors, retry and resume after a restart."""

import asyncio
import io
import time

from .conftest import auth_headers, register_user
from .test_documents import create_space


def _add_doc(space_id, status="pending", uploaded_by=None, name="doc.txt", **extra):
    from app import models
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        doc = models.Document(
            space_id=space_id, name=name, doc_type="txt", status=status, uploaded_by=uploaded_by, **extra
        )
        db.add(doc)
        db.commit()
        return doc.id
    finally:
        db.close()


def _get(doc_id):
    from app import models
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        return db.get(models.Document, doc_id)
    finally:
        db.close()


def _wait_until(predicate, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def _owner_and_space(client, email="owner@example.com"):
    owner = register_user(client, email)
    space = create_space(client, owner["access_token"])
    return owner, space


def test_documents_are_indexed_one_at_a_time(client, monkeypatch):
    from app.services import ingestion

    running = 0
    peak = 0
    done = []

    async def fake_ingest(document_id):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        ingestion._write(document_id, status="ready", stage=None, progress=100)
        done.append(document_id)

    monkeypatch.setattr(ingestion, "ingest_document", fake_ingest)
    _, space = _owner_and_space(client)
    ids = [_add_doc(space["id"]) for _ in range(8)]
    ingestion.notify()

    assert _wait_until(lambda: len(done) == len(ids))
    assert peak == 1
    assert sorted(done) == sorted(ids)


def test_queue_alternates_between_uploaders(client, monkeypatch):
    from app.database import SessionLocal
    from app.services import ingestion

    monkeypatch.setattr(ingestion, "_claim_next", lambda: None)
    monkeypatch.setattr(ingestion, "_last_served", {})
    _, space = _owner_and_space(client)
    big = [_add_doc(space["id"], uploaded_by="alice") for _ in range(3)]
    small = _add_doc(space["id"], uploaded_by="bob")

    db = SessionLocal()
    try:
        order = [row.id for row in ingestion._pending_in_order(db)]
    finally:
        db.close()
    # bob's single file goes second, not after all of alice's files.
    assert order == [big[0], small, big[1], big[2]]


def test_upload_reports_queue_position_and_progress_fields(client, monkeypatch):
    from app.services import ingestion

    # Keep the worker from consuming the queue during the test.
    monkeypatch.setattr(ingestion, "_claim_next", lambda: None)
    owner, space = _owner_and_space(client)
    headers = auth_headers(owner["access_token"])
    first = client.post(
        f"/api/spaces/{space['id']}/documents/upload",
        files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")},
        headers=headers,
    ).json()
    second = client.post(
        f"/api/spaces/{space['id']}/documents/upload",
        files={"file": ("b.txt", io.BytesIO(b"world"), "text/plain")},
        headers=headers,
    ).json()
    assert first["status"] == "pending" and first["progress"] == 0
    assert second["queue_position"] == 1

    listed = client.get(f"/api/spaces/{space['id']}/documents", headers=headers).json()
    positions = {d["id"]: d["queue_position"] for d in listed}
    assert positions[first["id"]] == 0
    assert positions[second["id"]] == 1


def test_pipeline_reports_progress_and_ends_ready(client, monkeypatch):
    from app.config import UPLOAD_DIR
    from app.services import ingestion, llm_provider

    _, space = _owner_and_space(client)
    (UPLOAD_DIR / space["id"]).mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / space["id"] / "note.txt").write_text("Bonjour " * 400)
    doc_id = _add_doc(space["id"], status="processing", file_path=f"{space['id']}/note.txt")

    stages = []
    original_write = ingestion._write

    def spy_write(document_id, **values):
        if "stage" in values:
            stages.append((values["stage"], values.get("progress")))
        original_write(document_id, **values)

    async def fake_embed(chunks, on_progress=None, **_):
        if on_progress:
            await on_progress(len(chunks), len(chunks))
        return [[0.0] * 4 for _ in chunks]

    monkeypatch.setattr(ingestion, "_write", spy_write)
    monkeypatch.setattr(llm_provider, "embed_batch", fake_embed)
    monkeypatch.setattr(ingestion, "_index", lambda *a, **k: None)

    asyncio.run(ingestion.ingest_document(doc_id))

    doc = _get(doc_id)
    assert doc.status == "ready", doc.error_message
    assert doc.progress == 100
    assert doc.chunk_count > 0
    names = [s for s, _ in stages]
    assert names.index("reading") < names.index("embedding") < names.index("saving")


def test_unexpected_failure_gives_a_clear_message(client, monkeypatch):
    from app.services import document_processor, ingestion

    _, space = _owner_and_space(client)
    doc_id = _add_doc(space["id"], status="processing")

    async def boom(*args, **kwargs):
        raise RuntimeError("sqlalchemy QueuePool limit reached")

    monkeypatch.setattr(document_processor, "process_document", boom)
    asyncio.run(ingestion.ingest_document(doc_id))

    doc = _get(doc_id)
    assert doc.status == "error"
    assert "QueuePool" not in doc.error_message
    assert "Réessayer" in doc.error_message


def test_friendly_errors():
    from app.services import ingestion, llm_provider

    assert "sollicité" in ingestion.friendly_error(llm_provider.LLMRateLimited("x"))
    assert "momentanément indisponible" in ingestion.friendly_error(
        RuntimeError("API Mistral indisponible (HTTP 503)")
    )
    assert "inattendue" in ingestion.friendly_error(KeyError("x"))


def test_retry_puts_a_failed_document_back_in_the_queue(client, monkeypatch):
    from app.services import ingestion

    monkeypatch.setattr(ingestion, "_claim_next", lambda: None)
    owner, space = _owner_and_space(client)
    headers = auth_headers(owner["access_token"])
    failed = _add_doc(space["id"], status="error", error_message="Echec", ingest_attempts=2)
    ready = _add_doc(space["id"], status="ready")

    res = client.post(f"/api/documents/{failed}/retry", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["error_message"] is None
    assert _get(failed).ingest_attempts == 0

    assert client.post(f"/api/documents/{ready}/retry", headers=headers).status_code == 409


def test_retry_requires_upload_right(client):
    owner, space = _owner_and_space(client)
    failed = _add_doc(space["id"], status="error")
    stranger = register_user(client, "stranger@example.com")
    res = client.post(f"/api/documents/{failed}/retry", headers=auth_headers(stranger["access_token"]))
    assert res.status_code in (401, 403, 404)
    assert _get(failed).status == "error"


def test_restart_resumes_interrupted_documents(client, monkeypatch):
    from app.services import ingestion

    monkeypatch.setattr(ingestion, "_claim_next", lambda: None)
    _, space = _owner_and_space(client)
    interrupted = _add_doc(space["id"], status="processing", progress=40, stage="embedding")

    assert ingestion.recover_interrupted() >= 1
    doc = _get(interrupted)
    assert doc.status == "pending"
    assert doc.progress == 0


def test_document_that_keeps_crashing_ends_in_error(client, monkeypatch):
    from app.services import ingestion

    _, space = _owner_and_space(client)
    monkeypatch.setattr(ingestion, "_claim_next", lambda: None)
    doc_id = _add_doc(space["id"], status="pending", ingest_attempts=ingestion.MAX_ATTEMPTS)
    monkeypatch.undo()

    # Claim directly (the worker may race us to it: either way it must end in error).
    ingestion._claim_next()
    assert _wait_until(lambda: _get(doc_id).status == "error")
    assert "Réessayer" in _get(doc_id).error_message
