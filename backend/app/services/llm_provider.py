"""Client Mistral AI - unique fournisseur d'IA de la plateforme.

Toute l'inference (chat, vision, embeddings) passe par l'API Mistral,
operee en France par Mistral AI : c'est ce qui permet d'annoncer une
chaine de traitement souveraine de bout en bout, sans dependance a un
fournisseur hors UE.

L'API Mistral est compatible OpenAI (`/v1/chat/completions`,
`/v1/embeddings`), contrairement a l'ancienne API Ollama (`/api/chat`)
qu'elle remplace integralement.
"""

import asyncio
import contextlib
import json
import logging
from typing import AsyncGenerator, Optional

import httpx

from ..config import settings

logger = logging.getLogger("docverse.llm")

# Mistral facture a l'usage et repond vite : un timeout genereux suffit,
# il n'y a plus de modele a charger en memoire comme avec Ollama local.
_TIMEOUT = httpx.Timeout(120.0, connect=10.0)

# Nombre de tentatives sur une erreur transitoire (429 quota momentane,
# 5xx cote fournisseur). L'API etant facturee a l'appel, on reste sobre.
_MAX_ATTEMPTS = 3
_BACKOFF_BASE = 1.5

# Taille de lot pour /v1/embeddings : l'API accepte plusieurs textes par
# appel, ce qui divise d'autant le nombre de requetes a l'ingestion.
_EMBED_BATCH_SIZE = 32


# --- Concurrency -------------------------------------------------------------
# Bounds simultaneous calls to the provider (and to local CPU-bound work such
# as transcription) so we never trigger Mistral's 429s. The waiting counter
# lets the chat UI show "N requests ahead of you" while a slot frees up.
_semaphore = asyncio.Semaphore(settings.llm_max_concurrency)
_waiting = 0
_state_lock = asyncio.Lock()


@contextlib.asynccontextmanager
async def queue_slot():
    """Holds one of the LLM_MAX_CONCURRENCY slots for the duration of the
    `async with` block."""
    global _waiting
    async with _state_lock:
        _waiting += 1
    try:
        await _semaphore.acquire()
    finally:
        async with _state_lock:
            _waiting -= 1
    try:
        yield
    finally:
        _semaphore.release()


def is_busy() -> bool:
    return _semaphore.locked()


async def waiting_count() -> int:
    async with _state_lock:
        return _waiting


def sse_event(event: dict) -> str:
    """Formats one Server-Sent Event, the framing both chat endpoints use to
    stream tokens to the browser."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


# --- HTTP plumbing ------------------------------------------------------------


class LLMNotConfigured(RuntimeError):
    """MISTRAL_API_KEY absente : aucune inference n'est possible."""


def _headers() -> dict:
    if not settings.mistral_api_key:
        raise LLMNotConfigured(
            "MISTRAL_API_KEY n'est pas definie - configurez une cle API "
            "Mistral pour activer le chat, la vision et l'indexation."
        )
    return {
        "Authorization": f"Bearer {settings.mistral_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _url(path: str) -> str:
    return f"{settings.mistral_base_url.rstrip('/')}{path}"


def _is_retryable(status: int) -> bool:
    return status == 429 or status >= 500


async def _post(client: httpx.AsyncClient, path: str, payload: dict) -> httpx.Response:
    """POST avec reessai sur erreur transitoire."""
    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            r = await client.post(_url(path), headers=_headers(), json=payload)
            if _is_retryable(r.status_code) and attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(_BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            return r
        except httpx.HTTPStatusError:
            raise
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(_BACKOFF_BASE ** attempt)
                continue
    raise last_exc if last_exc else RuntimeError("Appel Mistral echoue")


# --- Chat ------------------------------------------------------------------


async def chat(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> str:
    model = model or settings.mistral_chat_model
    async with queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await _post(
                client,
                "/v1/chat/completions",
                {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "stream": False,
                },
            )
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "") or ""


async def chat_stream(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    """Diffuse la reponse token par token. Le flux Mistral est du SSE
    (`data: {...}`, termine par `data: [DONE]`), la ou Ollama renvoyait
    un JSON par ligne - d'ou le decoupage different de l'ancien client."""
    model = model or settings.mistral_chat_model
    async with queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST",
                _url("/v1/chat/completions"),
                headers=_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "stream": True,
                },
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[len("data:"):].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    content = choices[0].get("delta", {}).get("content") or ""
                    if content:
                        yield content


# --- Embeddings ------------------------------------------------------------


async def embed_batch(texts: list[str], model: Optional[str] = None) -> list[list[float]]:
    """Vectorise plusieurs textes en un minimum d'appels. `mistral-embed`
    accepte une liste en entree : a l'ingestion d'un document, cela
    remplace une requete par chunk par une requete tous les 32 chunks."""
    if not texts:
        return []
    model = model or settings.mistral_embed_model
    out: list[list[float]] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for start in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[start:start + _EMBED_BATCH_SIZE]
            # Le verrou est pris par lot, pas autour de la boucle entiere :
            # l'ingestion d'un gros document peut representer des dizaines
            # de requetes, et immobiliser un slot pendant tout ce temps
            # bloquerait les conversations en cours.
            async with queue_slot():
                r = await _post(
                    client,
                    "/v1/embeddings",
                    {"model": model, "input": batch},
                )
            data = r.json().get("data", [])
            # L'API renvoie un index par entree : on trie dessus plutot
            # que de se fier a l'ordre pour ne jamais desaligner un
            # vecteur de son chunk.
            for item in sorted(data, key=lambda d: d.get("index", 0)):
                out.append(item["embedding"])
    return out


async def embed(text: str, model: Optional[str] = None) -> list[float]:
    vectors = await embed_batch([text], model=model)
    if not vectors:
        raise RuntimeError("L'API Mistral n'a renvoye aucun vecteur.")
    return vectors[0]


# --- Vision ----------------------------------------------------------------


async def describe_image(
    image_b64: str,
    prompt: str,
    model: Optional[str] = None,
    mime_type: str = "image/jpeg",
) -> str:
    """Transcrit/decrit une image via Pixtral, pour indexer les PDF scannes
    et les images comme du texte. Mistral attend l'image dans un bloc de
    contenu `image_url` en data-URI."""
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": f"data:{mime_type};base64,{image_b64}"},
    ]
    return await chat(
        [{"role": "user", "content": content}],
        model=model or settings.mistral_vision_model,
        temperature=0.1,
    )


# --- Sante ------------------------------------------------------------------


async def health() -> dict:
    """Verifie que l'API Mistral repond et que la cle est valide. Remplace
    l'ancien `list_models()` qui interrogeait l'instance Ollama locale."""
    if not settings.mistral_api_key:
        return {"reachable": False, "reason": "MISTRAL_API_KEY absente"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            r = await client.get(_url("/v1/models"), headers=_headers())
            r.raise_for_status()
            models = [m.get("id") for m in r.json().get("data", [])]
            return {"reachable": True, "models_available": models}
    except Exception as exc:  # noqa: BLE001
        logger.warning("API Mistral injoignable : %s", exc)
        return {"reachable": False, "reason": str(exc)[:200]}
