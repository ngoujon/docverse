import contextlib
import json
from typing import AsyncGenerator, Optional

import httpx

from ..config import settings
from . import queue_manager

_TIMEOUT = httpx.Timeout(300.0, connect=10.0)


def _chat_base_url() -> str:
    return settings.ollama_cloud_base_url if settings.use_ollama_cloud else settings.ollama_base_url


def _chat_headers() -> dict:
    if settings.use_ollama_cloud:
        return {"Authorization": f"Bearer {settings.ollama_cloud_api_key}"}
    return {}


@contextlib.asynccontextmanager
async def _maybe_queue():
    # The local single-worker queue exists to protect a small, CPU-only
    # Ollama instance from concurrent overload. Ollama Cloud manages its
    # own capacity, so cloud chat/vision calls skip it entirely - that's
    # the whole point of switching (more reactive, not serialized behind
    # whatever else is running locally). Embeddings always go through it
    # since they always hit the local instance regardless of provider.
    if settings.use_ollama_cloud:
        yield
    else:
        async with queue_manager.queue_slot():
            yield


async def list_models() -> list[str]:
    """Always queries the LOCAL Ollama instance - used to check which
    models are pulled there (embeddings always run locally; chat/vision
    only run locally when Ollama Cloud isn't configured)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(f"{settings.ollama_base_url}/api/tags")
        r.raise_for_status()
        data = r.json()
        return [m["name"] for m in data.get("models", [])]


async def embed(text: str, model: Optional[str] = None) -> list[float]:
    model = model or settings.embed_model
    async with queue_manager.queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            r.raise_for_status()
            data = r.json()
            return data["embedding"]


async def chat(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> str:
    model = model or (settings.ollama_cloud_chat_model if settings.use_ollama_cloud else settings.chat_model)
    async with _maybe_queue():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{_chat_base_url()}/api/chat",
                headers=_chat_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": temperature},
                },
            )
            r.raise_for_status()
            data = r.json()
            return data.get("message", {}).get("content", "")


async def chat_stream(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    model = model or (settings.ollama_cloud_chat_model if settings.use_ollama_cloud else settings.chat_model)
    async with _maybe_queue():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{_chat_base_url()}/api/chat",
                headers=_chat_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {"temperature": temperature},
                },
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if chunk.get("done"):
                        break


async def describe_image(
    image_b64: str,
    prompt: str,
    model: Optional[str] = None,
) -> str:
    """Send an image to the vision model and get back a rich text
    transcription/description (used for OCR-like indexing)."""
    model = model or (settings.ollama_cloud_vision_model if settings.use_ollama_cloud else settings.vision_model)
    async with _maybe_queue():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{_chat_base_url()}/api/chat",
                headers=_chat_headers(),
                json={
                    "model": model,
                    "stream": False,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                            "images": [image_b64],
                        }
                    ],
                    "options": {"temperature": 0.1},
                },
            )
            r.raise_for_status()
            data = r.json()
            return data.get("message", {}).get("content", "")
