import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models_db
from ..config import settings
from ..database import get_db
from ..services import auth, oauth_providers

logger = logging.getLogger("open-rag.oauth")
router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

_STATE_PURPOSE = "oauth_state"
_STATE_TTL_MINUTES = 10


def _safe_next_path(raw: str | None) -> str:
    """Only ever a relative in-app path - never reflect an attacker-
    supplied absolute URL into the post-login redirect (open redirect)."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/dashboard"
    return raw


@router.get("/providers")
def list_providers():
    """Lets the frontend show only the SSO buttons that are actually
    configured, instead of a button that 500s when clicked."""
    return {
        "google": oauth_providers.google.configured,
        "microsoft": oauth_providers.microsoft.configured,
        "apple": bool(settings.apple_oauth_client_id),
    }


@router.get("/{provider}/login")
def oauth_login(provider: str, next: str = Query(default="/dashboard")):
    p = oauth_providers.PROVIDERS.get(provider)
    if not p:
        raise HTTPException(404, "Fournisseur SSO inconnu")
    if not p.configured:
        raise HTTPException(503, f"Connexion {provider} non configuree sur cette instance")
    state = auth.issue_purpose_token(_safe_next_path(next), _STATE_PURPOSE, _STATE_TTL_MINUTES)
    return RedirectResponse(p.build_authorize_url(state))


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    p = oauth_providers.PROVIDERS.get(provider)
    if not p or not p.configured:
        raise HTTPException(404, "Fournisseur SSO inconnu")

    next_path = _safe_next_path(auth.verify_purpose_token(state, _STATE_PURPOSE) if state else None)
    frontend_error = f"{settings.frontend_base_url}/login?sso_error=1"

    if error or not code:
        logger.warning("Echec OAuth %s : %s", provider, error or "code manquant")
        return RedirectResponse(frontend_error)

    try:
        tokens = await p.exchange_code(code)
        userinfo = await p.fetch_userinfo(tokens["access_token"])
    except Exception:
        logger.exception("Echec de l'echange de code OAuth %s", provider)
        return RedirectResponse(frontend_error)

    email, name = oauth_providers.normalize_userinfo(provider, userinfo)
    if not email:
        logger.warning("Reponse OAuth %s sans email exploitable", provider)
        return RedirectResponse(frontend_error)

    user = db.query(models_db.User).filter_by(email=email).first()
    if not user:
        is_first_user = db.query(models_db.User).count() == 0
        user = models_db.User(
            email=email,
            # SSO accounts never use a password - a random unusable hash
            # keeps password_hash NOT NULL without inventing a real one the
            # user could be tricked into thinking is usable.
            password_hash=auth.hash_password(auth.issue_purpose_token(email, "unused", 1)),
            display_name=name.strip() if name else email.split("@")[0],
            role="admin" if is_first_user else "user",
            # The identity provider already verified this email address.
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        return RedirectResponse(f"{settings.frontend_base_url}/login?sso_error=disabled")

    token = auth.issue_user_token(user.id, user.role, user.token_version)
    return RedirectResponse(
        f"{settings.frontend_base_url}/oauth-callback?token={quote(token)}&next={quote(next_path)}"
    )
