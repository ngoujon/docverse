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
