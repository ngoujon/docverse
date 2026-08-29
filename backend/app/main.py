import logging
import shutil

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import models_db
from .config import UPLOAD_DIR, settings
from .database import Base, SessionLocal, engine, ensure_schema
from .deps import require_admin
from .routers import admin, auth, billing, captcha, chat, conversations, contact, documents, newsletter, oauth, spaces, support, testimonials
from .services import ollama_client, vectorstore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hyaides.startup")

Base.metadata.create_all(bind=engine)
ensure_schema()


def _delete_ownerless_spaces() -> None:
    """One-time cleanup for the pre-accounts era: spaces created before the
    owner_id column existed have no owner and can't be claimed by anyone,
    so (per explicit product decision) they're removed on first boot after
    this migration rather than lingering inaccessible forever."""
    from . import models_db

    db = SessionLocal()
    try:
        orphans = db.query(models_db.Space).filter(models_db.Space.owner_id.is_(None)).all()
        if not orphans:
            return
        for space in orphans:
            logger.warning(
                "Migration comptes : suppression de l'espace orphelin %r (%s), "
                "cree sans proprietaire avant l'introduction des comptes",
                space.name,
                space.id,
            )
            space_id = space.id
            db.delete(space)
            db.commit()
            vectorstore.delete_space(space_id)
            space_dir = UPLOAD_DIR / space_id
            if space_dir.exists():
                shutil.rmtree(space_dir, ignore_errors=True)
    finally:
        db.close()


def _seed_testimonials() -> None:
    """Inserts a handful of example testimonials on first boot, so the
    admin has something concrete to look at and edit rather than an empty
    table - always unpublished, since these are placeholder drafts, not
    real customer feedback, and must be reviewed before going live."""
    from . import models_db

    db = SessionLocal()
    try:
        if db.query(models_db.Testimonial).count() > 0:
            return
        seeds = [
            {
                "author_name": "Marie L.",
                "author_role": "Experte-comptable",
                "author_company": "Cabinet d'expertise comptable",
                "content": (
                    "Chaque client a son propre espace, ce qui correspond exactement a la "
                    "facon dont on organise deja nos dossiers. On pose autant de questions "
                    "qu'on veut sans se demander si ca va couter plus cher ce mois-ci."
                ),
                "rating": 5,
                "display_order": 1,
            },
            {
                "author_name": "Thomas B.",
                "author_role": "Avocat en droit des affaires",
                "author_company": "Cabinet d'avocats",
                "content": (
                    "Les reponses citent toujours le document source, ce qui est "
                    "indispensable pour notre metier. Pouvoir retirer l'acces d'un "
                    "collaborateur en un clic est aussi tres rassurant."
                ),
                "rating": 5,
                "display_order": 2,
            },
            {
                "author_name": "Camille R.",
                "author_role": "Directrice d'agence",
                "author_company": "Agence de communication",
                "content": (
                    "Le cout fixe change tout par rapport a payer un abonnement IA par "
                    "personne dans l'equipe. On sait exactement ce qu'on paie chaque mois."
                ),
                "rating": 4,
                "display_order": 3,
            },
        ]
        for seed in seeds:
            db.add(models_db.Testimonial(published=False, **seed))
        db.commit()
        logger.info("Avis d'exemple ajoutes (non publies) - a relire dans /admin.")
    finally:
        db.close()


def _pull_model(client: httpx.Client, model: str) -> None:
    logger.info("Telechargement du modele Ollama %s (peut prendre quelques minutes)...", model)
    r = client.post(f"{settings.ollama_base_url}/api/pull", json={"model": model, "stream": False})
    r.raise_for_status()
    logger.info("Modele Ollama %s pret.", model)


def _ensure_local_models() -> None:
    """Ollama does not auto-pull a model on first /api/chat or
    /api/embeddings call - a missing model just 404s the request. Embeddings
    always run against the LOCAL Ollama instance, even when Ollama Cloud is
    configured for chat/vision (the cloud API has no /api/embeddings route
    - see ollama_client.embed), so unlike chat/vision there's no cloud
    fallback: every document ingestion (any file type) fails outright at
    the indexing step if this one model is missing. Chat/vision only need
    a local pull when Ollama Cloud isn't configured at all. Nothing else in
    this app ever calls /api/pull, so it's done once here at startup rather
    than left to a "first use" that was never actually wired up."""
    wanted = [settings.embed_model]
    if not settings.use_ollama_cloud:
        wanted += [settings.chat_model, settings.vision_model]

    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{settings.ollama_base_url}/api/tags")
            r.raise_for_status()
            have = {m["name"].split(":")[0] for m in r.json().get("models", [])}

        missing = [m for m in wanted if m.split(":")[0] not in have]
        if not missing:
            return
        with httpx.Client(timeout=600.0) as client:
            for model in missing:
                _pull_model(client, model)
    except Exception:
        logger.exception(
            "Echec du telechargement automatique d'un ou plusieurs modeles Ollama "
            "(%s) - les fonctionnalites concernees echoueront tant qu'ils ne "
            "seront pas presents.",
            ", ".join(wanted),
        )


_delete_ownerless_spaces()
_seed_testimonials()
_ensure_local_models()

app = FastAPI(title="Hyaides", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # No cookies are used for auth (user sessions and space access both use
    # bearer-style header tokens instead), so credentials don't need to be
    # allowed - this also lets CORS_ORIGINS=* work as a real wildcard.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cache_and_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    # API responses are JSON, never a document: a restrictive CSP costs
    # nothing here and neutralises any content-sniffing or direct-navigation
    # trick that would otherwise get a reflected value treated as markup.
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    # Cache control: API responses must not be cached by default
    # (endpoints that need caching should override these headers)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(billing.router)
app.include_router(admin.router)
app.include_router(captcha.router)
app.include_router(newsletter.router)
app.include_router(spaces.router)
app.include_router(conversations.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(contact.router)
app.include_router(support.router)
app.include_router(testimonials.router)


@app.get("/api/health")
async def health():
    """Public liveness probe - deliberately says nothing but "the process
    is up".

    It used to return the inference provider, the exact model names and
    every model present on the box. None of that is a secret in the sense
    of a credential, but handed to an anonymous caller it's free
    reconnaissance: it names the stack to target, tells an attacker which
    model to tailor prompt-injection payloads to, and confirms when
    something changes. The detailed version now lives behind admin auth at
    /api/admin/health, which is where an operator looks anyway."""
    return {"status": "ok"}


@app.get("/api/admin/health")
async def admin_health(_admin: models_db.User = Depends(require_admin)):
    # This always probes the LOCAL Ollama instance, since embeddings run
    # there regardless of provider, and chat/vision do too when Ollama
    # Cloud isn't configured.
    ollama_ok = True
    models: list[str] = []
    try:
        models = await ollama_client.list_models()
    except Exception:
        ollama_ok = False

    def has(model: str) -> bool:
        return any(m.split(":")[0] == model.split(":")[0] for m in models)

    using_cloud = settings.use_ollama_cloud
    return {
        "status": "ok",
        "ollama_reachable": ollama_ok,
        "models_available": models,
        "chat_provider": "ollama_cloud" if using_cloud else "ollama_local",
        "vision_provider": "ollama_cloud" if using_cloud else "ollama_local",
        # Cloud-hosted models are assumed available (ollama.com manages
        # that); only local pulls need this readiness check.
        "chat_model_ready": True if using_cloud else has(settings.chat_model),
        "vision_model_ready": True if using_cloud else has(settings.vision_model),
        "embed_model_ready": has(settings.embed_model),
    }
