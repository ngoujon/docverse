import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import PLAN_PRICE_IDS, plan_for_price_id, settings
from ..database import get_db
from ..deps import get_current_user
from ..services import facturx_service

logger = logging.getLogger("docverse.billing")
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
        # Lets a business customer add their VAT/SIRET at checkout - Stripe
        # then prints it on the invoice, which is how we tell a "pro"
        # subscriber apart from an individual one (see admin invoices list).
        tax_id_collection={"enabled": True},
        billing_address_collection="required",
        # Required tick-box on the Stripe-hosted page: "I agree to the terms
        # of service". Without a recorded acceptance, the waiver of the
        # 14-day right of withdrawal written in the CGV (art. L221-28 13 of
        # the Code de la consommation) can't be held against the customer,
        # who could then demand a refund despite having used the service.
        # The CGV URL itself is configured in the Stripe Dashboard
        # (Settings > Checkout and Payment Links > Terms of service) - this
        # call fails if it isn't set there.
        consent_collection={"terms_of_service": "required"},
        # The app is available in 6 languages; let the Stripe-hosted page
        # follow the customer's browser instead of always showing English.
        locale="auto",
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

    elif event_type == "invoice.payment_succeeded":
        _handle_invoice_paid(db, data)

    return {"received": True}


def _handle_invoice_paid(db: Session, stripe_invoice: dict) -> None:
    """Issues our own Factur-X invoice for a paid Stripe subscription
    invoice. Never lets a generation failure fail the webhook response -
    Stripe retries a non-2xx delivery for up to 3 days and would otherwise
    keep hammering us for something only an operator can fix (e.g. the
    seller identity still isn't configured, see config.seller_configured).
    """
    user = db.query(models_db.User).filter_by(stripe_customer_id=stripe_invoice["customer"]).first()
    if not user:
        logger.warning(
            "Webhook Stripe invoice.payment_succeeded : aucun utilisateur pour le client %s",
            stripe_invoice["customer"],
        )
        return
    amount_paid = stripe_invoice.get("amount_paid") or 0
    if amount_paid <= 0:
        return

    lines = (stripe_invoice.get("lines") or {}).get("data") or []
    description = (lines[0].get("description") if lines else None) or "Abonnement Docverse"

    try:
        facturx_service.create_invoice(
            db,
            user,
            stripe_invoice_id=stripe_invoice["id"],
            amount_ttc_cents=amount_paid,
            currency=(stripe_invoice.get("currency") or "eur"),
            description=description,
        )
    except facturx_service.SellerNotConfiguredError:
        logger.error(
            "Facture locale non generee pour le paiement Stripe %s : "
            "identite legale du vendeur non configuree (SELLER_* dans l'environnement).",
            stripe_invoice["id"],
        )
    except Exception:
        logger.exception(
            "Echec de generation de la facture locale pour le paiement Stripe %s", stripe_invoice["id"]
        )


# --- Profil de facturation & factures locales (Factur-X) ------------------

def _profile_out(user: models_db.User) -> schemas.BillingProfileOut:
    return schemas.BillingProfileOut(
        is_business=user.billing_is_business,
        company_name=user.billing_company_name or "",
        siret=user.billing_siret or "",
        vat_number=user.billing_vat_number or "",
        address_line1=user.billing_address_line1 or "",
        address_line2=user.billing_address_line2 or "",
        postal_code=user.billing_postal_code or "",
        city=user.billing_city or "",
        country_code=user.billing_country_code or "FR",
    )


@router.get("/profile", response_model=schemas.BillingProfileOut)
def get_billing_profile(user: models_db.User = Depends(get_current_user)):
    return _profile_out(user)


@router.put("/profile", response_model=schemas.BillingProfileOut)
def update_billing_profile(
    body: schemas.BillingProfileUpdate,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.billing_is_business = body.is_business
    user.billing_company_name = body.company_name
    user.billing_siret = body.siret
    user.billing_vat_number = body.vat_number
    user.billing_address_line1 = body.address_line1
    user.billing_address_line2 = body.address_line2
    user.billing_postal_code = body.postal_code
    user.billing_city = body.city
    user.billing_country_code = body.country_code
    db.commit()
    return _profile_out(user)


@router.get("/invoices/mine", response_model=schemas.PaginatedLocalInvoices)
def list_my_invoices(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models_db.Invoice)
        .filter_by(user_id=user.id)
        .order_by(models_db.Invoice.issue_date.desc())
    )
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return schemas.PaginatedLocalInvoices(items=items, total=total)


@router.get("/invoices/mine/{invoice_id}/download")
def download_my_invoice(
    invoice_id: str,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invoice = db.get(models_db.Invoice, invoice_id)
    if not invoice or invoice.user_id != user.id:
        raise HTTPException(404, "Facture introuvable")
    try:
        pdf_bytes = facturx_service.get_or_generate_pdf(invoice)
    except facturx_service.SellerNotConfiguredError:
        raise HTTPException(503, "Facturation non configuree sur cette instance")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="facture-{invoice.number}.pdf"'},
    )
