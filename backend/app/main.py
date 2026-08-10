import logging
import shutil

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import UPLOAD_DIR, settings
from .database import Base, SessionLocal, engine, ensure_schema
from .routers import admin, auth, captcha, chat, conversations, contact, documents, newsletter, spaces
from .services import ollama_client, vectorstore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("open-rag.startup")

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


_delete_ownerless_spaces()

app = FastAPI(title="Open RAG", version="1.0.0")

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
app.include_router(admin.router)
app.include_router(captcha.router)
app.include_router(newsletter.router)
app.include_router(spaces.router)
app.include_router(conversations.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(contact.router)


@app.get("/api/health")
async def health():
    ollama_ok = True
    models: list[str] = []
    try:
        models = await ollama_client.list_models()
    except Exception:
        ollama_ok = False

    def has(model: str) -> bool:
        return any(m.split(":")[0] == model.split(":")[0] for m in models)

    return {
        "status": "ok",
        "ollama_reachable": ollama_ok,
        "models_available": models,
        "chat_model_ready": has(settings.chat_model),
        "vision_model_ready": has(settings.vision_model),
        "embed_model_ready": has(settings.embed_model),
    }
