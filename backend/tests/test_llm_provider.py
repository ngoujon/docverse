"""Client Mistral, teste contre un transport HTTP simule.

Le remplacement d'Ollama par l'API Mistral a change le protocole sur les
trois surfaces (chat, embeddings, vision) : ces tests figent la forme des
requetes envoyees et la tolerance du parsing, pour qu'une regression se
voie ici plutot qu'en production sur une facture a l'usage.
"""

import asyncio
import base64
import json

import httpx
import pytest

from app.services import llm_provider


def _client_factory(handler):
    """Remplace httpx.AsyncClient par une version branchee sur un
    MockTransport, en ignorant le timeout passe par le code teste."""
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs.pop("timeout", None)
        return real(transport=httpx.MockTransport(handler), timeout=5.0)

    return factory


@pytest.fixture
def api_key(monkeypatch):
    monkeypatch.setattr(llm_provider.settings, "mistral_api_key", "test-key")


def test_chat_sends_expected_payload_and_reads_answer(monkeypatch, api_key):
    seen = []

    def handler(request):
        seen.append((request.url.path, json.loads(request.content), dict(request.headers)))
        return httpx.Response(200, json={"choices": [{"message": {"content": "Bonjour"}}]})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    assert asyncio.run(llm_provider.chat([{"role": "user", "content": "salut"}], temperature=0.2)) == "Bonjour"

    path, body, headers = seen[0]
    assert path == "/v1/chat/completions"
    assert body["model"] == llm_provider.settings.mistral_chat_model
    assert body["stream"] is False
    assert body["temperature"] == 0.2
    assert headers["authorization"] == "Bearer test-key"


def test_chat_tolerates_response_without_choices(monkeypatch, api_key):
    monkeypatch.setattr(
        llm_provider.httpx, "AsyncClient",
        _client_factory(lambda r: httpx.Response(200, json={"choices": []})),
    )
    assert asyncio.run(llm_provider.chat([{"role": "user", "content": "x"}])) == ""


def test_chat_stream_parses_sse_and_stops_at_done(monkeypatch, api_key):
    """Mistral diffuse du SSE, la ou Ollama envoyait un JSON par ligne. Un
    chunk illisible ou un delta vide ne doit pas interrompre le flux, et
    rien ne doit passer apres [DONE]."""
    sse = (
        'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"jour"}}]}\n\n'
        'data: [malformed\n\n'
        'data: {"choices":[{"delta":{}}]}\n\n'
        'data: {"choices":[{"delta":{"content":" !"}}]}\n\n'
        'data: [DONE]\n\n'
        'data: {"choices":[{"delta":{"content":"APRES_DONE"}}]}\n\n'
    )
    monkeypatch.setattr(
        llm_provider.httpx, "AsyncClient",
        _client_factory(lambda r: httpx.Response(
            200, content=sse.encode(), headers={"content-type": "text/event-stream"}
        )),
    )

    async def _run():
        return [token async for token in llm_provider.chat_stream([{"role": "user", "content": "x"}])]

    assert "".join(asyncio.run(_run())) == "Bonjour !"


def test_embed_batch_groups_requests_and_keeps_order(monkeypatch, api_key):
    """Un appel par lot de 32 (et non un par chunk), et les vecteurs sont
    reordonnes par l'index renvoye : un desalignement ici associerait
    silencieusement un vecteur au mauvais extrait."""
    batch_sizes = []

    def handler(request):
        body = json.loads(request.content)
        batch_sizes.append(len(body["input"]))
        data = [{"index": i, "embedding": [float(i)]} for i in range(len(body["input"]))]
        # Ordre volontairement inverse dans la reponse.
        return httpx.Response(200, json={"data": list(reversed(data))})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    vectors = asyncio.run(llm_provider.embed_batch([f"chunk-{i}" for i in range(70)]))

    assert batch_sizes == [32, 32, 6]
    assert len(vectors) == 70
    assert vectors[0] == [0.0]
    assert vectors[31] == [31.0]


def test_embed_batch_makes_no_call_for_empty_input(monkeypatch, api_key):
    monkeypatch.setattr(
        llm_provider.httpx, "AsyncClient",
        _client_factory(lambda r: httpx.Response(500)),
    )
    assert asyncio.run(llm_provider.embed_batch([])) == []


def test_describe_image_sends_a_data_uri(monkeypatch, api_key):
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "un chat"}}]})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    image_b64 = base64.b64encode(b"fake-image-bytes").decode()
    assert asyncio.run(llm_provider.describe_image(image_b64, "decris", mime_type="image/png")) == "un chat"

    content = seen[0]["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "decris"}
    assert content[1]["image_url"] == f"data:image/png;base64,{image_b64}"
    assert seen[0]["model"] == llm_provider.settings.mistral_vision_model


def test_retries_on_429_then_succeeds(monkeypatch, api_key):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, json={"message": "rate limited"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))
    real_sleep = asyncio.sleep
    monkeypatch.setattr(llm_provider.asyncio, "sleep", lambda *_: real_sleep(0))

    assert asyncio.run(llm_provider.chat([{"role": "user", "content": "x"}])) == "ok"
    assert calls["n"] == 3


def test_client_error_is_not_retried(monkeypatch, api_key):
    """Une 400 vient de notre payload, pas du fournisseur : la reessayer ne
    ferait que facturer trois fois la meme erreur."""
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(400, json={"message": "bad request"})

    monkeypatch.setattr(llm_provider.httpx, "AsyncClient", _client_factory(handler))

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(llm_provider.chat([{"role": "user", "content": "x"}]))
    assert calls["n"] == 1


def test_missing_api_key_raises_explicit_error(monkeypatch):
    monkeypatch.setattr(llm_provider.settings, "mistral_api_key", "")
    with pytest.raises(llm_provider.LLMNotConfigured):
        asyncio.run(llm_provider.chat([{"role": "user", "content": "x"}]))


def test_health_reports_missing_api_key(monkeypatch):
    monkeypatch.setattr(llm_provider.settings, "mistral_api_key", "")
    assert asyncio.run(llm_provider.health()) == {
        "reachable": False,
        "reason": "MISTRAL_API_KEY absente",
    }
