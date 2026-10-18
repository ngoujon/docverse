"""Per-space vector database (ChromaDB): one cosine-similarity collection
per workspace holding every ingested chunk, plus a 2D projection of it for
the "knowledge graph" visualization."""

import logging

import chromadb
import numpy as np
from chromadb.config import Settings as ChromaSettings

from ..config import CHROMA_DIR

logger = logging.getLogger("docverse.vectorstore")

_client = chromadb.PersistentClient(
    path=str(CHROMA_DIR), settings=ChromaSettings(anonymized_telemetry=False)
)


def _collection_name(space_id: str) -> str:
    return f"space_{space_id}"


def get_collection(space_id: str):
    return _client.get_or_create_collection(
        name=_collection_name(space_id), metadata={"hnsw:space": "cosine"}
    )


def add_chunks(
    space_id: str,
    doc_id: str,
    doc_name: str,
    chunks: list[str],
    embeddings: list[list[float]],
) -> None:
    if not chunks:
        return
    collection = get_collection(space_id)
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "doc_name": doc_name, "chunk_index": i}
        for i in range(len(chunks))
    ]
    collection.add(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)


def get_all(space_id: str) -> dict:
    """Returns every chunk in a space's collection with its embedding,
    text and metadata - used to build the vector-space visualization."""
    collection = get_collection(space_id)
    if collection.count() == 0:
        return {"ids": [], "embeddings": [], "documents": [], "metadatas": []}
    result = collection.get(include=["embeddings", "documents", "metadatas"])
    return {
        "ids": result.get("ids", []),
        "embeddings": result.get("embeddings", []),
        "documents": result.get("documents", []),
        "metadatas": result.get("metadatas", []),
    }


def query(
    space_id: str,
    query_embedding: list[float],
    top_k: int = 6,
    doc_ids: list[str] | None = None,
) -> list[dict]:
    collection = get_collection(space_id)
    if collection.count() == 0:
        return []
    top_k = min(top_k, collection.count())
    kwargs = {"query_embeddings": [query_embedding], "n_results": top_k}
    if doc_ids:
        kwargs["where"] = {"doc_id": {"$in": doc_ids}}
    results = collection.query(**kwargs)
    out = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]
    for text, meta, dist in zip(docs, metas, dists, strict=False):
        out.append({"text": text, "metadata": meta, "distance": dist})
    return out


def delete_document(space_id: str, doc_id: str) -> None:
    collection = get_collection(space_id)
    try:
        collection.delete(where={"doc_id": doc_id})
    except Exception:
        # Best-effort: the SQL row is the source of truth and is deleted
        # regardless, but a real Chroma failure (not just "already gone")
        # should still be visible in the logs instead of vanishing.
        logger.exception("Echec de la suppression du document %s (espace %s) dans Chroma", doc_id, space_id)


def delete_space(space_id: str) -> None:
    try:
        _client.delete_collection(_collection_name(space_id))
    except Exception:
        logger.exception("Echec de la suppression de la collection Chroma pour l'espace %s", space_id)


# --- 2D visualization -----------------------------------------------------------
# Every chunk projected down to a point (PCA, plain numpy - no extra ML
# dependency) plus edges to its nearest neighbors in the original embedding
# space, so the UI can render how a space's knowledge is organized.

_MAX_NODES = 800  # keeps the O(n^2) similarity matrix cheap on a small VPS
_NEIGHBORS_PER_NODE = 3


def _normalize(embeddings: np.ndarray) -> np.ndarray:
    """L2-normalizes each row (zero vectors are left untouched)."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return embeddings / norms


def _project_2d(embeddings: np.ndarray) -> np.ndarray:
    if len(embeddings) < 2:
        return np.zeros((len(embeddings), 2))
    centered = embeddings - embeddings.mean(axis=0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    components = vt[: min(2, vt.shape[0])]
    coords = centered @ components.T
    if coords.shape[1] < 2:
        coords = np.pad(coords, ((0, 0), (0, 2 - coords.shape[1])))
    max_abs = np.max(np.abs(coords)) or 1.0
    return coords / max_abs * 100


def _knn_edges(normalized: np.ndarray, ids: list[str], k: int) -> list[tuple[str, str]]:
    if len(ids) < 2:
        return []
    similarity = normalized @ normalized.T
    n = len(ids)
    k = min(k, n - 1)
    edges: set[tuple[int, int]] = set()
    for i in range(n):
        row = similarity[i].copy()
        row[i] = -2.0
        for j in np.argpartition(row, -k)[-k:]:
            edges.add((min(i, int(j)), max(i, int(j))))
    return [(ids[i], ids[j]) for i, j in edges]


def build_graph(space_id: str) -> dict:
    data = get_all(space_id)
    ids: list[str] = list(data["ids"])[:_MAX_NODES]
    if not ids:
        return {"nodes": [], "edges": [], "truncated": False}
    documents: list[str] = list(data["documents"])[:_MAX_NODES]
    metadatas: list[dict] = list(data["metadatas"])[:_MAX_NODES]
    # The collection uses cosine similarity, so normalizing before PCA makes
    # the 2D layout reflect *that* similarity space (direction only) instead
    # of raw Euclidean distance - otherwise the picture wouldn't match how
    # retrieval sees the same chunks as close or far apart.
    normalized = _normalize(np.array(data["embeddings"][:_MAX_NODES], dtype=np.float64))
    coords = _project_2d(normalized)

    nodes = [
        {
            "id": ids[i],
            "doc_id": metadatas[i].get("doc_id", ""),
            "doc_name": metadatas[i].get("doc_name", "document"),
            "text_preview": (documents[i] or "")[:180],
            "x": float(coords[i][0]),
            "y": float(coords[i][1]),
        }
        for i in range(len(ids))
    ]
    edges = _knn_edges(normalized, ids, _NEIGHBORS_PER_NODE)
    return {
        "nodes": nodes,
        "edges": [{"source": a, "target": b} for a, b in edges],
        "truncated": len(data["ids"]) > _MAX_NODES,
    }
