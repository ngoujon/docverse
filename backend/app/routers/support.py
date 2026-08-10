import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import schemas
from ..deps import client_ip
from ..services import ollama_client, rate_limiter

logger = logging.getLogger("open-rag.support")
router = APIRouter(prefix="/api/support", tags=["support"])

_HISTORY_LIMIT = 12

_SYSTEM_PROMPT = """Tu es l'assistant d'accueil du site Open RAG, un logiciel \
open source et auto-heberge de chat avec des documents (RAG) propulse par Ollama.

Ton unique role est d'aider les visiteurs du site a comprendre et a utiliser \
Open RAG : creation de compte, espaces de travail, roles (proprietaire/editeur/\
lecteur), liens de partage, import de documents (PDF, images, pages web, DOCX, \
TXT, Markdown), recherche web integree, sauvegardes automatiques par espace, \
verification en deux etapes (2FA), auto-hebergement via Docker, tarification \
et confidentialite des donnees.

Regles strictes :
- Reponds toujours dans la langue utilisee par le visiteur dans son dernier message.
- Reste bref et concret (quelques phrases maximum), style aide en ligne.
- Si une question sort de ce perimetre (culture generale, code non lie au \
projet, actualite, conseils personnels, tout sujet sans rapport avec Open RAG), \
refuse poliment et redirige vers le formulaire de contact du site, sans essayer \
d'y repondre meme partiellement.
- Ne pretends jamais avoir acces aux donnees personnelles d'un visiteur, a son \
compte, a ses espaces ou a ses documents : tu n'as aucun acces au systeme, tu \
connais seulement le fonctionnement general du produit.
- N'invente jamais de fonctionnalite qui n'existe pas dans la liste ci-dessus. \
En particulier, les liens de partage n'ont jamais de mot de passe : c'est le \
role choisi (lecteur/editeur) qui determine l'acces, pas un secret partage.
"""


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def support_chat(payload: schemas.SupportChatRequest, request: Request):
    if not rate_limiter.support_chat_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Trop de messages envoyes, patientez un instant")

    message = payload.message.strip()
    if not message:
        raise HTTPException(400, "Message vide")

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for m in payload.history[-_HISTORY_LIMIT:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": message})

    async def event_stream():
        full_text = ""
        try:
            async for token in ollama_client.chat_stream(messages, temperature=0.3):
                full_text += token
                yield _sse({"type": "token", "content": token})
        except Exception:
            logger.exception("Erreur pendant la generation de la reponse du chatbot d'aide")
            error_text = "Desole, une erreur est survenue. Reessayez dans un instant."
            yield _sse({"type": "token", "content": error_text})
        yield _sse({"type": "done"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
