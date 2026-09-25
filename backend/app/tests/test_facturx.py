"""Compliance and behaviour tests for the Factur-X billing feature:
sequential invoice numbering, XSD-valid XML generation (both business and
individual buyers), SIRET/VAT validation, the pro/particulier billing
profile form, webhook-driven invoice creation (including idempotency on
redelivery), and ownership checks on invoice download."""

import json
import os
from datetime import datetime

import pytest

from .conftest import auth_headers, register_user

_SELLER_ENV = {
    "SELLER_LEGAL_NAME": "Docverse SAS",
    "SELLER_LEGAL_FORM": "SASU",
    "SELLER_SIREN": "552100554",
    "SELLER_SIRET": "55210055400028",
    "SELLER_ADDRESS_LINE1": "12 rue de la Paix",
    "SELLER_POSTAL_CODE": "75002",
    "SELLER_CITY": "Paris",
    "SELLER_COUNTRY_CODE": "FR",
}


@pytest.fixture
def seller_configured(monkeypatch):
    for key, value in _SELLER_ENV.items():
        monkeypatch.setenv(key, value)
    from app import config

    monkeypatch.setattr(config.settings, "seller_legal_name", "Docverse SAS")
    monkeypatch.setattr(config.settings, "seller_legal_form", "SASU")
    monkeypatch.setattr(config.settings, "seller_siren", "552100554")
    monkeypatch.setattr(config.settings, "seller_siret", "55210055400028")
    monkeypatch.setattr(config.settings, "seller_address_line1", "12 rue de la Paix")
    monkeypatch.setattr(config.settings, "seller_postal_code", "75002")
    monkeypatch.setattr(config.settings, "seller_city", "Paris")
    monkeypatch.setattr(config.settings, "seller_country_code", "FR")
    monkeypatch.setattr(config.settings, "seller_vat_exempt", True)
    monkeypatch.setattr(
        config.settings, "seller_vat_exemption_reason", "TVA non applicable, art. 293 B du CGI"
    )
    yield


def _get_user(user_id: str):
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        return db.get(models_db.User, user_id)
    finally:
        db.close()


# --- SIRET / VAT validators -------------------------------------------

def test_validate_siret_accepts_real_siret():
    from app.services.facturx_service import validate_siret

    assert validate_siret("73282932000074") is True  # a well-known valid test SIRET


def test_validate_siret_rejects_bad_checksum():
    from app.services.facturx_service import validate_siret

    assert validate_siret("12345678901234") is False


def test_validate_vat_number_accepts_valid_french_vat():
    from app.services.facturx_service import validate_vat_number

    assert validate_vat_number("FR40303265045") is True


def test_validate_vat_number_rejects_bad_vat():
    from app.services.facturx_service import validate_vat_number

    assert validate_vat_number("FR00000000000") is False


# --- Invoice numbering ---------------------------------------------------

def test_invoice_numbers_are_sequential_and_gapless(seller_configured, client):
    from app.database import SessionLocal
    from app.services import facturx_service

    data = register_user(client, "buyer1@example.com")
    user = _get_user(data["user"]["id"])

    db = SessionLocal()
    try:
        inv1 = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_1", amount_ttc_cents=1000,
            currency="eur", description="Abonnement Particulier",
        )
        inv2 = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_2", amount_ttc_cents=1000,
            currency="eur", description="Abonnement Particulier",
        )
        number1, number2 = inv1.number, inv2.number
    finally:
        db.close()

    year = datetime.utcnow().year
    assert number1 == f"{year}-000001"
    assert number2 == f"{year}-000002"


def test_invoice_creation_is_idempotent_on_stripe_invoice_id(seller_configured, client):
    """A redelivered Stripe webhook event must never create a duplicate
    invoice (Stripe delivers webhooks at-least-once)."""
    from app.database import SessionLocal
    from app import models_db
    from app.services import facturx_service

    data = register_user(client, "buyer2@example.com")
    user = _get_user(data["user"]["id"])

    db = SessionLocal()
    try:
        first = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_dup", amount_ttc_cents=2900,
            currency="eur", description="Abonnement Pro",
        )
        second = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_dup", amount_ttc_cents=2900,
            currency="eur", description="Abonnement Pro",
        )
        assert first.id == second.id
        count = db.query(models_db.Invoice).filter_by(stripe_invoice_id="in_dup").count()
        assert count == 1
    finally:
        db.close()


def test_create_invoice_raises_when_seller_not_configured(client):
    from app.database import SessionLocal
    from app.services import facturx_service

    data = register_user(client, "buyer3@example.com")
    user = _get_user(data["user"]["id"])

    db = SessionLocal()
    try:
        with pytest.raises(facturx_service.SellerNotConfiguredError):
            facturx_service.create_invoice(
                db, user, stripe_invoice_id="in_noseller", amount_ttc_cents=1000,
                currency="eur", description="Abonnement",
            )
    finally:
        db.close()


# --- Factur-X XML/PDF compliance -----------------------------------------

