"""Enregistreur d'appels à l'API Mistral, indépendant du code de l'app.

Il s'insère au niveau du transport httpx : chaque requête vers
api.mistral.ai est chronométrée (début, premier octet, fin) et sa
consommation (tokens, pages OCR) est relevée dans la réponse elle-même.
Comme il ne dépend d'aucune fonction interne de Docverse, le même
benchmark mesure à l'identique l'ancienne et la nouvelle version du code.

Les appels sont étiquetés via une ContextVar (`TAG`) : le benchmark la
positionne avant chaque étape (« q:F01 », « ingest:facture.pdf »...), et
elle se propage aux tâches lancées par l'app pendant cette étape."""

import contextvars
import json
import time

import httpx

TAG: contextvars.ContextVar[str] = contextvars.ContextVar("bench_tag", default="")
CALLS: list[dict] = []

# Tarifs publics Mistral en USD par million de tokens (entrée, sortie).
# Source : docs.mistral.ai/inference/pricing et mistral.ai/pricing
# (novembre 2026). Medium 3.5 vient d'un comparateur, faute de chiffre
# officiel trouvé. Les tokens d'entrée en cache sont facturés 10 %.
PRICES = {
    "large": (0.5, 1.5),
    "medium": (1.5, 7.5),
    "small": (0.15, 0.6),
    "ministral-14b": (0.2, 0.2),
    "ministral-8b": (0.15, 0.15),
    "ministral-3b": (0.1, 0.1),
    "embed": (0.1, 0.0),
}
OCR_PRICE_PER_PAGE = 4.0 / 1000


def price_for(model: str) -> tuple[float, float]:
    m = (model or "").lower()
    for key in ("ministral-14b", "ministral-8b", "ministral-3b", "large", "medium", "small", "embed"):
        if key in m:
            return PRICES[key]
    return PRICES["large"]


def cost_of(call: dict) -> float:
    if call["endpoint"] == "ocr":
        return call.get("pages", 0) * OCR_PRICE_PER_PAGE
    p_in, p_out = price_for(call["model"])
    cached = call.get("cached_tokens", 0)
    fresh = max(call.get("prompt_tokens", 0) - cached, 0)
    return (fresh * p_in + cached * p_in * 0.1 + call.get("completion_tokens", 0) * p_out) / 1_000_000


def _endpoint(path: str) -> str:
    if path.endswith("/chat/completions"):
        return "chat"
    if path.endswith("/embeddings"):
        return "embed"
    if path.endswith("/ocr"):
        return "ocr"
    return path


def _describe_request(request: httpx.Request) -> dict:
    info = {"model": "", "stream": False, "images": 0}
    try:
        body = json.loads(request.content or b"{}")
    except (ValueError, UnicodeDecodeError):
        return info
    info["model"] = body.get("model", "")
    info["stream"] = bool(body.get("stream"))
    for msg in body.get("messages") or []:
        content = msg.get("content")
        if isinstance(content, list):
            info["images"] += sum(1 for part in content if part.get("type") == "image_url")
    if body.get("document"):
        info["images"] += 1
    return info


def _decode(raw: bytes, encoding: str) -> bytes:
    """Le transport voit le corps encore compressé (gzip, br...) : httpx ne
    le décode qu'au niveau de la Response. Sans cela, les grosses réponses
    (vision, OCR) étaient illisibles et leur coût comptait pour 0."""
    if not encoding:
        return raw
    from httpx._decoders import SUPPORTED_DECODERS  # noqa: PLC0415

    out = raw
    for enc in reversed([e.strip().lower() for e in encoding.split(",") if e.strip()]):
        decoder_cls = SUPPORTED_DECODERS.get(enc)
        if decoder_cls is None:
            return raw
        decoder = decoder_cls()
        out = decoder.decode(out) + decoder.flush()
    return out


def _parse_usage(raw: bytes, call: dict) -> None:
    text = _decode(raw, call.get("encoding", "")).decode("utf-8", errors="ignore")
    candidates = []
    if call["stream"]:
        for line in text.splitlines():
            if line.startswith("data:") and '"usage"' in line:
                candidates.append(line[5:].strip())
    else:
        candidates.append(text)
    for chunk in reversed(candidates):
        try:
            data = json.loads(chunk)
        except ValueError:
            continue
        usage = data.get("usage") or {}
        call["prompt_tokens"] = usage.get("prompt_tokens", 0) or 0
        call["completion_tokens"] = usage.get("completion_tokens", 0) or 0
        call["cached_tokens"] = ((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        info = data.get("usage_info") or {}
        if info:
            call["pages"] = info.get("pages_processed", 0) or 0
        if call["endpoint"] == "ocr" and not call.get("pages"):
            call["pages"] = len(data.get("pages") or [])
        return


class _TeeStream(httpx.AsyncByteStream):
    def __init__(self, inner, call: dict):
        self._inner = inner
        self._call = call
        self._buf = bytearray()

    async def __aiter__(self):
        async for chunk in self._inner:
            if "first_byte" not in self._call:
                self._call["first_byte"] = time.perf_counter()
            self._buf.extend(chunk)
            yield chunk

    async def aclose(self):
        self._call["ended"] = time.perf_counter()
        _parse_usage(bytes(self._buf), self._call)
        self._call["cost"] = cost_of(self._call)
        await self._inner.aclose()


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self, inner: httpx.AsyncBaseTransport):
        self._inner = inner

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if "mistral.ai" not in request.url.host:
            return await self._inner.handle_async_request(request)
        call = {
            "tag": TAG.get(),
            "endpoint": _endpoint(request.url.path),
            "started": time.perf_counter(),
            **_describe_request(request),
        }
        CALLS.append(call)
        response = await self._inner.handle_async_request(request)
        call["status"] = response.status_code
        call["encoding"] = response.headers.get("content-encoding", "")
        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            stream=_TeeStream(response.stream, call),
            extensions=response.extensions,
            request=request,
        )

    async def aclose(self):
        await self._inner.aclose()


_original_init = httpx.AsyncClient.__init__


def install() -> None:
    """Toute instance httpx.AsyncClient créée sans transport explicite
    passe désormais par l'enregistreur."""

    def patched_init(self, *args, **kwargs):
        if kwargs.get("transport") is None:
            kwargs["transport"] = RecordingTransport(httpx.AsyncHTTPTransport())
        _original_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init


def calls_for(prefix: str) -> list[dict]:
    return [c for c in CALLS if c["tag"].startswith(prefix)]


def summarize(calls: list[dict]) -> dict:
    out = {"calls": len(calls), "prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0,
           "pages": 0, "cost": 0.0, "by_model": {}}
    for c in calls:
        for key in ("prompt_tokens", "completion_tokens", "cached_tokens", "pages"):
            out[key] += c.get(key, 0)
        out["cost"] += c.get("cost", 0.0)
        m = out["by_model"].setdefault(f'{c["endpoint"]}:{c["model"]}', {"calls": 0, "cost": 0.0, "tokens": 0})
        m["calls"] += 1
        m["cost"] += c.get("cost", 0.0)
        m["tokens"] += c.get("prompt_tokens", 0) + c.get("completion_tokens", 0)
    return out
