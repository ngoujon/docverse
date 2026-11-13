import asyncio

from app.services import rag


def _candidates(n: int) -> list[dict]:
    return [{"text": f"extrait numero {i}", "metadata": {"doc_name": f"doc{i}.txt"}} for i in range(n)]


def test_parse_order_extracts_valid_deduplicated_indices():
    assert rag._parse_order("3, 1, 7, 1, 9", count=5) == [2, 0]


def test_parse_order_ignores_out_of_range_and_garbage():
    assert rag._parse_order("Voici les numeros : 2 et 42 et 0", count=3) == [1]


def test_rerank_skips_llm_call_when_pool_not_larger_than_top_k():
    async def _run():
        candidates = _candidates(3)
        result = await rag.rerank("question", candidates, top_k=5)
        assert result == candidates

    asyncio.run(_run())


def test_rerank_reorders_by_model_response(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3, **kwargs):
        return "3,1"

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await rag.rerank("question", candidates, top_k=2)
        assert result == [candidates[2], candidates[0]]

    asyncio.run(_run())


def test_rerank_falls_back_to_vector_order_on_llm_failure(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await rag.rerank("question", candidates, top_k=2)
        assert result == candidates[:2]

    asyncio.run(_run())


def test_rerank_pads_when_model_returns_too_few_indices(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3, **kwargs):
        return "2"

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await rag.rerank("question", candidates, top_k=3)
        assert result[0] == candidates[1]
        assert len(result) == 3

    asyncio.run(_run())


# --- Tri + décision web en un seul appel -------------------------------------------


def test_parse_route_and_order_reads_both_lines():
    assert rag._parse_route_and_order("WEB: OUI\nORDRE: 4,1", count=5) == (True, [3, 0])
    assert rag._parse_route_and_order("WEB: NON\nORDRE: 2", count=5) == (False, [1])


def test_parse_route_and_order_tolerates_markdown_and_missing_order_label():
    # The WEB line's own digits must not leak into the order.
    assert rag._parse_route_and_order("**WEB : non**\n3, 2", count=5) == (False, [2, 1])


def test_rerank_and_route_makes_one_call_with_the_fast_model(monkeypatch):
    calls = []

    async def fake_chat(messages, model=None, temperature=0.3, purpose="chat"):
        calls.append((model, purpose))
        return "WEB: OUI\nORDRE: 2,1"

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)
    candidates = _candidates(5)
    kept, needs_web = asyncio.run(rag.rerank_and_route("météo à Lyon ?", candidates, top_k=2))

    assert kept == [candidates[1], candidates[0]]
    assert needs_web is True
    assert calls == [(rag.settings.mistral_fast_model, "rerank")]


def test_rerank_and_route_only_classifies_when_nothing_to_sort(monkeypatch):
    calls = []

    async def fake_chat(messages, model=None, temperature=0.3, purpose="chat"):
        calls.append(purpose)
        return "NON"

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)
    candidates = _candidates(2)
    kept, needs_web = asyncio.run(rag.rerank_and_route("question", candidates, top_k=6))

    assert kept == candidates
    assert needs_web is False
    assert calls == ["classify"]


def test_rerank_and_route_skips_decision_for_greetings(monkeypatch):
    async def fake_chat(*args, **kwargs):
        raise AssertionError("no LLM call expected")

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)
    assert asyncio.run(rag.rerank_and_route("Merci !", _candidates(2), top_k=6)) == (_candidates(2), False)


def test_rerank_and_route_falls_back_on_failure(monkeypatch):
    async def fake_chat(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)
    candidates = _candidates(5)
    assert asyncio.run(rag.rerank_and_route("question", candidates, top_k=2)) == (candidates[:2], False)


def test_trim_history_keeps_last_messages_and_truncates_long_ones():
    history = [{"role": "user", "content": f"m{i}"} for i in range(10)]
    history[-1] = {"role": "assistant", "content": "x" * 50}
    trimmed = rag.trim_history(history, limit=3, max_chars=10)
    # the conversation's first question stays pinned in front of the window
    assert [m["content"][:2] for m in trimmed] == ["m0", "m7", "m8", "xx"]
    assert trimmed[-1]["content"] == "x" * 10 + " […]"
    assert rag.trim_history(history, limit=0, max_chars=10) == []


