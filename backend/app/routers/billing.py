import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models_db
from ..config import PLAN_PRICE_IDS, plan_for_price_id, settings
from ..database import get_db
from ..deps import get_current_user

logger = logging.getLogger("open-rag.billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])


def _require_configured():
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Paiement non configure sur cette instance")
    stripe.api_key = settings.stripe_secret_key


class CheckoutRequest(BaseModel):
    plan: str


@router.post("/checkout")
def create_checkout_session(
    body: CheckoutRequest,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_configured()
    price_id = PLAN_PRICE_IDS.get(body.plan)
    if not price_id:
        raise HTTPException(400, "Palier inconnu ou non disponible a l'achat en ligne")

    if not user.stripe_customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": user.id})
        user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.frontend_base_url}/account?billing=success",
        cancel_url=f"{settings.frontend_base_url}/tarifs?billing=cancelled",
        allow_promotion_codes=True,
    )
    return {"url": session.url}


@router.post("/portal")
def create_portal_session(
    user: models_db.User = Depends(get_current_user),
):
    _require_configured()
    if not user.stripe_customer_id:
        raise HTTPException(400, "Aucun abonnement Stripe associe a ce compte")
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_base_url}/account",
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    _require_configured()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        logger.warning("Evenement webhook Stripe invalide ou signature incorrecte")
        raise HTTPException(400, "Signature invalide")

    data = event["data"]["object"]
    event_type = event["type"]

    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        user = db.query(models_db.User).filter_by(stripe_customer_id=data["customer"]).first()
        if not user:
            logger.warning("Webhook Stripe : aucun utilisateur pour le client %s", data["customer"])
            return {"received": True}
        price_id = data["items"]["data"][0]["price"]["id"]
        plan = plan_for_price_id(price_id)
        if data["status"] in ("active", "trialing") and plan:
            user.plan = plan
            user.stripe_subscription_id = data["id"]
        elif data["status"] in ("canceled", "unpaid", "incomplete_expired"):
            user.plan = "decouverte"
            user.stripe_subscription_id = None
        db.commit()

    elif event_type == "customer.subscription.deleted":
        user = db.query(models_db.User).filter_by(stripe_customer_id=data["customer"]).first()
        if user:
            user.plan = "decouverte"
            user.stripe_subscription_id = None
            db.commit()

    return {"received": True}
