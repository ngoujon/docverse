import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "app.db"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


class Settings:
    ollama_base_url: str = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
    chat_model: str = os.environ.get("OLLAMA_CHAT_MODEL", "llama3.1:8b")
    vision_model: str = os.environ.get("OLLAMA_VISION_MODEL", "llava:7b")
    embed_model: str = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

    searxng_base_url: str = os.environ.get("SEARXNG_BASE_URL", "http://searxng:8080")

    max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "50"))

    chunk_size: int = int(os.environ.get("CHUNK_SIZE", "1200"))
    chunk_overlap: int = int(os.environ.get("CHUNK_OVERLAP", "150"))
    retrieval_top_k: int = int(os.environ.get("RETRIEVAL_TOP_K", "6"))

    cors_origins: list[str] = ["*"]


settings = Settings()
