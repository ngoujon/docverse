"""Suivi de la consommation IA : tokens, pages OCR et coût estimé.

Chaque traitement qui appelle Mistral (une question, l'indexation d'un
document, un message au chatbot d'aide) ouvre un « compteur » pour la
durée du traitement. llm_provider y inscrit chaque appel avec les chiffres
renvoyés par l'API elle-même (champ `usage`), puis le traitement enregistre
le tout en base (table ai_usage) :
- l'utilisateur voit le détail de chaque réponse et son total ;
- l'admin voit ce que la plateforme paie réellement (hors clés perso).

Le compteur porte aussi la clé API à utiliser : celle de l'utilisateur
s'il en a enregistré une, sinon celle de la plateforme. Les deux passent
par des ContextVar pour ne pas faire traverser ces paramètres à toutes les
couches (rag, document_processor...) : chaque requête HTTP s'exécute dans
sa propre copie du contexte, donc rien ne fuit d'un utilisateur à l'autre."""

import contextvars
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..config import MODEL_PRICES_USD_PER_M, OCR_PRICE_USD_PER_PAGE

# Libellés affichés à l'utilisateur pour chaque type d'appel.
KIND_LABELS = {
    "chat": "Réponse",
    "rerank": "Tri des extraits",
    "classify": "Décision recherche web",
    "embed": "Recherche dans les documents",
    "vision": "Lecture d'image (vision)",
    "ocr": "Lecture de scan (OCR)",
    "support": "Chatbot d'aide",
}


def price_for(model: str) -> tuple[float, float]:
    m = (model or "").lower()
    for key, price in MODEL_PRICES_USD_PER_M.items():
        if key in m:
            return price
    return MODEL_PRICES_USD_PER_M["large"]


def cost_usd(model: str, prompt_tokens: int = 0, completion_tokens: int = 0,
             cached_tokens: int = 0, pages: int = 0) -> float:
    if pages:
        return pages * OCR_PRICE_USD_PER_PAGE
    p_in, p_out = price_for(model)
    fresh = max(prompt_tokens - cached_tokens, 0)
    return (fresh * p_in + cached_tokens * p_in * 0.1 + completion_tokens * p_out) / 1_000_000


@dataclass
class UsageMeter:
    own_key: bool = False
    api_key: Optional[str] = None
    entries: list[dict] = field(default_factory=list)

    def add(self, kind: str, model: str, prompt_tokens: int = 0, completion_tokens: int = 0,
            cached_tokens: int = 0, pages: int = 0, estimated: bool = False, fallback: bool = False) -> None:
        self.entries.append({
            "kind": kind,
            "model": model,
            "prompt_tokens": int(prompt_tokens or 0),
            "completion_tokens": int(completion_tokens or 0),
            "cached_tokens": int(cached_tokens or 0),
            "pages": int(pages or 0),
            "cost_usd": cost_usd(model, prompt_tokens or 0, completion_tokens or 0, cached_tokens or 0, pages or 0),
            "estimated": estimated,
            "fallback": fallback,
        })

    def summary(self) -> dict:
        details: dict[str, dict] = {}
        for e in self.entries:
            d = details.setdefault(e["kind"], {
                "kind": e["kind"], "label": KIND_LABELS.get(e["kind"], e["kind"]), "model": e["model"],
                "calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "pages": 0, "cost_usd": 0.0,
            })
            d["calls"] += 1
            d["prompt_tokens"] += e["prompt_tokens"]
            d["completion_tokens"] += e["completion_tokens"]
            d["pages"] += e["pages"]
            d["cost_usd"] += e["cost_usd"]
        for d in details.values():
            d["cost_usd"] = round(d["cost_usd"], 6)
        return {
            "calls": len(self.entries),
            "prompt_tokens": sum(e["prompt_tokens"] for e in self.entries),
            "completion_tokens": sum(e["completion_tokens"] for e in self.entries),
            "pages": sum(e["pages"] for e in self.entries),
            "cost_usd": round(sum(e["cost_usd"] for e in self.entries), 6),
            "own_key": self.own_key,
            "estimated": any(e["estimated"] for e in self.entries),
            "details": list(details.values()),
        }


_meter: contextvars.ContextVar[Optional[UsageMeter]] = contextvars.ContextVar("usage_meter", default=None)


