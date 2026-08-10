import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger("open-rag.config")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "app.db"
BACKUP_DIR = DATA_DIR / "backups"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _parse_origins(raw: str) -> list[str]:
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["*"]


class Settings:
    ollama_base_url: str = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
    chat_model: str = os.environ.get("OLLAMA_CHAT_MODEL", "llama3.1:8b")
    vision_model: str = os.environ.get("OLLAMA_VISION_MODEL", "llava:7b")
    embed_model: str = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

    # Ollama Cloud (https://ollama.com/models) speaks the same /api/chat
    # protocol as local Ollama, just hosted, auth'd with a bearer key, and
    # without an /api/embeddings route - so when a key is present, chat and
    # vision transparently switch to it for more reactive responses while
    # embeddings (used for retrieval) always stay on the local instance.
    ollama_cloud_api_key: str = os.environ.get("OLLAMA_CLOUD_API_KEY", "")
    ollama_cloud_base_url: str = os.environ.get("OLLAMA_CLOUD_BASE_URL", "https://ollama.com")
    ollama_cloud_chat_model: str = os.environ.get("OLLAMA_CLOUD_CHAT_MODEL", "gpt-oss:20b")
    ollama_cloud_vision_model: str = os.environ.get("OLLAMA_CLOUD_VISION_MODEL", "qwen3.5")

    @property
    def use_ollama_cloud(self) -> bool:
        return bool(self.ollama_cloud_api_key)

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

    # Signs user session tokens and short-lived purpose tokens (password
    # reset, newsletter confirmation). Set a stable, random value in .env
    # for production so tokens survive backend restarts.
    secret_key: str = os.environ.get("SECRET_KEY", "")
    user_token_ttl_days: int = int(os.environ.get("USER_TOKEN_TTL_DAYS", "30"))

    contact_email: str = os.environ.get("CONTACT_EMAIL", "")

    # Used to build absolute links in emails (password reset, newsletter
    # confirmation) since the backend doesn't know its own public URL.
    frontend_base_url: str = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")

    # --- LLM provider ---------------------------------------------------
    # "ollama" today; "mistral" once MISTRAL_API_KEY is provided and this
    # is flipped. See services/llm_provider.py.
    llm_provider: str = os.environ.get("LLM_PROVIDER", "ollama")
    mistral_api_key: str = os.environ.get("MISTRAL_API_KEY", "")
    mistral_base_url: str = os.environ.get("MISTRAL_BASE_URL", "https://api.mistral.ai")
    mistral_chat_model: str = os.environ.get("MISTRAL_CHAT_MODEL", "mistral-large-latest")
    mistral_vision_model: str = os.environ.get("MISTRAL_VISION_MODEL", "pixtral-large-latest")
    mistral_embed_model: str = os.environ.get("MISTRAL_EMBED_MODEL", "mistral-embed")

    # --- Outbound email ---------------------------------------------------
    # Left empty until real SMTP credentials are provided; mail_service
    # falls back to logging the email instead of sending it.
    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")
    smtp_use_tls: bool = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"
    smtp_from: str = os.environ.get("SMTP_FROM", "Open RAG <no-reply@open-rag.local>")

    # --- Abuse limits -----------------------------------------------------
    # A compromised or malicious account shouldn't be able to spam an
    # unbounded number of spaces or share links, regardless of plan - this
    # is a hard ceiling even for entreprise. PLAN_QUOTAS below is the real,
    # product-facing limit for everyone under that ceiling.
    max_spaces_per_user: int = int(os.environ.get("MAX_SPACES_PER_USER", "50"))
    max_share_links_per_space: int = int(os.environ.get("MAX_SHARE_LINKS_PER_SPACE", "20"))

    # --- Self-hosted proof-of-work captcha -------------------------------
    # Number of leading hex-zero characters required in the solved hash.
    # 5 is ~1M attempts on average - a few hundred ms in a browser tab,
    # expensive enough to deter naive scripted abuse at scale.
    captcha_difficulty: int = int(os.environ.get("CAPTCHA_DIFFICULTY", "5"))


settings = Settings()

if not settings.secret_key:
    # Falling back to a fresh random key on every restart used to mean
    # every session and password-reset link silently died on deploy/
    # restart if the operator forgot to set SECRET_KEY. Persisting the
    # generated key to disk (created once, reused after) keeps that
    # forgiving for a single-instance self-hosted deployment - still
    # weaker than a real SECRET_KEY set in .env (this file is as
    # sensitive as that env var and lives inside the data volume), which
    # is why this stays a fallback, not the primary path.
    _key_file = DATA_DIR / ".secret_key"
    if _key_file.exists():
        settings.secret_key = _key_file.read_text().strip()
    else:
        settings.secret_key = secrets.token_hex(32)
        _key_file.write_text(settings.secret_key)
        try:
            _key_file.chmod(0o600)
        except OSError:
            pass
    logger.warning(
        "SECRET_KEY non definie dans l'environnement : une cle a ete "
        "generee et sauvegardee dans %s pour survivre aux redemarrages. "
        "Definissez SECRET_KEY dans .env pour la production (plus robuste "
        "qu'un fichier sur le volume de donnees).",
        _key_file,
    )


# Product-facing plan quotas (see the business plan): not yet tied to real
# billing, but the limits themselves are enforced today. `None` means
# unlimited (still capped by the absolute abuse ceilings above).
PLAN_QUOTAS: dict[str, dict[str, int | None]] = {
    "decouverte": {"spaces": 1, "members_per_space": 1},
    "particulier": {"spaces": 3, "members_per_space": 1},
    "pro": {"spaces": 10, "members_per_space": 10},
    "entreprise": {"spaces": None, "members_per_space": None},
}
DEFAULT_PLAN = "decouverte"


def plan_quota(plan: str, key: str) -> int | None:
    return PLAN_QUOTAS.get(plan, PLAN_QUOTAS[DEFAULT_PLAN]).get(key)
