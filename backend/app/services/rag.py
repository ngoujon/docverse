"""Retrieval-augmented generation: finds the passages relevant to a
question (vector search, LLM reranking, optional live web search) and builds
the prompt the chat model answers from, with numbered citations."""

import re

from ..config import settings
from . import llm_provider, vectorstore, websearch

# --- Web search decision ------------------------------------------------------

_WEB_SEARCH_CLASSIFIER_PROMPT = (
    "Cette question porte-t-elle sur une information changeante ou "
    "actuelle (meteo, actualite, prix, sport, evenement recent, "
    "horaires...) qu'il faut verifier sur internet plutot que dans des "
    "documents personnels ? Reponds uniquement par OUI ou NON.\n\n"
    "Question : {query}"
)

# Very short greetings/acknowledgements obviously never need a web search -
# skipping the LLM classifier call for these is a free latency win with no
# risk of missing a real case, since anything even slightly ambiguous still
# falls through to the classifier below.
_OBVIOUSLY_NO_SEARCH_RE = re.compile(
    r"^\s*(bonjour|salut|coucou|hello+|hi|hey|yo|merci|thanks?( you)?|"
    r"ok|okay|d'accord|super|parfait|cool|bien|bye|au revoir|a bientot)"
    r"\s*[!.,?]*\s*$",
    re.IGNORECASE,
)


async def _should_auto_search_web(query: str) -> bool:
    """Lightweight classification call asking the chat model whether this
    query needs live web data. Used when the user hasn't manually enabled
    web search, so the assistant still has the reflex to search when it
    matters. Fails closed (no search) on any error."""
    stripped = query.strip()
    if len(stripped) < 3 or _OBVIOUSLY_NO_SEARCH_RE.match(stripped):
        return False
    try:
        answer = await llm_provider.chat(
            [{"role": "user", "content": _WEB_SEARCH_CLASSIFIER_PROMPT.format(query=query)}],
            temperature=0,
        )
    except Exception:
        return False
    return answer.strip().upper().startswith("OUI")


# --- Reranking ---------------------------------------------------------------
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


# --- Context assembly ----------------------------------------------------------

_SYSTEM_PROMPT_TEMPLATE = (
    "Tu es l'assistant de l'espace de travail « {space_name} ». "
    "Tu aides l'utilisateur en t'appuyant en priorite sur les documents "
    "fournis dans cet espace (PDF, images, pages web, fichiers). "
    "Ces documents ont pu etre lus et transcrits par une IA de vision, "
    "donc considere leur contenu comme du texte fiable.\n\n"
    "Regles :\n"
    "- Utilise en priorite le CONTEXTE ci-dessous pour repondre.\n"
    "- Cite tes sources avec les marqueurs [1], [2], ... correspondant aux "
    "extraits fournis, directement dans ta reponse.\n"
    "- Si le contexte ne contient pas la reponse et qu'aucune recherche web "
    "n'est fournie, dis clairement que l'information n'est pas presente "
    "dans les documents de l'espace, puis reponds avec tes connaissances "
    "generales en le precisant explicitement.\n"
    "- Si des extraits marques (web: ...) sont presents dans le CONTEXTE, "
    "precise explicitement dans ta reponse que cette information a ete "
    "trouvee via une recherche internet automatique, en dehors des "
    "documents fournis dans cet espace - ne la presente jamais comme si "
    "elle venait des documents de l'espace.\n"
    "- Reponds dans la langue de l'utilisateur, de maniere claire et "
    "structuree (listes, markdown si utile)."
)


async def retrieve_document_context(
    space_id: str, query: str, doc_ids: list[str] | None = None
) -> list[dict]:
    embedding = await llm_provider.embed(query)
    pool = settings.rerank_candidate_pool
    top_k = settings.retrieval_top_k
    if doc_ids:
        # "@name"-scoped question: no other document competes for the slots,
        # so pull a deeper slice of the mentioned one(s) instead of the
        # usual space-wide budget.
        pool = max(pool, 40)
        top_k = max(top_k, 12)
    candidates = vectorstore.query(space_id, embedding, top_k=pool, doc_ids=doc_ids)
    return await rerank(query, candidates, top_k)


async def gather_context(
    space_id: str, query: str, doc_ids: list[str] | None = None
) -> tuple[str, list[dict]]:
    """Builds a numbered context block and a parallel list of source
    descriptors used for citations in the UI."""
    doc_results = await retrieve_document_context(space_id, query, doc_ids)

    do_web_search = await _should_auto_search_web(query)
    web_results = await websearch.search_web(query) if do_web_search else []

    # Documents first, then web results; the [n] markers are numbered across
    # both so the model's inline citations map back onto `sources` by index.
    sources: list[dict] = []
    context_lines: list[str] = []
    for res in doc_results:
        meta = res.get("metadata", {})
        name = meta.get("doc_name", "document")
        sources.append({"type": "document", "label": name, "doc_id": meta.get("doc_id")})
        context_lines.append(f"(document: {name})\n{res['text']}")
    for res in web_results:
        sources.append({"type": "web", "label": res["title"], "url": res["url"]})
        context_lines.append(f"(web: {res['title']} - {res['url']})\n{res['content']}")
    context_lines = [f"[{i}] {line}" for i, line in enumerate(context_lines, start=1)]

    context_block = "\n\n".join(context_lines) if context_lines else "(aucun contexte pertinent trouve)"
    return context_block, sources


def build_llm_messages(
    space_name: str,
    history: list[dict],
    context_block: str,
    user_message: str,
) -> list[dict]:
    system = {
        "role": "system",
        "content": _SYSTEM_PROMPT_TEMPLATE.format(space_name=space_name),
    }
    context_msg = {
        "role": "system",
        "content": f"CONTEXTE DISPONIBLE POUR CETTE QUESTION:\n\n{context_block}",
    }
    convo = [{"role": m["role"], "content": m["content"]} for m in history]
    user = {"role": "user", "content": user_message}
    return [system, *convo, context_msg, user]