def start(api_key: Optional[str] = None) -> UsageMeter:
    """Ouvre un compteur pour le traitement en cours (et la clé à utiliser)."""
    meter = UsageMeter(own_key=bool(api_key), api_key=api_key)
    _meter.set(meter)
    return meter


def current() -> Optional[UsageMeter]:
    return _meter.get()


def current_api_key() -> Optional[str]:
    meter = _meter.get()
    return meter.api_key if meter else None


def persist(db: Session, meter: UsageMeter, *, user_id: Optional[str], space_id: Optional[str] = None,
            conversation_id: Optional[str] = None, message_id: Optional[str] = None,
            document_id: Optional[str] = None) -> None:
    for e in meter.entries:
        db.add(models.AIUsage(
            user_id=user_id, space_id=space_id, conversation_id=conversation_id,
            message_id=message_id, document_id=document_id, own_key=meter.own_key,
            kind=e["kind"], model=e["model"], prompt_tokens=e["prompt_tokens"],
            completion_tokens=e["completion_tokens"], cached_tokens=e["cached_tokens"],
            pages=e["pages"], cost_usd=e["cost_usd"],
        ))


def summary_json(meter: UsageMeter) -> str:
    return json.dumps(meter.summary(), ensure_ascii=False)


# --- Agrégats ---------------------------------------------------------------


def _month_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def own_key_cost_this_month(db: Session, user_id: str) -> float:
    total = (
        db.query(func.coalesce(func.sum(models.AIUsage.cost_usd), 0.0))
        .filter(models.AIUsage.user_id == user_id, models.AIUsage.own_key.is_(True),
                models.AIUsage.created_at >= _month_start())
        .scalar()
    )
    return float(total or 0.0)


def own_key_budget_reached(db: Session, user: models.User) -> bool:
    """Le budget mensuel que l'utilisateur a fixé pour sa propre clé."""
    budget = user.own_key_monthly_budget_usd
    return bool(budget) and own_key_cost_this_month(db, user.id) >= budget


def _totals(query) -> dict:
    row = query.with_entities(
        func.count(models.AIUsage.id),
        func.coalesce(func.sum(models.AIUsage.prompt_tokens), 0),
        func.coalesce(func.sum(models.AIUsage.completion_tokens), 0),
        func.coalesce(func.sum(models.AIUsage.pages), 0),
        func.coalesce(func.sum(models.AIUsage.cost_usd), 0.0),
    ).one()
    return {
        "calls": int(row[0]), "prompt_tokens": int(row[1]), "completion_tokens": int(row[2]),
        "pages": int(row[3]), "cost_usd": round(float(row[4]), 6),
    }


def user_report(db: Session, user_id: str, days: int = 30) -> dict:
    """Consommation d'un utilisateur : aujourd'hui, ce mois-ci, par jour et
    par type d'appel, en séparant clé perso et clé plateforme."""
    now = datetime.utcnow()
    base = db.query(models.AIUsage).filter(models.AIUsage.user_id == user_id)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since = today_start - timedelta(days=days - 1)

    by_day: dict[str, dict] = {}
    for row in (
        base.filter(models.AIUsage.created_at >= since)
        .with_entities(
            func.date(models.AIUsage.created_at),
            func.sum(models.AIUsage.prompt_tokens + models.AIUsage.completion_tokens),
            func.sum(models.AIUsage.cost_usd),
        )
        .group_by(func.date(models.AIUsage.created_at))
    ):
        by_day[str(row[0])] = {"tokens": int(row[1] or 0), "cost_usd": round(float(row[2] or 0), 6)}
    series = []
    for i in range(days):
        day = (since + timedelta(days=i)).date().isoformat()
        series.append({"date": day, **by_day.get(day, {"tokens": 0, "cost_usd": 0.0})})

    by_kind = []
    for row in (
        base.filter(models.AIUsage.created_at >= _month_start(now))
        .with_entities(
            models.AIUsage.kind,
            func.count(models.AIUsage.id),
            func.sum(models.AIUsage.prompt_tokens),
            func.sum(models.AIUsage.completion_tokens),
            func.sum(models.AIUsage.pages),
            func.sum(models.AIUsage.cost_usd),
        )
        .group_by(models.AIUsage.kind)
    ):
        by_kind.append({
            "kind": row[0], "label": KIND_LABELS.get(row[0], row[0]), "calls": int(row[1]),
            "prompt_tokens": int(row[2] or 0), "completion_tokens": int(row[3] or 0),
            "pages": int(row[4] or 0), "cost_usd": round(float(row[5] or 0), 6),
        })

    month = base.filter(models.AIUsage.created_at >= _month_start(now))
    return {
        "today": _totals(base.filter(models.AIUsage.created_at >= today_start)),
        "month": _totals(month),
        "month_own_key": _totals(month.filter(models.AIUsage.own_key.is_(True))),
        "month_platform": _totals(month.filter(models.AIUsage.own_key.is_(False))),
        "by_kind": sorted(by_kind, key=lambda k: -k["cost_usd"]),
        "series": series,
    }


