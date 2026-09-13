import re

from . import llm_provider

_RERANK_PROMPT = (
    "Question de l'utilisateur : {query}\n\n"
    "Voici {count} extraits de documents numerotes, retrouves par recherche "
    "vectorielle (l'ordre n'indique pas leur pertinence reelle). Choisis les "
    "{top_k} extraits les PLUS PERTINENTS pour repondre a la question, du "
    "plus au moins pertinent. Reponds uniquement avec leurs numeros separes "
    "par des virgules (ex: 4,1,7), sans autre texte.\n\n"
    "{candidates_block}"
)

# Keeps the reranking prompt (and its token cost) bounded regardless of how
# long an individual chunk is - only need enough text to judge relevance.
_MAX_CHARS_PER_CANDIDATE = 500


def _format_candidates(candidates: list[dict]) -> str:
    parts = []
    for i, c in enumerate(candidates, start=1):
        text = c["text"][:_MAX_CHARS_PER_CANDIDATE]
        parts.append(f"[{i}] {text}")
    return "\n\n".join(parts)


def _parse_order(response: str, count: int) -> list[int]:
    """Extracts a list of valid, deduplicated 0-based indices from the
    model's reply, in the order given - tolerant of extra text/formatting
    since this is free-form model output, not a structured API."""
    seen: set[int] = set()
    order: list[int] = []
    for match in re.findall(r"\d+", response):
        n = int(match) - 1
        if 0 <= n < count and n not in seen:
            seen.add(n)
            order.append(n)
    return order


async def rerank(query: str, candidates: list[dict], top_k: int) -> list[dict]:
    """Reorders vector-search candidates by asking the chat model to judge
    relevance directly, then truncates to top_k. Falls back to the original
    vector-similarity order (first top_k) on any failure or malformed
    response - this is a quality improvement on top of retrieval, never a
    hard dependency that can break answering."""
    if len(candidates) <= top_k:
        return candidates

    fallback = candidates[:top_k]
    try:
        response = await llm_provider.chat(
            [
                {
                    "role": "user",
                    "content": _RERANK_PROMPT.format(
                        query=query,
                        count=len(candidates),
                        top_k=top_k,
                        candidates_block=_format_candidates(candidates),
                    ),
                }
            ],
            temperature=0,
        )
    except Exception:
        return fallback

    order = _parse_order(response, len(candidates))
    if not order:
        return fallback

    reranked = [candidates[i] for i in order[:top_k]]
    if len(reranked) < top_k:
        # Model returned fewer valid indices than requested - pad with the
        # highest vector-similarity candidates not already included.
        picked = {id(c) for c in reranked}
        for c in candidates:
            if len(reranked) >= top_k:
                break
            if id(c) not in picked:
                reranked.append(c)
    return reranked
