from .conftest import auth_headers, register_user


def create_space(client, token, name="Test space"):
    res = client.post("/api/spaces", json={"name": name, "description": "", "color": "#6366f1"}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    return res.json()


def _seed_conversation_with_accented_content(space_id: str) -> str:
    """Inserts a conversation with real messages (incl. accents and a
    cited source) directly in the DB - exercises the export code path
    without needing a live Ollama chat call in tests."""
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        conv = models_db.Conversation(space_id=space_id, title="Resume du contrat fournisseur")
        db.add(conv)
        db.commit()
        db.refresh(conv)

        db.add(
            models_db.Message(
                conversation_id=conv.id,
                role="user",
                content="Quelle est la durée du contrat ?",
            )
        )
        db.add(
            models_db.Message(
                conversation_id=conv.id,
                role="assistant",
                content="La durée est de 12 mois avec reconduction tacite. [1]",
                sources_json='[{"type": "document", "label": "contrat_fournisseur.pdf", "doc_id": "abc"}]',
            )
        )
        db.commit()
        return conv.id
    finally:
        db.close()


def test_export_pdf_returns_valid_pdf_with_accented_content(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    conv_id = _seed_conversation_with_accented_content(space["id"])

    res = client.get(
        f"/api/conversations/{conv_id}/export?format=pdf",
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF-")
    assert len(res.content) > 500


def test_export_docx_returns_valid_docx_with_accented_content(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    conv_id = _seed_conversation_with_accented_content(space["id"])

    res = client.get(
        f"/api/conversations/{conv_id}/export?format=docx",
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 200
    assert (
        res.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert res.content.startswith(b"PK\x03\x04")  # docx is a zip archive


def test_export_rejects_unknown_format(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    conv_id = _seed_conversation_with_accented_content(space["id"])

    res = client.get(
        f"/api/conversations/{conv_id}/export?format=xml",
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 400


def test_export_requires_space_access(client):
    owner = register_user(client, "owner@example.com")
    outsider = register_user(client, "outsider@example.com")
    space = create_space(client, owner["access_token"])
    conv_id = _seed_conversation_with_accented_content(space["id"])

    res = client.get(
        f"/api/conversations/{conv_id}/export?format=pdf",
        headers=auth_headers(outsider["access_token"]),
    )
    assert res.status_code == 401
