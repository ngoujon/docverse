"""Builds a 2D visualization of a space's vector database: every ingested
chunk projected down to a point (PCA, plain numpy - no extra ML
dependency) plus edges to its nearest neighbors in the original embedding
space, so the UI can render "how this space's knowledge is organized" as
a graph instead of a black box."""

import numpy as np

from . import vectorstore

_MAX_NODES = 800  # keeps the O(n^2) similarity matrix cheap on a small VPS
_NEIGHBORS_PER_NODE = 3


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


def _knn_edges(embeddings: np.ndarray, ids: list[str], k: int) -> list[tuple[str, str]]:
    if len(ids) < 2:
        return []
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normalized = embeddings / norms
    similarity = normalized @ normalized.T
    n = len(ids)
    k = min(k, n - 1)
    edges: set[tuple[int, int]] = set()
    for i in range(n):
        row = similarity[i].copy()
        row[i] = -2.0
        neighbor_idx = np.argpartition(row, -k)[-k:]
        for j in neighbor_idx:
            edges.add((min(i, int(j)), max(i, int(j))))
    return [(ids[i], ids[j]) for i, j in edges]


def build_graph(space_id: str) -> dict:
    data = vectorstore.get_all(space_id)
    ids: list[str] = list(data["ids"])
    embeddings_raw = data["embeddings"]
    documents: list[str] = list(data["documents"])
    metadatas: list[dict] = list(data["metadatas"])

    truncated = len(ids) > _MAX_NODES
    if truncated:
        ids = ids[:_MAX_NODES]
        embeddings_raw = embeddings_raw[:_MAX_NODES]
        documents = documents[:_MAX_NODES]
        metadatas = metadatas[:_MAX_NODES]

    if not ids:
        return {"nodes": [], "edges": [], "truncated": False}

    embeddings = np.array(embeddings_raw, dtype=np.float64)
    # The Chroma collection is configured for cosine similarity (see
    # vectorstore.get_collection), so L2-normalizing before PCA makes the
    # 2D layout reflect *that* similarity space (direction only) instead
    # of raw-vector Euclidean distance, which can disagree with it -
    # otherwise the picture wouldn't actually match how retrieval sees
    # the same chunks as close or far apart.
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normalized_embeddings = embeddings / norms
    coords = _project_2d(normalized_embeddings)
    edges = _knn_edges(embeddings, ids, _NEIGHBORS_PER_NODE)

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
    return {
        "nodes": nodes,
        "edges": [{"source": a, "target": b} for a, b in edges],
        "truncated": truncated,
    }
