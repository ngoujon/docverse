from . import ollama_client, vectorstore, websearch
from ..config import settings

_WEB_SEARCH_CLASSIFIER_PROMPT = (
    "Cette question porte-t-elle sur une information changeante ou "
    "actuelle (meteo, actualite, prix, sport, evenement recent, "
    "horaires...) qu'il faut verifier sur internet plutot que dans des "
    "documents personnels ? Reponds uniquement par OUI ou NON.\n\n"
    "Question : {query}"
)


async def _should_auto_search_web(query: str) -> bool:
    """Lightweight classification call asking the chat model whether this
    query needs live web data. Used when the user hasn't manually enabled
    web search, so the assistant still has the reflex to search when it
    matters. Fails closed (no search) on any error."""
    try:
        answer = await ollama_client.chat(
            [{"role": "user", "content": _WEB_SEARCH_CLASSIFIER_PROMPT.format(query=query)}],
            temperature=0,
        )
    except Exception:
        return False
    return answer.strip().upper().startswith("OUI")


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
    "- Distingue dans ta reponse ce qui vient des documents de l'espace et "
    "ce qui vient du web si les deux sont presents.\n"
    "- Reponds dans la langue de l'utilisateur, de maniere claire et "
    "structuree (listes, markdown si utile)."
)


async def retrieve_document_context(space_id: str, query: str) -> list[dict]:
    embedding = await ollama_client.embed(query)
    results = vectorstore.query(space_id, embedding, top_k=settings.retrieval_top_k)
    return results


async def gather_context(
    space_id: str, query: str, web_search_enabled: bool
) -> tuple[str, list[dict]]:
    """Builds a numbered context block and a parallel list of source
    descriptors used for citations in the UI."""
    doc_results = await retrieve_document_context(space_id, query)

    do_web_search = web_search_enabled or await _should_auto_search_web(query)
    web_results = await websearch.search_web(query) if do_web_search else []

    sources: list[dict] = []
    context_lines: list[str] = []
    idx = 1

    for res in doc_results:
        meta = res.get("metadata", {})
        sources.append(
            {
                "type": "document",
                "label": meta.get("doc_name", "document"),
                "doc_id": meta.get("doc_id"),
            }
        )
        context_lines.append(
            f"[{idx}] (document: {meta.get('doc_name', 'document')})\n{res['text']}"
        )
        idx += 1

    for res in web_results:
        sources.append(
            {
                "type": "web",
                "label": res["title"],
                "url": res["url"],
            }
        )
        context_lines.append(
            f"[{idx}] (web: {res['title']} - {res['url']})\n{res['content']}"
        )
        idx += 1

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
