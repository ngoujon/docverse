"""Clé API Mistral personnelle, suivi de la consommation IA et quota de
pages scannées. Aucun appel réel : l'API Mistral est simulée."""

import asyncio
import json

import httpx
import pytest

from app.services import llm_provider, secrets_box, usage

from .conftest import auth_headers, register_user, set_quota

USER_KEY = "user-personal-mistral-key-0001"


def _client_factory(handler):
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs.pop("timeout", None)
        return real(transport=httpx.MockTransport(handler), timeout=5.0)

    return factory


@pytest.fixture
def platform_key(monkeypatch):
    monkeypatch.setattr(llm_provider.settings, "mistral_api_key", "platform-key")


# --- llm_provider + compteur -------------------------------------------------------


def test_chat_records_reported_usage_and_uses_the_meter_key(monkeypatch, platform_key):
    seen = []

    def handler(request):
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 1000, "completion_tokens": 200, "prompt_tokens_details": {"cached_tokens": 0}},
        })

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    async def _run():
        meter = usage.start(USER_KEY)
        await llm_provider.chat([{"role": "user", "content": "x"}], model="mistral-large-latest", purpose="rerank")
        return meter

    meter = asyncio.run(_run())
    assert seen == [f"Bearer {USER_KEY}"]
    summary = meter.summary()
    assert summary["own_key"] is True
    assert summary["prompt_tokens"] == 1000 and summary["completion_tokens"] == 200
    # Large : 0,5 $/M en entrée, 1,5 $/M en sortie
    assert summary["cost_usd"] == pytest.approx(0.0005 + 0.0003)
    assert summary["details"][0]["kind"] == "rerank"


def test_without_meter_the_platform_key_is_used(monkeypatch, platform_key):
    seen = []

    def handler(request):
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))
    asyncio.run(llm_provider.chat([{"role": "user", "content": "x"}]))
    assert seen == ["Bearer platform-key"]


def test_chat_stream_reads_usage_from_last_chunk(monkeypatch, platform_key):
    sse = (
        'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"jour"}}],"usage":{"prompt_tokens":50,"completion_tokens":2}}\n\n'
        "data: [DONE]\n\n"
    )
    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(
        lambda r: httpx.Response(200, content=sse.encode(), headers={"content-type": "text/event-stream"})
    ))

    async def _run():
        meter = usage.start(None)
        text = "".join([t async for t in llm_provider.chat_stream([{"role": "user", "content": "x"}])])
        return text, meter

    text, meter = asyncio.run(_run())
    assert text == "Bonjour"
    assert meter.entries[0]["prompt_tokens"] == 50
    assert meter.entries[0]["estimated"] is False


def test_chat_stream_falls_back_to_light_model_on_persistent_429(monkeypatch, platform_key):
    models_seen = []

    def handler(request):
        model = json.loads(request.content)["model"]
        models_seen.append(model)
        if model == llm_provider.settings.mistral_chat_model:
            return httpx.Response(429, json={"message": "rate limited"})
        return httpx.Response(200, content=b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
                              headers={"content-type": "text/event-stream"})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))
    real_sleep = asyncio.sleep
    monkeypatch.setattr(llm_provider.asyncio, "sleep", lambda *_: real_sleep(0))

    async def _run():
        meter = usage.start(None)
        text = "".join([t async for t in llm_provider.chat_stream([{"role": "user", "content": "x"}])])
        return text, meter

    text, meter = asyncio.run(_run())
    assert text == "ok"
    assert models_seen.count(llm_provider.settings.mistral_chat_model) == 3
    assert models_seen[-1] == llm_provider.settings.mistral_fallback_model
    assert meter.entries[0]["fallback"] is True


def test_ocr_image_reads_pages_and_counts_them(monkeypatch, platform_key):
    seen = []

    def handler(request):
        seen.append((request.url.path, json.loads(request.content)))
        return httpx.Response(200, json={
            "pages": [{"index": 0, "markdown": "Total : [tbl-0.md](tbl-0.md)",
                       "tables": [{"id": "tbl-0.md", "content": "| A | 12 |"}]}],
            "usage_info": {"pages_processed": 1},
        })

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    async def _run():
        meter = usage.start(None)
        return await llm_provider.ocr_image("aGVsbG8=", mime_type="image/png"), meter

    text, meter = asyncio.run(_run())
    assert text == "Total : | A | 12 |"
    assert seen[0][0] == "/v1/ocr"
    assert seen[0][1]["document"]["image_url"].startswith("data:image/png;base64,")
    assert meter.entries[0]["pages"] == 1
    assert meter.entries[0]["cost_usd"] == pytest.approx(0.004)


