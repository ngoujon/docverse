import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine, ensure_schema
from .routers import spaces, conversations, documents, chat, contact
from .services import ollama_client

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(title="Open RAG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # No cookies are used for auth (workspace access uses a bearer-style
    # header token instead), so credentials don't need to be allowed - this
    # also lets CORS_ORIGINS=* work as a real wildcard.
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
