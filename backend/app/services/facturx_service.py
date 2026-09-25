"""Generation of locally issued, Factur-X-compliant invoices.

One PDF is produced per paid Stripe subscription invoice: a normal-looking
visible page (built with fpdf2, same fonts as services/export.py) plus a
machine-readable CII XML (level "basicwl" - Factur-X "Basic WL", i.e. a
single global amount with no line-level breakdown, which is exactly our
case: one subscription period, one amount) embedded into a PDF/A-3
container by the `factur-x` library. See models_db.Invoice for why this is
generated locally instead of just linking Stripe's own hosted PDF.

Everything about the seller (us) comes from Settings - see the
"Facturation" section of config.py - and everything about the buyer comes
from a snapshot of the account's billing profile taken at issuance time
(see create_invoice), so a later profile edit never rewrites history.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

from facturx import generate_cii_xml, generate_from_binary
from fpdf import FPDF, XPos, YPos
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from stdnum.eu import vat as stdnum_vat
from stdnum.fr import siret as stdnum_siret

from .. import models_db
from ..config import INVOICE_DIR, settings, seller_configured

logger = logging.getLogger("docverse.facturx")

_FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_DEJAVU_REGULAR = str(_FONTS_DIR / "DejaVuSans.ttf")
_DEJAVU_BOLD = str(_FONTS_DIR / "DejaVuSans-Bold.ttf")

# Invoice type code 380 = "Commercial invoice" (UNTDID 1001), the standard
# code for a normal sales invoice as opposed to a credit note or similar.
_INVOICE_TYPE_CODE = "380"
_VAT_EXEMPT_CATEGORY = "E"  # UNTDID 5305: "Exempt from tax"

# Mandatory wording on B2B invoices in France (art. L441-10 & D441-5 du
# Code de commerce): the discount policy and the late-payment penalty must
# be stated even when payment is immediate, as here. Fixed statutory
# wording - not brand-specific, so not pulled from Settings.
_B2B_PAYMENT_MENTION = (
    "Pas d'escompte pour paiement anticipe. En cas de retard de paiement, "
    "une indemnite forfaitaire pour frais de recouvrement de 40 EUR est "
    "exigible de plein droit, en sus des penalites de retard au taux "
    "d'interet de la Banque centrale europeenne majore de 10 points."
)


class SellerNotConfiguredError(RuntimeError):
    pass


def validate_siret(value: str) -> bool:
    try:
        return bool(value) and stdnum_siret.is_valid(value)
    except Exception:
        return False


def validate_vat_number(value: str) -> bool:
    try:
        return bool(value) and stdnum_vat.is_valid(value)
    except Exception:
        return False


def _money(cents: int) -> str:
    return f"{cents / 100:.2f}"


def seller_snapshot_dict() -> dict:
    if not seller_configured():
        raise SellerNotConfiguredError(
            "Informations legales du vendeur non configurees (SELLER_LEGAL_NAME, "
            "SELLER_SIREN, SELLER_ADDRESS_LINE1, SELLER_POSTAL_CODE, SELLER_CITY) : "
            "impossible de generer une facture."
        )
    return {
        "legal_name": settings.seller_legal_name,
        "legal_form": settings.seller_legal_form,
        "siren": settings.seller_siren,
        "siret": settings.seller_siret,
        "vat_number": settings.seller_vat_number,
        "address_line1": settings.seller_address_line1,
        "postal_code": settings.seller_postal_code,
        "city": settings.seller_city,
        "country_code": settings.seller_country_code,
        "iban": settings.seller_iban,
        "vat_exempt": settings.seller_vat_exempt,
        "vat_exemption_reason": settings.seller_vat_exemption_reason,
    }


def buyer_snapshot_dict(user: models_db.User) -> dict:
    is_business = bool(user.billing_is_business)
    name = (user.billing_company_name if is_business else "") or user.display_name or user.email
    return {
        "is_business": is_business,
        "name": name,
        "siret": user.billing_siret if is_business else "",
        "vat_number": user.billing_vat_number if is_business else "",
        "address_line1": user.billing_address_line1,
        "address_line2": user.billing_address_line2,
        "postal_code": user.billing_postal_code,
        "city": user.billing_city,
        "country_code": user.billing_country_code or "FR",
        "email": user.email,
    }


def next_invoice_number(db: Session, issue_date: datetime) -> str:
    """Sequential, gap-free per calendar year (art. A123-157-2 du CGI
    requires a continuous chronological numbering chosen by the issuer -
    resetting the counter each year is a common, compliant convention)."""
    prefix = f"{issue_date.year}-"
    last = (
        db.query(models_db.Invoice)
        .filter(models_db.Invoice.number.like(f"{prefix}%"))
        .order_by(models_db.Invoice.number.desc())
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.number.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    return f"{prefix}{seq:06d}"


def _build_cii_data_dict(invoice: models_db.Invoice, seller: dict, buyer: dict) -> dict:
    if seller.get("vat_exempt") is False:
        # This app currently only ever bills under franchise en base de TVA
        # (see config.py) - collecting real VAT would need a rate and a
        # non-exempt tax category here, deliberately not implemented until
        # that actually happens rather than guessing a rate.
        raise NotImplementedError(
            "SELLER_VAT_EXEMPT=false n'est pas supporte : la generation de "
            "facture avec TVA collectee n'est pas implementee."
        )

    data_dict: dict = {
        "BT-1": invoice.number,
        "BT-2": invoice.issue_date.date(),
        "BT-3": _INVOICE_TYPE_CODE,
        "BT-5": invoice.currency.upper(),
        "BG-1": [{"BT-22": invoice.description}] if invoice.description else [],
        # Seller (BG-4)
        "BT-27": seller["legal_name"],
        "BT-35": seller.get("address_line1") or None,
        "BT-37": seller.get("city") or None,
        "BT-38": seller.get("postal_code") or None,
        "BT-40": seller["country_code"],
        "BT-31": seller.get("vat_number") or None,
        "BT-29": {"0002": seller["siren"]} if seller.get("siren") else None,
        # Buyer (BG-7)
        "BT-44": buyer["name"],
        "BT-55": buyer["country_code"],
        "BT-50": buyer.get("address_line1") or None,
        "BT-51": buyer.get("address_line2") or None,
        "BT-52": buyer.get("city") or None,
        "BT-53": buyer.get("postal_code") or None,
        "BT-48": buyer.get("vat_number") or None,
        "BT-46": {"0002": buyer["siret"]} if buyer.get("siret") else None,
        # Ship-to (BG-13): a digital service has no physical delivery, but
        # the factur-x library mis-renders ApplicableHeaderTradeDelivery as
        # an (invalid) xsi:nil element when every one of its children is
        # left out entirely - naming the buyer as recipient sidesteps that
        # and is accurate for a delivered-to-account digital service.
        "BT-70": buyer["name"],
        "BT-80": buyer["country_code"],
        # VAT breakdown (BG-23) - a single exempt category, no line items.
        "BG-23": [
            {
                "BT-116": _money(invoice.amount_ht_cents),
                "BT-117": _money(invoice.amount_vat_cents),
                "BT-118": _VAT_EXEMPT_CATEGORY,
                "BT-120": seller.get("vat_exemption_reason") or "TVA non applicable",
            }
        ],
        # Totals
        "BT-106": _money(invoice.amount_ht_cents),
        "BT-109": _money(invoice.amount_ht_cents),
        "BT-110": _money(invoice.amount_vat_cents),
        "BT-110-1": invoice.currency.upper(),
        "BT-112": _money(invoice.amount_ttc_cents),
        "BT-115": _money(invoice.amount_ttc_cents),
        "BT-20": f"Paye par carte bancaire le {invoice.issue_date.strftime('%d/%m/%Y')}",
    }
    return {k: v for k, v in data_dict.items() if v is not None}


def _line(pdf: FPDF, height: float, text: str) -> None:
    pdf.multi_cell(0, height, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _build_visible_pdf(invoice: models_db.Invoice, seller: dict, buyer: dict) -> bytes:
    pdf = FPDF()
    pdf.add_font("DejaVu", "", _DEJAVU_REGULAR)
    pdf.add_font("DejaVu", "B", _DEJAVU_BOLD)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.set_font("DejaVu", "B", 18)
    _line(pdf, 10, "FACTURE")
    pdf.set_font("DejaVu", "", 10)
    _line(pdf, 6, f"N° {invoice.number}  -  Date d'émission : {invoice.issue_date.strftime('%d/%m/%Y')}")
    pdf.ln(4)

    pdf.set_font("DejaVu", "B", 11)
    _line(pdf, 6, "Émetteur")
    pdf.set_font("DejaVu", "", 10)
    _line(pdf, 5.5, seller["legal_name"] + (f" ({seller['legal_form']})" if seller.get("legal_form") else ""))
    _line(pdf, 5.5, seller.get("address_line1") or "")
    _line(pdf, 5.5, f"{seller.get('postal_code', '')} {seller.get('city', '')}".strip())
    if seller.get("siren"):
        _line(pdf, 5.5, f"SIREN : {seller['siren']}")
    if seller.get("vat_number"):
        _line(pdf, 5.5, f"N° TVA intracommunautaire : {seller['vat_number']}")
    pdf.ln(3)

    pdf.set_font("DejaVu", "B", 11)
    _line(pdf, 6, "Client")
    pdf.set_font("DejaVu", "", 10)
    _line(pdf, 5.5, buyer["name"])
    if buyer.get("address_line1"):
        _line(pdf, 5.5, buyer["address_line1"])
    if buyer.get("postal_code") or buyer.get("city"):
        _line(pdf, 5.5, f"{buyer.get('postal_code', '')} {buyer.get('city', '')}".strip())
    if buyer.get("siret"):
        _line(pdf, 5.5, f"SIRET : {buyer['siret']}")
    if buyer.get("vat_number"):
        _line(pdf, 5.5, f"N° TVA intracommunautaire : {buyer['vat_number']}")
    pdf.ln(5)

    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(110, 8, "Désignation", border=1)
    pdf.cell(35, 8, "Montant HT", border=1, align="R")
    pdf.cell(45, 8, "Montant TTC", border=1, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(110, 8, invoice.description or "Abonnement", border=1)
    pdf.cell(35, 8, f"{_money(invoice.amount_ht_cents)} {invoice.currency.upper()}", border=1, align="R")
    pdf.cell(
        45, 8, f"{_money(invoice.amount_ttc_cents)} {invoice.currency.upper()}",
        border=1, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.ln(6)

    pdf.set_font("DejaVu", "B", 11)
    _line(pdf, 6, f"Total TTC : {_money(invoice.amount_ttc_cents)} {invoice.currency.upper()}")
    pdf.ln(4)

    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(90, 90, 90)
    if seller.get("vat_exempt"):
        _line(pdf, 5, seller.get("vat_exemption_reason") or "TVA non applicable")
    _line(pdf, 5, f"Paye par carte bancaire le {invoice.issue_date.strftime('%d/%m/%Y')}.")
    if buyer["is_business"]:
        pdf.ln(2)
        _line(pdf, 5, _B2B_PAYMENT_MENTION)
    pdf.set_text_color(0, 0, 0)

    return bytes(pdf.output())


def generate_facturx_pdf(invoice: models_db.Invoice) -> bytes:
    seller = json.loads(invoice.seller_snapshot_json)
    buyer = json.loads(invoice.buyer_snapshot_json)

    visible_pdf = _build_visible_pdf(invoice, seller, buyer)
    data_dict = _build_cii_data_dict(invoice, seller, buyer)
    xml_bytes = generate_cii_xml(data_dict, level="basicwl", check_xsd=True, check_schematron=False)

    return generate_from_binary(
        visible_pdf,
        xml_bytes,
        flavor="factur-x",
        level="basicwl",
        check_xsd=False,  # already validated above
        pdf_metadata={
            "author": seller["legal_name"],
            "keywords": "Factur-X, Facture",
            "title": f"Facture {invoice.number}",
            "subject": f"Facture Factur-X {invoice.number} emise par {seller['legal_name']}",
        },
        lang="fr-FR",
    )


def _invoice_pdf_path(invoice_id: str) -> Path:
    return INVOICE_DIR / f"{invoice_id}.pdf"


def get_or_generate_pdf(invoice: models_db.Invoice) -> bytes:
    path = _invoice_pdf_path(invoice.id)
    if path.exists():
        return path.read_bytes()
    pdf_bytes = generate_facturx_pdf(invoice)
    path.write_bytes(pdf_bytes)
    return pdf_bytes


def create_invoice(
    db: Session,
    user: models_db.User,
    *,
    stripe_invoice_id: str | None,
    amount_ttc_cents: int,
    currency: str,
    description: str,
    issue_date: datetime | None = None,
) -> models_db.Invoice:
    """Create (or, if already processed, return) the local Factur-X
    invoice for one paid Stripe subscription invoice. Idempotent on
    stripe_invoice_id so a redelivered webhook event never creates a
    duplicate - Stripe explicitly documents webhooks as at-least-once."""
    if stripe_invoice_id:
        existing = (
            db.query(models_db.Invoice)
            .filter_by(stripe_invoice_id=stripe_invoice_id)
            .first()
        )
        if existing:
            return existing

    issue_date = issue_date or datetime.utcnow()
    seller = seller_snapshot_dict()
    buyer = buyer_snapshot_dict(user)
    # Franchise en base de TVA (see config.seller_vat_exempt): no VAT is
    # ever collected today, so HT == TTC. Kept as two separate columns
    # (rather than a single amount) so a future switch to real VAT doesn't
    # need a schema change, just a non-zero amount_vat_cents.
    amount_vat_cents = 0
    amount_ht_cents = amount_ttc_cents - amount_vat_cents

    invoice = models_db.Invoice(
        user_id=user.id,
        stripe_invoice_id=stripe_invoice_id,
        issue_date=issue_date,
        currency=currency,
        amount_ht_cents=amount_ht_cents,
        amount_vat_cents=amount_vat_cents,
        amount_ttc_cents=amount_ttc_cents,
        description=description,
        is_business=buyer["is_business"],
        buyer_snapshot_json=json.dumps(buyer, ensure_ascii=False),
        seller_snapshot_json=json.dumps(seller, ensure_ascii=False),
    )

    # A handful of retries covers the unlikely case of two webhook
    # deliveries racing for the same next-in-sequence number; SQLite's
    # single-writer lock makes a livelock beyond this vanishingly unlikely.
    for attempt in range(5):
        invoice.number = next_invoice_number(db, issue_date)
        db.add(invoice)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            if attempt == 4:
                raise
    db.refresh(invoice)

    try:
        pdf_bytes = generate_facturx_pdf(invoice)
        _invoice_pdf_path(invoice.id).write_bytes(pdf_bytes)
        invoice.pdf_path = str(_invoice_pdf_path(invoice.id))
        db.commit()
    except Exception:
        # The invoice row (with its sequential number) is the legally
        # required artifact and must survive even if PDF rendering fails -
        # get_or_generate_pdf() retries generation lazily on next download.
        logger.exception("Echec de generation du PDF Factur-X pour la facture %s", invoice.number)

    return invoice
