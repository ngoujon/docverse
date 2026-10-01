import logging
import shutil

from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models_db
from .config import UPLOAD_DIR, settings
from .database import Base, SessionLocal, engine, ensure_schema
from .deps import require_admin
from .routers import admin, auth, captcha, chat, conversations, contact, documents, newsletter, oauth, spaces, support, testimonials
from .services import llm_provider, vectorstore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docverse.startup")

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

app = FastAPI(title="Docverse", version="1.0.0")

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


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # email-validator's messages are English and very technical ("The part
    # after the @-sign is a special-use or reserved name...") and the
    # frontend shows `detail` as-is, so a malformed email gets one plain
    # French message instead. Every other validation error keeps FastAPI's
    # default shape (our own validators already raise French messages).
    for err in exc.errors():
        loc = err.get("loc") or ()
        if loc and "email" in str(loc[-1]) and err.get("type") == "value_error":
            return JSONResponse(status_code=422, content={"detail": "Adresse email invalide"})
    return await request_validation_exception_handler(request, exc)


app.include_router(auth.router)
app.include_router(oauth.router)
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
    # Plus aucun modele n'est heberge ici : la seule chose a verifier est
    # que l'API Mistral repond et que la cle est valide. Les modeles sont
    # geres par le fournisseur, il n'y a donc plus de notion de "modele
    # telecharge" a surveiller comme du temps d'Ollama local.
    status = await llm_provider.health()
    return {
        "status": "ok",
        "llm_provider": "mistral",
        "llm_reachable": status["reachable"],
        "llm_error": status.get("reason"),
        "models_available": status.get("models_available", []),
        "chat_model": settings.mistral_chat_model,
        "vision_model": settings.mistral_vision_model,
        "embed_model": settings.mistral_embed_model,
        "hosting": f"{settings.hosting_provider} ({settings.hosting_country})",
    }