# --- Questions portant sur tout l'espace (retour utilisateur : 11 PDF,
# l'IA « ne voyait que 6 fichiers ») -------------------------------------------

def _space_docs(n: int) -> list[dict]:
    return [{"id": f"d{i}", "name": f"article{i}.pdf"} for i in range(n)]


def _fake_store(monkeypatch, calls: list):
    """Faux index : chaque document a 5 extraits ; sans filtre, la recherche
    renvoie toujours les extraits des documents d0 et d1 (les plus proches)."""
    def fake_query(space_id, embedding, top_k=6, doc_ids=None):
        calls.append((top_k, doc_ids))
        if doc_ids:
            return [
                {"text": f"{d} extrait {j}", "metadata": {"doc_id": d, "doc_name": f"{d}.pdf"}}
                for d in doc_ids for j in range(min(top_k, 5))
            ]
        return [
            {"text": f"extrait {j}", "metadata": {"doc_id": f"d{j % 2}", "doc_name": "x.pdf"}}
            for j in range(top_k)
        ]

    async def fake_embed(text):
        return [0.0]

    async def no_web(query):
        return False

    monkeypatch.setattr(rag.vectorstore, "query", fake_query)
    monkeypatch.setattr(rag.llm_provider, "embed", fake_embed)
    monkeypatch.setattr(rag, "_should_auto_search_web", no_web)


def test_is_broad_question_detects_space_wide_questions():
    assert rag.is_broad_question("Quelle est la méthodologie de chaque article ?")
    assert rag.is_broad_question("Fais un tableau des résultats de tous les articles")
    assert rag.is_broad_question("Résume mes documents")
    assert not rag.is_broad_question("Quelle est la taille de l'échantillon de l'étude Dupont ?")


def test_broad_question_covers_every_document_of_the_space(monkeypatch):
    calls = []
    _fake_store(monkeypatch, calls)
    docs = _space_docs(11)

    results, needs_web = asyncio.run(
        rag.retrieve_document_context("s", "Donne l'année de publication de chaque article", documents=docs)
    )

    covered = {r["metadata"]["doc_id"] for r in results}
    assert covered == {d["id"] for d in docs}  # les 11, pas 6
    assert len(results) == 22  # 2 extraits par document (budget 24)
    assert needs_web is False


def test_broad_question_with_many_documents_keeps_one_excerpt_per_document(monkeypatch):
    def fake_query(space_id, embedding, top_k=6, doc_ids=None):
        return [
            {"text": f"extrait {j}", "metadata": {"doc_id": f"d{j % 40}", "doc_name": "x.pdf"}}
            for j in range(top_k)
        ]

    async def fake_embed(text):
        return [0.0]

    async def no_web(query):
        return False

    monkeypatch.setattr(rag.vectorstore, "query", fake_query)
    monkeypatch.setattr(rag.llm_provider, "embed", fake_embed)
    monkeypatch.setattr(rag, "_should_auto_search_web", no_web)

    results, _ = asyncio.run(
        rag.retrieve_document_context("s", "Compare tous les articles", documents=_space_docs(40))
    )
    doc_ids = [r["metadata"]["doc_id"] for r in results]
    assert len(doc_ids) == 24 and len(set(doc_ids)) == 24


def test_precise_question_keeps_the_usual_retrieval(monkeypatch):
    calls = []
    _fake_store(monkeypatch, calls)

    async def fake_chat(messages, model=None, temperature=0.3, **kwargs):
        return "WEB: NON\nORDRE: 1,2,3,4,5,6"

    monkeypatch.setattr(rag.llm_provider, "chat", fake_chat)
    results, _ = asyncio.run(
        rag.retrieve_document_context("s", "Quelle est la taille de l'échantillon ?", documents=_space_docs(11))
    )
    assert len(results) == 6
    assert calls == [(20, None)]


def test_system_prompt_lists_every_document_of_the_space():
    docs = _space_docs(11)
    messages = rag.build_llm_messages("Thèse", [], "(contexte)", "question", documents=docs)
    system = messages[0]["content"]
    assert "11 document(s)" in system
    for d in docs:
        assert d["name"] in system
    assert "@" in system
    # sans inventaire (appel historique), le prompt ne change pas
    assert rag.build_llm_messages("Thèse", [], "(c)", "q")[0]["content"] == rag._SYSTEM_PROMPT_TEMPLATE.format(
        space_name="Thèse"
    )
