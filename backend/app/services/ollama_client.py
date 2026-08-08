import json
from typing import AsyncGenerator, Optional

import httpx

from ..config import settings
from . import queue_manager

_TIMEOUT = httpx.Timeout(300.0, connect=10.0)


async def list_models() -> list[str]:
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
    model = model or settings.chat_model
    async with queue_manager.queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{settings.ollama_base_url}/api/chat",
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
    model = model or settings.chat_model
    async with queue_manager.queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/chat",
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
    model = model or settings.vision_model
    async with queue_manager.queue_slot():
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{settings.ollama_base_url}/api/chat",
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
