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
    from app import models_db

    db = SessionLocal()
    try:
        db.add(
            models_db.Document(
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
