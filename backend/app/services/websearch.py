import asyncio

import httpx

from ..config import settings
from . import document_processor

_FETCH_TOP_N = 3


async def _try_fetch_full_text(url: str) -> str | None:
    try:
        _, text = await document_processor.extract_text_from_url(url)
        return text[:4000] if text else None
    except Exception:
        return None


async def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Query the local SearXNG instance and enrich the top results with
    full page text when possible. Returns [{title, url, content}]."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"{settings.searxng_base_url}/search",
            params={"q": query, "format": "json", "language": "fr"},
        )
        r.raise_for_status()
        data = r.json()

    results = data.get("results", [])[:max_results]
    enriched: list[dict] = []

    fetch_tasks = [
        _try_fetch_full_text(res["url"])
        for res in results[:_FETCH_TOP_N]
        if res.get("url")
    ]
    fetched_texts = await asyncio.gather(*fetch_tasks) if fetch_tasks else []

    for i, res in enumerate(results):
        content = res.get("content", "") or ""
        if i < len(fetched_texts) and fetched_texts[i]:
            content = fetched_texts[i]
        enriched.append(
            {
                "title": res.get("title", res.get("url", "")),
                "url": res.get("url", ""),
                "content": content,
            }
        )
    return enriched
