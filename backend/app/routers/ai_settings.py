"""Réglages IA du compte : clé API Mistral personnelle, limites que
l'utilisateur se fixe avec cette clé, et suivi de sa consommation.

Avec sa propre clé, l'IA de ce compte (questions et indexation des
documents qu'il ajoute) est facturée sur SON compte Mistral : les quotas
IA de la plateforme sont levés, l'utilisateur fixe les siens."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import quota
from ..database import get_db
from ..deps import get_current_user
from ..services import accounts, llm_provider, rate_limiter, secrets_box, usage

router = APIRouter(prefix="/api/auth/me/ai", tags=["ai-settings"])


def _settings_out(user: models.User, db: Session) -> schemas.AISettingsOut:
    own_key = accounts.has_own_key(user)
    return schemas.AISettingsOut(
        has_own_key=own_key,
        # A key saved before a SECRET_KEY change can no longer be decrypted:
        # tell the user to enter it again instead of silently ignoring it.
        key_unreadable=bool(user.mistral_api_key_enc) and not own_key,
        key_hint=user.mistral_api_key_hint if own_key else None,
        daily_messages=user.own_key_daily_messages,
        monthly_budget_usd=user.own_key_monthly_budget_usd,
        month_cost_own_key_usd=round(usage.own_key_cost_this_month(db, user.id), 6),
        messages_today=accounts.messages_today(user),
        free_messages_per_day=quota("messages_per_day"),
        free_scanned_pages_per_day=quota("scanned_pages_per_day"),
    )


@router.get("", response_model=schemas.AISettingsOut)
def get_ai_settings(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _settings_out(user, db)


@router.put("/key", response_model=schemas.AISettingsOut)
async def save_api_key(
    payload: schemas.AIKeyRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Each attempt makes a call to Mistral: bound it so this endpoint can't
    # be used to test stolen keys in bulk.
    rate_limiter.enforce(rate_limiter.ai_key_limiter, user.id, "Trop de tentatives, réessayez plus tard")
    key = payload.api_key.strip()
    if not await llm_provider.validate_api_key(key):
        raise HTTPException(400, "Cette clé API a été refusée par Mistral. Vérifiez-la et réessayez.")
    user.mistral_api_key_enc = secrets_box.encrypt(key)
    user.mistral_api_key_hint = secrets_box.hint(key)
    db.commit()
    return _settings_out(user, db)


@router.delete("/key", response_model=schemas.AISettingsOut)
def delete_api_key(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.mistral_api_key_enc = None
    user.mistral_api_key_hint = None
    db.commit()
    return _settings_out(user, db)


@router.patch("/limits", response_model=schemas.AISettingsOut)
def update_limits(
    payload: schemas.AILimitsRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 0 / empty = no limit of their own.
    user.own_key_daily_messages = payload.daily_messages or None
    user.own_key_monthly_budget_usd = payload.monthly_budget_usd or None
    db.commit()
    return _settings_out(user, db)


@router.get("/usage")
def my_usage(days: int = 30, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return usage.user_report(db, user.id, days=max(1, min(days, 90)))
