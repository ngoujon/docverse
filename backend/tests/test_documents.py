import io

from .conftest import auth_headers, register_user


def create_space(client, token, name="Test space"):
    res = client.post("/api/spaces", json={"name": name, "description": "", "color": "#6366f1"}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    return res.json()


def _seed_fake_storage(space_id: str, size_bytes: int) -> None:
    """Inserts a Document row with a given size directly in the DB, without
    an actual file on disk - enough to make the storage-sum query reflect
    near-quota usage without uploading hundreds of MB in a test."""
    from app.database import SessionLocal
    from app import models

    db = SessionLocal()
    try:
        db.add(
            models.Document(
                space_id=space_id,
                name="filler.txt",
                doc_type="txt",
                status="ready",
                size_bytes=size_bytes,
            )
        )
        db.commit()
    finally:
        db.close()


def test_storage_quota_blocks_upload_past_limit(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])

    from app import config

    _seed_fake_storage(space["id"], config.quota("storage_bytes") - 100)

    res = client.post(
        f"/api/spaces/{space['id']}/documents/upload",
        files={"file": ("note.txt", io.BytesIO(b"x" * 1000), "text/plain")},
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 400
    assert "stockage" in res.json()["detail"].lower()


def test_storage_quota_allows_upload_under_limit(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])

    res = client.post(
        f"/api/spaces/{space['id']}/documents/upload",
        files={"file": ("note.txt", io.BytesIO(b"hello world"), "text/plain")},
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 200, res.text


def test_ingestions_run_a_few_at_a_time(monkeypatch):
    """Dropping many files at once must not start every ingestion together
    (each holds a DB connection: 20 at once exhausted the pool in prod)."""
    import asyncio

    from app.routers import documents

    running = 0
    peak = 0

    async def fake_ingest_one(document_id):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1

    monkeypatch.setattr(documents, "_ingest_one", fake_ingest_one)
    monkeypatch.setattr(documents, "_INGEST_SLOTS", asyncio.Semaphore(3))

    async def run_all():
        await asyncio.gather(*(documents._ingest(str(i)) for i in range(20)))

    asyncio.run(run_all())
    assert peak == 3


def test_ingestion_crash_marks_document_as_error(client, monkeypatch):
    """A failure outside the pipeline's own handling must not leave the
    document stuck in "pending"."""
    import asyncio

    from app import models
    from app.database import SessionLocal
    from app.routers import documents

    owner = register_user(client, "crash@example.com")
    space = create_space(client, owner["access_token"])
    db = SessionLocal()
    doc = models.Document(space_id=space["id"], name="x.txt", doc_type="txt", status="pending")
    db.add(doc)
    db.commit()
    doc_id = doc.id
    db.close()

    async def boom(document_id):
        raise RuntimeError("pool exhausted")

    monkeypatch.setattr(documents, "_ingest_one", boom)
    asyncio.run(documents._ingest(doc_id))

    db = SessionLocal()
    assert db.get(models.Document, doc_id).status == "error"
    db.close()
