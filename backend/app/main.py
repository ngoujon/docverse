import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import spaces, conversations, documents, chat
from .services import ollama_client

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Open RAG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(spaces.router)
app.include_router(conversations.router)
app.include_router(documents.router)
app.include_router(chat.router)


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