def platform_report(db: Session, days: int = 30) -> dict:
    """Ce que la plateforme paie (clé Mistral de la plateforme uniquement),
    plus le volume pris en charge par les clés personnelles."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since = today_start - timedelta(days=days - 1)
    platform = db.query(models.AIUsage).filter(models.AIUsage.own_key.is_(False))
    own = db.query(models.AIUsage).filter(models.AIUsage.own_key.is_(True))

    by_kind = []
    for row in (
        platform.filter(models.AIUsage.created_at >= since)
        .with_entities(models.AIUsage.kind, models.AIUsage.model, func.count(models.AIUsage.id),
                       func.sum(models.AIUsage.prompt_tokens + models.AIUsage.completion_tokens),
                       func.sum(models.AIUsage.pages), func.sum(models.AIUsage.cost_usd))
        .group_by(models.AIUsage.kind, models.AIUsage.model)
    ):
        by_kind.append({"kind": row[0], "label": KIND_LABELS.get(row[0], row[0]), "model": row[1],
                        "calls": int(row[2]), "tokens": int(row[3] or 0), "pages": int(row[4] or 0),
                        "cost_usd": round(float(row[5] or 0), 6)})

    top_users = []
    for row in (
        platform.filter(models.AIUsage.created_at >= since, models.AIUsage.user_id.isnot(None))
        .join(models.User, models.User.id == models.AIUsage.user_id)
        .with_entities(models.User.email, func.sum(models.AIUsage.cost_usd), func.count(models.AIUsage.id))
        .group_by(models.User.email)
        .order_by(func.sum(models.AIUsage.cost_usd).desc())
        .limit(5)
    ):
        top_users.append({"email": row[0], "cost_usd": round(float(row[1] or 0), 6), "calls": int(row[2])})

    by_day = {
        str(r[0]): round(float(r[1] or 0), 6)
        for r in platform.filter(models.AIUsage.created_at >= since)
        .with_entities(func.date(models.AIUsage.created_at), func.sum(models.AIUsage.cost_usd))
        .group_by(func.date(models.AIUsage.created_at))
    }
    questions_30d = (
        platform.filter(models.AIUsage.created_at >= since, models.AIUsage.kind == "chat")
        .with_entities(func.count(func.distinct(models.AIUsage.message_id))).scalar() or 0
    )
    cost_30d = _totals(platform.filter(models.AIUsage.created_at >= since))
    own_key_users = (
        db.query(func.count(models.User.id)).filter(models.User.mistral_api_key_enc.isnot(None)).scalar() or 0
    )
    return {
        "today": _totals(platform.filter(models.AIUsage.created_at >= today_start)),
        "last_30d": cost_30d,
        "month": _totals(platform.filter(models.AIUsage.created_at >= _month_start(now))),
        "own_key_last_30d": _totals(own.filter(models.AIUsage.created_at >= since)),
        "own_key_users": int(own_key_users),
        "cost_per_question_usd": round(cost_30d["cost_usd"] / questions_30d, 6) if questions_30d else 0.0,
        "by_kind": sorted(by_kind, key=lambda k: -k["cost_usd"]),
        "top_users": top_users,
        "series": [
            {"date": (since + timedelta(days=i)).date().isoformat(),
             "cost_usd": by_day.get((since + timedelta(days=i)).date().isoformat(), 0.0)}
            for i in range(days)
        ],
    }
