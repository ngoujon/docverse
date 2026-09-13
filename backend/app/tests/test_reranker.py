import asyncio

from app.services import reranker


def _candidates(n: int) -> list[dict]:
    return [{"text": f"extrait numero {i}", "metadata": {"doc_name": f"doc{i}.txt"}} for i in range(n)]


def test_parse_order_extracts_valid_deduplicated_indices():
    assert reranker._parse_order("3, 1, 7, 1, 9", count=5) == [2, 0]


def test_parse_order_ignores_out_of_range_and_garbage():
    assert reranker._parse_order("Voici les numeros : 2 et 42 et 0", count=3) == [1]


def test_rerank_skips_llm_call_when_pool_not_larger_than_top_k():
    async def _run():
        candidates = _candidates(3)
        result = await reranker.rerank("question", candidates, top_k=5)
        assert result == candidates

    asyncio.run(_run())


def test_rerank_reorders_by_model_response(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3):
        return "3,1"

    monkeypatch.setattr(reranker.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await reranker.rerank("question", candidates, top_k=2)
        assert result == [candidates[2], candidates[0]]

    asyncio.run(_run())


def test_rerank_falls_back_to_vector_order_on_llm_failure(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3):
        raise RuntimeError("boom")

    monkeypatch.setattr(reranker.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await reranker.rerank("question", candidates, top_k=2)
        assert result == candidates[:2]

    asyncio.run(_run())


def test_rerank_pads_when_model_returns_too_few_indices(monkeypatch):
    async def fake_chat(messages, model=None, temperature=0.3):
        return "2"

    monkeypatch.setattr(reranker.llm_provider, "chat", fake_chat)

    async def _run():
        candidates = _candidates(5)
        result = await reranker.rerank("question", candidates, top_k=3)
        assert result[0] == candidates[1]
        assert len(result) == 3

    asyncio.run(_run())
