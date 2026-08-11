import logging

import chromadb
from chromadb.config import Settings as ChromaSettings

from ..config import CHROMA_DIR

logger = logging.getLogger("hyaides.vectorstore")

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


def query(space_id: str, query_embedding: list[float], top_k: int = 6) -> list[dict]:
    collection = get_collection(space_id)
    if collection.count() == 0:
        return []
    top_k = min(top_k, collection.count())
    results = collection.query(query_embeddings=[query_embedding], n_results=top_k)
    out = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]
    for text, meta, dist in zip(docs, metas, dists):
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