def test_secrets_box_roundtrip_and_hint():
    token = secrets_box.encrypt(USER_KEY)
    assert USER_KEY not in token
    assert secrets_box.decrypt(token) == USER_KEY
    assert secrets_box.decrypt("garbage") is None
    assert secrets_box.hint(USER_KEY) == "••••0001"


# --- API : clé personnelle ------------------------------------------------------------


def _save_key(client, token, monkeypatch, valid=True):
    async def fake_validate(key):
        return valid

    monkeypatch.setattr(llm_provider, "validate_api_key", fake_validate)
    return client.put("/api/auth/me/ai/key", json={"api_key": USER_KEY}, headers=auth_headers(token))


def test_save_key_never_returns_it_and_lifts_platform_quotas(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    res = _save_key(client, user["access_token"], monkeypatch)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["has_own_key"] is True
    assert body["key_hint"] == "••••0001"
    assert USER_KEY not in res.text

    stats = client.get("/api/auth/me/stats", headers=auth_headers(user["access_token"])).json()
    assert stats["own_key"] is True
    assert stats["messages_per_day_limit"] is None
    assert stats["scanned_pages_per_day_limit"] is None

    from app import models
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        stored = db.query(models.User).filter_by(email="owner@example.com").one().mistral_api_key_enc
        assert stored and USER_KEY not in stored
    finally:
        db.close()

    res = client.delete("/api/auth/me/ai/key", headers=auth_headers(user["access_token"]))
    assert res.json()["has_own_key"] is False


def test_invalid_key_is_rejected(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    res = _save_key(client, user["access_token"], monkeypatch, valid=False)
    assert res.status_code == 400
    assert client.get("/api/auth/me/ai", headers=auth_headers(user["access_token"])).json()["has_own_key"] is False


def _space_and_conv(client, token):
    space = client.post("/api/spaces", json={"name": "S"}, headers=auth_headers(token)).json()
    conv = client.post(f"/api/spaces/{space['id']}/conversations", json={"title": "c"},
                       headers=auth_headers(token)).json()
    return space, conv


def _fake_pipeline(monkeypatch, keys_seen):
    from app.services import rag

    async def fake_gather(space_id, query, doc_ids=None):
        usage.current().add("rerank", "mistral-small-latest", prompt_tokens=800, completion_tokens=10)
        return "(aucun contexte)", []

    async def fake_stream(messages, model=None, temperature=0.3, purpose="chat"):
        keys_seen.append(usage.current_api_key())
        usage.current().add("chat", "mistral-large-latest", prompt_tokens=2000, completion_tokens=300)
        yield "Réponse"

    monkeypatch.setattr(rag, "gather_context", fake_gather)
    monkeypatch.setattr(llm_provider, "chat_stream", fake_stream)


def test_own_key_bypasses_free_quota_and_usage_is_recorded(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    token = user["access_token"]
    _save_key(client, token, monkeypatch)
    set_quota(monkeypatch, "messages_per_day", 0)
    keys_seen = []
    _fake_pipeline(monkeypatch, keys_seen)
    _, conv = _space_and_conv(client, token)

    res = client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Bonjour ?"},
                      headers=auth_headers(token))
    assert res.status_code == 200
    assert keys_seen == [USER_KEY]
    done = [json.loads(line[5:]) for line in res.text.splitlines() if line.startswith("data:")][-1]
    assert done["usage"]["own_key"] is True
    assert done["usage"]["prompt_tokens"] == 2800

    messages = client.get(f"/api/conversations/{conv['id']}/messages", headers=auth_headers(token)).json()
    assert messages[-1]["usage"]["completion_tokens"] == 310

    report = client.get("/api/auth/me/ai/usage", headers=auth_headers(token)).json()
    assert report["month_own_key"]["calls"] == 2
    assert report["month_platform"]["calls"] == 0

    # La plateforme ne paie rien pour ce compte.
    costs = client.get("/api/admin/ai-costs", headers=auth_headers(token)).json()
    assert costs["last_30d"]["cost_usd"] == 0
    assert costs["own_key_last_30d"]["calls"] == 2


def test_user_defined_daily_limit_applies_with_own_key(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    token = user["access_token"]
    _save_key(client, token, monkeypatch)
    res = client.patch("/api/auth/me/ai/limits", json={"daily_messages": 1}, headers=auth_headers(token))
    assert res.json()["daily_messages"] == 1
    _fake_pipeline(monkeypatch, [])
    _, conv = _space_and_conv(client, token)

    first = client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Q1"}, headers=auth_headers(token))
    second = client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Q2"}, headers=auth_headers(token))
    assert first.status_code == 200
    assert second.status_code == 429
    assert "que vous avez fixée" in second.json()["detail"]


def test_monthly_budget_blocks_once_reached(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    token = user["access_token"]
    _save_key(client, token, monkeypatch)
    client.patch("/api/auth/me/ai/limits", json={"monthly_budget_usd": 0.0001}, headers=auth_headers(token))
    _fake_pipeline(monkeypatch, [])
    _, conv = _space_and_conv(client, token)

    first = client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Q1"}, headers=auth_headers(token))
    second = client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Q2"}, headers=auth_headers(token))
    assert first.status_code == 200
    assert second.status_code == 429
    assert "budget" in second.json()["detail"]


def test_platform_usage_is_reported_to_admin(client, monkeypatch):
    user = register_user(client, "owner@example.com")
    token = user["access_token"]
    _fake_pipeline(monkeypatch, keys := [])
    _, conv = _space_and_conv(client, token)
    client.post(f"/api/conversations/{conv['id']}/chat", json={"message": "Q"}, headers=auth_headers(token))

    assert keys == [None]  # clé plateforme
    costs = client.get("/api/admin/ai-costs", headers=auth_headers(token)).json()
    assert costs["last_30d"]["calls"] == 2
    assert costs["last_30d"]["cost_usd"] > 0
    assert costs["cost_per_question_usd"] == pytest.approx(costs["last_30d"]["cost_usd"])
    assert costs["top_users"][0]["email"] == "owner@example.com"


# --- Quota de pages scannées --------------------------------------------------------


def test_scanned_pages_quota(client, monkeypatch):
    from app import models
    from app.database import SessionLocal
    from app.routers import documents

    register_user(client, "owner@example.com")
    set_quota(monkeypatch, "scanned_pages_per_day", 3)
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(email="owner@example.com").one()
        documents._reserve_scanned_pages(user, 2, own_key=False, db=db)
        with pytest.raises(documents.ScanQuotaExceeded) as exc:
            documents._reserve_scanned_pages(user, 2, own_key=False, db=db)
        assert "il en reste 1" in str(exc.value)
        # Avec sa propre clé : pas de limite plateforme.
        documents._reserve_scanned_pages(user, 50, own_key=True, db=db)
    finally:
        db.close()


def test_scans_use_light_model_then_fall_back_to_vision_model(monkeypatch):
    from app.services import document_processor

    calls = []

    async def fake_describe(image_b64, prompt, model=None, mime_type="image/jpeg"):
        calls.append(model)
        if model == document_processor.settings.mistral_scan_model:
            raise RuntimeError("boom")
        return "Texte lu par le modèle principal"

    monkeypatch.setattr(document_processor.settings, "scan_engine", "vision")
    monkeypatch.setattr(llm_provider, "describe_image", fake_describe)
    text = asyncio.run(document_processor._read_scanned_image("aGk=", "image/png", "lis"))
    assert text == "Texte lu par le modèle principal"
    assert calls == [document_processor.settings.mistral_scan_model, None]


def test_count_scanned_pages_detects_pages_without_text(tmp_path):
    import fitz

    from app.services import document_processor

    pdf = fitz.open()
    pdf.new_page().insert_text((72, 72), "Une page avec suffisamment de texte pour ne pas etre un scan.")
    pdf.new_page()  # page vide = scan
    path = tmp_path / "mix.pdf"
    pdf.save(path)
    assert document_processor.count_scanned_pages("pdf", path) == 1
    assert document_processor.count_scanned_pages("image", path) == 1
    assert document_processor.count_scanned_pages("txt", path) == 0
