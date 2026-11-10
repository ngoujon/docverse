"""Client Mistral AI - unique fournisseur d'IA de la plateforme.

Toute l'inference (chat, vision, OCR, embeddings) passe par l'API Mistral,
operee en France par Mistral AI : c'est ce qui permet d'annoncer une
chaine de traitement souveraine de bout en bout, sans dependance a un
fournisseur hors UE.

L'API Mistral est compatible OpenAI (`/v1/chat/completions`,
`/v1/embeddings`), contrairement a l'ancienne API Ollama (`/api/chat`)
qu'elle remplace integralement.

Deux choses viennent du compteur de consommation (services/usage.py) du
traitement en cours, s'il y en a un :
- la cle API a utiliser (celle de l'utilisateur s'il en a enregistre une,
  sinon celle de la plateforme) ;
- l'inscription de chaque appel (tokens / pages renvoyes par l'API).
"""

import asyncio
import contextlib
import json
import logging
from typing import AsyncGenerator, Optional

import httpx

from ..config import settings
from . import usage

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


class LLMRateLimited(RuntimeError):
    """Quota par minute du compte Mistral atteint, meme apres les reessais
    et le modele de secours."""


def _headers(api_key: Optional[str] = None) -> dict:
    key = api_key or usage.current_api_key() or settings.mistral_api_key
    if not key:
        raise LLMNotConfigured(
            "MISTRAL_API_KEY n'est pas définie - configurez une clé API "
            "Mistral pour activer le chat, la vision et l'indexation."
        )
    return {
        "Authorization": f"Bearer {key}",
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
    raise last_exc if last_exc else RuntimeError("Appel Mistral échoué")


def _models_to_try(model: str) -> list[str]:
    fallback = settings.mistral_fallback_model
    return [model, fallback] if fallback and fallback != model else [model]


def _estimate_tokens(text: str) -> int:
    # ~4 caracteres par token en francais : utilise seulement si l'API
    # n'a pas renvoye de comptage (ne devrait pas arriver avec Mistral).
    return max(len(text) // 4, 1) if text else 0


def _messages_chars(messages: list[dict]) -> str:
    parts = []
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            parts.extend(p.get("text", "") for p in content if isinstance(p, dict))
    return "".join(parts)


def _record(purpose: str, model: str, usage_data: Optional[dict], messages: list[dict] | None = None,
            output: str = "", fallback: bool = False) -> None:
    meter = usage.current()
    if meter is None:
        return
    if usage_data and (usage_data.get("prompt_tokens") or usage_data.get("completion_tokens")):
        details = usage_data.get("prompt_tokens_details") or {}
        meter.add(
            purpose, model,
            prompt_tokens=usage_data.get("prompt_tokens") or 0,
            completion_tokens=usage_data.get("completion_tokens") or 0,
            cached_tokens=details.get("cached_tokens") or 0,
            fallback=fallback,
        )
    else:
        meter.add(
            purpose, model,
            prompt_tokens=_estimate_tokens(_messages_chars(messages or [])),
            completion_tokens=_estimate_tokens(output),
            estimated=True, fallback=fallback,
        )


# --- Chat ------------------------------------------------------------------


async def chat(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
    purpose: str = "chat",
) -> str:
    model = model or settings.mistral_chat_model
    async with queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            candidates = _models_to_try(model)
            for idx, current in enumerate(candidates):
                try:
                    r = await _post(
                        client,
                        "/v1/chat/completions",
                        {
                            "model": current,
                            "messages": messages,
                            "temperature": temperature,
                            "stream": False,
                        },
                    )
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 429 and idx < len(candidates) - 1:
                        logger.warning("Quota Mistral atteint sur %s, bascule sur %s", current, candidates[idx + 1])
                        continue
                    raise
                data = r.json()
                choices = data.get("choices") or []
                text = (choices[0].get("message", {}).get("content", "") or "") if choices else ""
                _record(purpose, current, data.get("usage"), messages, text, fallback=idx > 0)
                return text
    return ""


async def chat_stream(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
    purpose: str = "chat",
) -> AsyncGenerator[str, None]:
    """Diffuse la reponse token par token. Le flux Mistral est du SSE
    (`data: {...}`, termine par `data: [DONE]`), la ou Ollama renvoyait
    un JSON par ligne - d'ou le decoupage different de l'ancien client.

    Un 429/5xx renvoye AVANT le premier token est reessaye, puis bascule
    sur le modele de secours si c'est le quota par minute qui bloque :
    sans cela, la moindre rafale de questions affichait une erreur."""
    model = model or settings.mistral_chat_model
    async with queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            candidates = _models_to_try(model)
            last_status = 0
            for idx, current in enumerate(candidates):
                for attempt in range(_MAX_ATTEMPTS):
                    async with client.stream(
                        "POST",
                        _url("/v1/chat/completions"),
                        headers=_headers(),
                        json={
                            "model": current,
                            "messages": messages,
                            "temperature": temperature,
                            "stream": True,
                        },
                    ) as r:
                        if _is_retryable(r.status_code):
                            await r.aread()
                            last_status = r.status_code
                            if attempt < _MAX_ATTEMPTS - 1:
                                await asyncio.sleep(_BACKOFF_BASE ** attempt)
                                continue
                            break
                        if r.status_code >= 400:
                            await r.aread()
                        r.raise_for_status()
                        usage_data: dict = {}
                        produced = []
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
                            if chunk.get("usage"):
                                usage_data = chunk["usage"]
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            content = choices[0].get("delta", {}).get("content") or ""
                            if content:
                                produced.append(content)
                                yield content
                        _record(purpose, current, usage_data, messages, "".join(produced), fallback=idx > 0)
                        return
                if last_status != 429:
                    break
                if idx < len(candidates) - 1:
                    logger.warning("Quota Mistral atteint sur %s, bascule sur %s", current, candidates[idx + 1])
            if last_status == 429:
                raise LLMRateLimited("Le service d'IA reçoit trop de demandes en ce moment")
            raise RuntimeError(f"API Mistral indisponible (HTTP {last_status})")


# --- Embeddings ------------------------------------------------------------


async def embed_batch(texts: list[str], model: Optional[str] = None, purpose: str = "embed") -> list[list[float]]:
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
            body = r.json()
            meter = usage.current()
            if meter is not None:
                tokens = (body.get("usage") or {}).get("prompt_tokens") or 0
                meter.add(purpose, model, prompt_tokens=tokens or _estimate_tokens("".join(batch)),
                          estimated=not tokens)
            data = body.get("data", [])
            # L'API renvoie un index par entree : on trie dessus plutot
            # que de se fier a l'ordre pour ne jamais desaligner un
            # vecteur de son chunk.
            for item in sorted(data, key=lambda d: d.get("index", 0)):
                out.append(item["embedding"])
    return out


async def embed(text: str, model: Optional[str] = None) -> list[float]:
    vectors = await embed_batch([text], model=model)
    if not vectors:
        raise RuntimeError("L'API Mistral n'a renvoyé aucun vecteur.")
    return vectors[0]


# --- Vision et OCR ---------------------------------------------------------


async def describe_image(
    image_b64: str,
    prompt: str,
    model: Optional[str] = None,
    mime_type: str = "image/jpeg",
) -> str:
    """Transcrit/decrit une image via le modele de vision. Mistral attend
    l'image dans un bloc de contenu `image_url` en data-URI."""
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": f"data:{mime_type};base64,{image_b64}"},
    ]
    return await chat(
        [{"role": "user", "content": content}],
        model=model or settings.mistral_vision_model,
        temperature=0.1,
        purpose="vision",
    )


def _page_markdown(page: dict) -> str:
    """Le texte d'une page OCR. Selon les options, les tableaux peuvent
    etre renvoyes a part et remplaces par un lien `[tbl-0.md](tbl-0.md)`
    dans le Markdown : on les reinjecte a leur place."""
    text = page.get("markdown") or ""
    for table in page.get("tables") or []:
        table_id = table.get("id")
        body = table.get("content") or table.get("markdown") or ""
        if table_id and body:
            text = text.replace(f"[{table_id}]({table_id})", body)
    return text.strip()


async def ocr_image(image_b64: str, mime_type: str = "image/png") -> str:
    """Transcrit une image (page scannee, photo de document) avec l'API OCR
    dediee de Mistral, facturee a la page et plus fidele qu'un modele de
    vision generaliste sur les chiffres et les tableaux."""
    async with queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await _post(
                client,
                "/v1/ocr",
                {
                    "model": settings.mistral_ocr_model,
                    "document": {"type": "image_url", "image_url": f"data:{mime_type};base64,{image_b64}"},
                },
            )
    data = r.json()
    pages = data.get("pages") or []
    meter = usage.current()
    if meter is not None:
        processed = (data.get("usage_info") or {}).get("pages_processed") or len(pages) or 1
        meter.add("ocr", settings.mistral_ocr_model, pages=processed)
    return "\n\n".join(_page_markdown(p) for p in pages).strip()


# --- Sante et validation de cle -------------------------------------------


async def validate_api_key(api_key: str) -> bool:
    """Vrai si Mistral accepte cette cle (appel gratuit a /v1/models)."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            r = await client.get(_url("/v1/models"), headers=_headers(api_key))
            return r.status_code == 200
    except httpx.HTTPError:
        return False


async def health() -> dict:
    """Verifie que l'API Mistral repond et que la cle est valide. Remplace
    l'ancien `list_models()` qui interrogeait l'instance Ollama locale."""
    if not settings.mistral_api_key:
        return {"reachable": False, "reason": "MISTRAL_API_KEY absente"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            r = await client.get(_url("/v1/models"), headers=_headers(settings.mistral_api_key))
            r.raise_for_status()
            models = [m.get("id") for m in r.json().get("data", [])]
            return {"reachable": True, "models_available": models}
    except Exception as exc:  # noqa: BLE001
        logger.warning("API Mistral injoignable : %s", exc)
        return {"reachable": False, "reason": str(exc)[:200]}
