import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger("docverse.config")

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
    # --- Marque -----------------------------------------------------------
    # Le nom commercial et le domaine sont volontairement pilotes par
    # l'environnement : ils apparaissent dans les emails, les meta et les
    # mentions legales, et le produit doit pouvoir etre renomme sans
    # rechercher/remplacer dans tout le code.
    brand_name: str = os.environ.get("BRAND_NAME", "Docverse")
    brand_domain: str = os.environ.get("BRAND_DOMAIN", "localhost")
    # Legal identity line printed at the bottom of every email (publisher
    # name, registration number, address...). Kept out of the code on
    # purpose: set it per deployment, the footer line is omitted if empty.
    legal_email_footer: str = os.environ.get("LEGAL_EMAIL_FOOTER", "")
    # Pays d'hebergement affiche dans l'UI et les documents contractuels.
    hosting_country: str = os.environ.get("HOSTING_COUNTRY", "France")
    hosting_provider: str = os.environ.get("HOSTING_PROVIDER", "OVHcloud")

    # --- Nombre d'appels simultanes au fournisseur d'IA -------------------
    # L'inference est desormais hebergee (API Mistral) : cette limite ne
    # protege plus un petit Ollama local de la saturation, elle evite
    # seulement de declencher les 429 du fournisseur. D'ou une valeur bien
    # plus haute que le mono-worker d'avant.
    llm_max_concurrency: int = int(os.environ.get("LLM_MAX_CONCURRENCY", "8"))

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

    # --- Fournisseur d'IA : Mistral AI ------------------------------------
    # Unique fournisseur depuis le passage a l'offre souveraine : chat,
    # vision et embeddings sont tous servis par l'API Mistral, operee en
    # France. Voir services/llm_provider.py.
    mistral_api_key: str = os.environ.get("MISTRAL_API_KEY", "")
    mistral_base_url: str = os.environ.get("MISTRAL_BASE_URL", "https://api.mistral.ai")
    mistral_chat_model: str = os.environ.get("MISTRAL_CHAT_MODEL", "mistral-large-latest")
    mistral_vision_model: str = os.environ.get("MISTRAL_VISION_MODEL", "mistral-medium-latest")
    mistral_embed_model: str = os.environ.get("MISTRAL_EMBED_MODEL", "mistral-embed")

    # --- Outbound email ---------------------------------------------------
    # Left empty until real SMTP credentials are provided; mail_service
    # falls back to logging the email instead of sending it.
    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")
    smtp_use_tls: bool = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"
    smtp_from: str = os.environ.get("SMTP_FROM", "Docverse <no-reply@localhost>")

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

    # Where the backend's own OAuth callback routes live - used to build the
    # redirect_uri sent to each provider, which must exactly match what's
    # registered there.
    backend_base_url: str = os.environ.get("BACKEND_BASE_URL", "http://localhost:8000")

    # --- Abuse limits -----------------------------------------------------
    # A compromised or malicious account shouldn't be able to spam an
    # unbounded number of share links - this is a hard ceiling on top of
    # FREE_QUOTAS below, which is the real, product-facing limit.
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

# Anything shorter than this can't carry 128 bits of entropy even at one
# bit per character, and HS256 is only as strong as the key: a guessable
# SECRET_KEY means anyone can mint a session token with "role": "admin".
_MIN_SECRET_KEY_LENGTH = 32

# Values that show up in every wordlist and in half the tutorials this app
# could have been copied from. Checked case-insensitively.
_WEAK_SECRET_KEYS = {
    "secret",
    "secretkey",
    "secret_key",
    "changeme",
    "change_me",
    "password",
    "docverse",
    "dev",
    "development",
    "test",
    "production",
    "please-change-me",
    "your-secret-key",
    "supersecret",
    "s3cr3t",
}

if settings.secret_key and (
    len(settings.secret_key) < _MIN_SECRET_KEY_LENGTH
    or settings.secret_key.lower() in _WEAK_SECRET_KEYS
):
    # Refusing to boot is deliberately harsher than a warning: a weak
    # signing key is not a degraded mode, it's an unauthenticated admin
    # takeover waiting to be found, and a log line at startup is exactly
    # the thing nobody reads. Generate one with:
    #     python -c "import secrets; print(secrets.token_hex(32))"
    raise RuntimeError(
        "SECRET_KEY est trop faible ou trop courte "
        f"({_MIN_SECRET_KEY_LENGTH} caracteres aleatoires minimum). Elle signe "
        "les jetons de session : une cle devinable permet a n'importe qui de "
        "forger un jeton administrateur. Generez-en une avec : "
        'python -c "import secrets; print(secrets.token_hex(32))"'
    )

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


# Docverse is entirely free: every account gets the same limits, sized to
# keep one account from monopolizing the box or running up the LLM bill.
# Tunable per instance from the environment without a code change.
FREE_QUOTAS: dict[str, int] = {
    "spaces": int(os.environ.get("FREE_MAX_SPACES", "3")),
    "members_per_space": int(os.environ.get("FREE_MAX_MEMBERS_PER_SPACE", "5")),
    "storage_bytes": int(os.environ.get("FREE_STORAGE_MB_PER_SPACE", "500")) * 1024 * 1024,
    # Questions posed to the AI per account and per UTC day - the only
    # usage-based cost of the service, hence the tightest limit.
    "messages_per_day": int(os.environ.get("FREE_MESSAGES_PER_DAY", "50")),
}


def quota(key: str) -> int:
    return FREE_QUOTAS[key]
