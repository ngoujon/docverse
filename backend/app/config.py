import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger("hyaides.config")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "app.db"
BACKUP_DIR = DATA_DIR / "backups"
WHISPER_MODEL_DIR = DATA_DIR / "whisper_models"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
WHISPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)


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
    # Vector search first pulls this many candidates, then the reranker
    # narrows them down to retrieval_top_k - a wider net catches chunks a
    # pure similarity score would rank too low, without changing the final
    # context size the chat model sees.
    rerank_candidate_pool: int = int(os.environ.get("RERANK_CANDIDATE_POOL", "20"))

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
    smtp_from: str = os.environ.get("SMTP_FROM", "Hyaides <no-reply@hyaides.local>")

    # --- SSO (Google / Apple) --------------------------------------------
    # Each provider is only offered on the login/register pages once its
    # client id is set - the frontend hides the button otherwise instead of
    # showing a broken flow. Microsoft was dropped: the account used to set
    # it up has no Azure AD tenant, and getting one requires either a paid
    # Microsoft 365 subscription or handing Microsoft a card for identity
    # verification on a free Azure signup - out of scope for now.
    google_oauth_client_id: str = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    google_oauth_client_secret: str = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")

    apple_oauth_client_id: str = os.environ.get("APPLE_OAUTH_CLIENT_ID", "")
    apple_oauth_team_id: str = os.environ.get("APPLE_OAUTH_TEAM_ID", "")
    apple_oauth_key_id: str = os.environ.get("APPLE_OAUTH_KEY_ID", "")
    apple_oauth_private_key: str = os.environ.get("APPLE_OAUTH_PRIVATE_KEY", "")

    github_oauth_client_id: str = os.environ.get("GITHUB_OAUTH_CLIENT_ID", "")
    github_oauth_client_secret: str = os.environ.get("GITHUB_OAUTH_CLIENT_SECRET", "")

    linkedin_oauth_client_id: str = os.environ.get("LINKEDIN_OAUTH_CLIENT_ID", "")
    linkedin_oauth_client_secret: str = os.environ.get("LINKEDIN_OAUTH_CLIENT_SECRET", "")

    # --- Billing (Stripe) --------------------------------------------------
    # Checkout/portal routes 503 instead of crashing when these are unset,
    # so the app still runs fine without billing configured (e.g. local dev).
    stripe_secret_key: str = os.environ.get("STRIPE_SECRET_KEY", "")
    stripe_publishable_key: str = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    stripe_webhook_secret: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    # Recurring Stripe Price ids - one per paid plan. Entreprise is sur
    # devis (sales-assisted), not self-serve, so it has none; Decouverte is
    # free and never touches Stripe.
    stripe_price_particulier: str = os.environ.get("STRIPE_PRICE_PARTICULIER", "")
    stripe_price_pro: str = os.environ.get("STRIPE_PRICE_PRO", "")

    # Where the backend's own OAuth callback routes live - used to build the
    # redirect_uri sent to each provider, which must exactly match what's
    # registered there.
    backend_base_url: str = os.environ.get("BACKEND_BASE_URL", "http://localhost:8000")

    # --- Abuse limits -----------------------------------------------------
    # A compromised or malicious account shouldn't be able to spam an
    # unbounded number of spaces or share links, regardless of plan - this
    # is a hard ceiling even for entreprise. PLAN_QUOTAS below is the real,
    # product-facing limit for everyone under that ceiling.
    max_spaces_per_user: int = int(os.environ.get("MAX_SPACES_PER_USER", "50"))
    max_share_links_per_space: int = int(os.environ.get("MAX_SHARE_LINKS_PER_SPACE", "20"))

    # A removed member can't be re-added to the same space for this long -
    # closes the loophole of cycling members in/out to give more than
    # members_per_space people access over time.
    member_reinvite_cooldown_hours: int = int(os.environ.get("MEMBER_REINVITE_COOLDOWN_HOURS", "4"))

    # --- Self-hosted proof-of-work captcha -------------------------------
    # Number of leading hex-zero characters required in the solved hash.
    # 5 is ~1M attempts on average - a few hundred ms in a browser tab,
    # expensive enough to deter naive scripted abuse at scale.
    captcha_difficulty: int = int(os.environ.get("CAPTCHA_DIFFICULTY", "5"))

    # --- Audio transcription (self-hosted, via faster-whisper) -----------
    # "small" balances accuracy and CPU speed for a self-hosted box with no
    # GPU; downloaded once into WHISPER_MODEL_DIR (a persisted volume) on
    # first use, not baked into the image, so switching sizes doesn't
    # require a rebuild.
    whisper_model_size: str = os.environ.get("WHISPER_MODEL_SIZE", "small")
    whisper_compute_type: str = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")


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
    "decouverte": {"spaces": 1, "members_per_space": 1, "storage_bytes": 200 * 1024 * 1024},
    "particulier": {"spaces": 3, "members_per_space": 1, "storage_bytes": 2 * 1024 * 1024 * 1024},
    "pro": {"spaces": 10, "members_per_space": 10, "storage_bytes": 10 * 1024 * 1024 * 1024},
    "entreprise": {"spaces": None, "members_per_space": None, "storage_bytes": None},
}
DEFAULT_PLAN = "decouverte"


def plan_quota(plan: str, key: str) -> int | None:
    return PLAN_QUOTAS.get(plan, PLAN_QUOTAS[DEFAULT_PLAN]).get(key)


# Self-serve paid plans only - Decouverte is free (no Stripe involved) and
# Entreprise is sales-assisted (sur devis, no Stripe Price of its own).
PLAN_PRICE_IDS: dict[str, str] = {
    "particulier": settings.stripe_price_particulier,
    "pro": settings.stripe_price_pro,
}


def plan_for_price_id(price_id: str) -> str | None:
    for plan, pid in PLAN_PRICE_IDS.items():
        if pid and pid == price_id:
            return plan
    return None
