import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger("open-rag.config")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "app.db"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


def _parse_origins(raw: str) -> list[str]:
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["*"]


class Settings:
    ollama_base_url: str = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
    chat_model: str = os.environ.get("OLLAMA_CHAT_MODEL", "llama3.1:8b")
    vision_model: str = os.environ.get("OLLAMA_VISION_MODEL", "llava:7b")
    embed_model: str = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

    # Requests to Ollama (chat, embeddings, vision) are serialized through a
    # queue so a small, CPU-only VPS doesn't get overwhelmed by concurrent
    # users. Only raise this if Ollama actually has the RAM/GPU headroom to
    # run several inferences at once.
    ollama_max_concurrency: int = int(os.environ.get("OLLAMA_MAX_CONCURRENCY", "1"))

    searxng_base_url: str = os.environ.get("SEARXNG_BASE_URL", "http://searxng:8080")

    max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "50"))

    chunk_size: int = int(os.environ.get("CHUNK_SIZE", "1200"))
    chunk_overlap: int = int(os.environ.get("CHUNK_OVERLAP", "150"))
    retrieval_top_k: int = int(os.environ.get("RETRIEVAL_TOP_K", "6"))

    cors_origins: list[str] = _parse_origins(os.environ.get("CORS_ORIGINS", "*"))

    # Signs the short-lived access tokens issued when someone unlocks a
    # password-protected workspace. Set a stable, random value in .env for
    # production so tokens survive backend restarts.
    secret_key: str = os.environ.get("SECRET_KEY", "")
    space_token_ttl_hours: int = int(os.environ.get("SPACE_TOKEN_TTL_HOURS", "24"))

    contact_email: str = os.environ.get("CONTACT_EMAIL", "")


settings = Settings()

if not settings.secret_key:
    settings.secret_key = secrets.token_hex(32)
    logger.warning(
        "SECRET_KEY non definie : une cle ephemere a ete generee. Les acces "
        "aux espaces proteges par mot de passe seront invalides apres "
        "chaque redemarrage du backend. Definissez SECRET_KEY dans .env "
        "pour la production."
    )
