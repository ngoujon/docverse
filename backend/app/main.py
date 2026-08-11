import logging
import shutil

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import UPLOAD_DIR, settings
from .database import Base, SessionLocal, engine, ensure_schema
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


_delete_ownerless_spaces()
_seed_testimonials()

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
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
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
