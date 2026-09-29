from app.config import settings
from app.services import email_templates


def test_legal_footer_is_printed_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "legal_email_footer", "Service edite par Exemple SAS - 1 rue Test")
    _, html, _ = email_templates.password_reset_email("https://example.test/reset")
    assert "Service edite par Exemple SAS - 1 rue Test" in html


def test_legal_footer_is_omitted_when_empty(monkeypatch):
    monkeypatch.setattr(settings, "legal_email_footer", "")
    monkeypatch.setattr(settings, "contact_email", "")
    _, html, _ = email_templates.password_reset_email("https://example.test/reset")
    assert "Service edite par" not in html
    assert "mailto:" not in html


def test_legal_footer_is_html_escaped(monkeypatch):
    monkeypatch.setattr(settings, "legal_email_footer", "<script>x</script>")
    _, html, _ = email_templates.password_reset_email("https://example.test/reset")
    assert "<script>x</script>" not in html
    assert "&lt;script&gt;" in html