def test_generated_invoice_pdf_is_valid_facturx_business_buyer(seller_configured, client):
    """End-to-end: create an invoice for a business buyer with a full
    billing profile, generate the Factur-X PDF, then extract the embedded
    XML back out of the produced PDF and re-validate it against the
    official Factur-X XSD (round trip) - the strongest check available
    that the file is a genuinely conformant Factur-X document."""
    from app.database import SessionLocal
    from app.services import facturx_service
    from facturx import get_facturx_xml_from_pdf

    data = register_user(client, "pro-buyer@example.com")
    token = data["access_token"]
    res = client.put(
        "/api/billing/profile",
        json={
            "is_business": True,
            "company_name": "Cabinet Dupont SARL",
            "siret": "73282932000074",
            "vat_number": "FR40303265045",
            "address_line1": "5 avenue des Champs",
            "address_line2": "",
            "postal_code": "75008",
            "city": "Paris",
            "country_code": "FR",
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.text

    user = _get_user(data["user"]["id"])
    db = SessionLocal()
    try:
        invoice = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_pro", amount_ttc_cents=2900,
            currency="eur", description="Abonnement Docverse - Pro - mensuel",
        )
        pdf_bytes = facturx_service.get_or_generate_pdf(invoice)
    finally:
        db.close()

    assert pdf_bytes[:5] == b"%PDF-"
    _filename, xml_bytes = get_facturx_xml_from_pdf(pdf_bytes, check_xsd=True)
    assert b"73282932000074" in xml_bytes
    assert b"Cabinet Dupont" in xml_bytes


def test_generated_invoice_pdf_is_valid_facturx_individual_buyer(seller_configured, client):
    from app.database import SessionLocal
    from app.services import facturx_service
    from facturx import get_facturx_xml_from_pdf

    data = register_user(client, "particulier-buyer@example.com")
    user = _get_user(data["user"]["id"])

    db = SessionLocal()
    try:
        invoice = facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_part", amount_ttc_cents=999,
            currency="eur", description="Abonnement Docverse - Particulier",
        )
        pdf_bytes = facturx_service.get_or_generate_pdf(invoice)
    finally:
        db.close()

    assert pdf_bytes[:5] == b"%PDF-"
    get_facturx_xml_from_pdf(pdf_bytes, check_xsd=True)  # raises if invalid


# --- Billing profile validation (API) -------------------------------------

def test_business_profile_requires_siret(client):
    data = register_user(client, "nosiret@example.com")
    res = client.put(
        "/api/billing/profile",
        json={
            "is_business": True,
            "company_name": "Ma Societe",
            "siret": "",
            "address_line1": "1 rue Test",
            "postal_code": "75001",
            "city": "Paris",
        },
        headers=auth_headers(data["access_token"]),
    )
    assert res.status_code == 422


def test_business_profile_rejects_invalid_siret(client):
    data = register_user(client, "badsiret@example.com")
    res = client.put(
        "/api/billing/profile",
        json={
            "is_business": True,
            "company_name": "Ma Societe",
            "siret": "73282932000075",  # off-by-one on a real SIRET: fails the Luhn checksum
            "address_line1": "1 rue Test",
            "postal_code": "75001",
            "city": "Paris",
        },
        headers=auth_headers(data["access_token"]),
    )
    assert res.status_code == 422


def test_individual_profile_does_not_require_company_fields(client):
    data = register_user(client, "particulier@example.com")
    res = client.put(
        "/api/billing/profile",
        json={"is_business": False},
        headers=auth_headers(data["access_token"]),
    )
    assert res.status_code == 200
    assert res.json()["is_business"] is False


def test_business_profile_accepted_with_valid_siret(client):
    data = register_user(client, "goodsiret@example.com")
    res = client.put(
        "/api/billing/profile",
        json={
            "is_business": True,
            "company_name": "Cabinet Dupont SARL",
            "siret": "73282932000074",
            "vat_number": "FR40303265045",
            "address_line1": "5 avenue des Champs",
            "postal_code": "75008",
            "city": "Paris",
        },
        headers=auth_headers(data["access_token"]),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_business"] is True
    assert body["siret"] == "73282932000074"


# --- Invoice history & download (ownership) -------------------------------

def test_user_can_list_and_download_own_invoice(seller_configured, client):
    from app.database import SessionLocal
    from app.services import facturx_service

    data = register_user(client, "history@example.com")
    user = _get_user(data["user"]["id"])

    db = SessionLocal()
    try:
        facturx_service.create_invoice(
            db, user, stripe_invoice_id="in_hist", amount_ttc_cents=1000,
            currency="eur", description="Abonnement",
        )
    finally:
        db.close()

    res = client.get("/api/billing/invoices/mine", headers=auth_headers(data["access_token"]))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    invoice_id = body["items"][0]["id"]

    download = client.get(
        f"/api/billing/invoices/mine/{invoice_id}/download", headers=auth_headers(data["access_token"])
    )
    assert download.status_code == 200
    assert download.content[:5] == b"%PDF-"


def test_user_cannot_download_another_users_invoice(seller_configured, client):
    from app.database import SessionLocal
    from app.services import facturx_service

    owner_data = register_user(client, "owner@example.com")
    owner = _get_user(owner_data["user"]["id"])
    other_data = register_user(client, "other@example.com")

    db = SessionLocal()
    try:
        invoice = facturx_service.create_invoice(
            db, owner, stripe_invoice_id="in_priv", amount_ttc_cents=1000,
            currency="eur", description="Abonnement",
        )
        invoice_id = invoice.id
    finally:
        db.close()

    res = client.get(
        f"/api/billing/invoices/mine/{invoice_id}/download",
        headers=auth_headers(other_data["access_token"]),
    )
    assert res.status_code == 404


def test_invoices_endpoint_requires_auth(client):
    res = client.get("/api/billing/invoices/mine")
    assert res.status_code == 401


# --- /auth/me/stats now reports storage_limit_bytes ------------------------

def test_me_stats_reports_storage_limit(client):
    data = register_user(client, "quota@example.com")
    res = client.get("/api/auth/me/stats", headers=auth_headers(data["access_token"]))
    assert res.status_code == 200
    body = res.json()
    assert "storage_limit_bytes" in body
    assert body["storage_limit_bytes"] == 200 * 1024 * 1024  # decouverte plan quota
