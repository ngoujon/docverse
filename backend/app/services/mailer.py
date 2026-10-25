"""Outbound email: SMTP delivery plus the transactional HTML templates.

Templates are neo-retro HTML with inline styles only (email clients don't
load external CSS), matching the marketing site's always-light "retro"
palette (frontend/tailwind.config.js -> theme.extend.colors.retro). Each
template returns a (subject, html, text) tuple ready for send_email().
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from ..config import settings

logger = logging.getLogger("docverse.mail")

# --- Delivery -----------------------------------------------------------------


def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    """Sends via SMTP if configured; otherwise logs the email so the flow
    stays testable before real credentials are provided (see TODO.md)."""
    if not settings.smtp_host:
        logger.info(
            "[email non envoye - SMTP_HOST non configure] to=%s subject=%r\n%s",
            to,
            subject,
            text_body or html_body,
        )
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        # Port 465 is implicit TLS (the connection is SSL from the first
        # byte) - STARTTLS on that port hangs or errors because the server
        # already expects a TLS handshake, not a plaintext greeting. 587
        # (and anything else) is plaintext-then-upgrade, so STARTTLS applies
        # there, gated by SMTP_USE_TLS.
        smtp_cls = smtplib.SMTP_SSL if settings.smtp_port == 465 else smtplib.SMTP
        with smtp_cls(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_port != 465 and settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, [to], msg.as_string())
    except Exception:
        logger.exception("Echec de l'envoi de l'email a %s", to)


def send_later(background_tasks, to: str, message: tuple[str, str, str]) -> None:
    """Queues a (subject, html, text) template for delivery after the
    response is sent, so a slow SMTP server never delays the request."""
    subject, html, text = message
    background_tasks.add_task(send_email, to, subject, html, text)


# --- Templates ----------------------------------------------------------------

_BG = "#fbf9ff"
_BG2 = "#f3edff"
_PANEL = "#ffffff"
_BORDER = "#e5daf7"
_PINK = "#e01cc0"
_CYAN = "#0891a8"
_PURPLE = "#8b2fd6"
_INK = "#1a1225"
_MUTED = "#6b6178"


def _layout(preheader: str, body_html: str) -> str:
    contact_line = ""
    if settings.contact_email:
        email = escape(settings.contact_email)
        contact_line = (
            f'Une question ? Écrivez-nous à <a href="mailto:{email}" style="color:{_CYAN};">{email}</a>.'
        )
    legal_footer = ""
    if settings.legal_email_footer:
        legal_footer = (
            f'<p style="margin:0;font-size:11px;color:{_MUTED};'
            f'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">'
            f"{escape(settings.legal_email_footer)}</p>"
        )
    return f"""<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:{_PANEL};border:1px solid {_BORDER};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:0;height:6px;background:linear-gradient(90deg,{_PINK},{_PURPLE},{_CYAN});"></td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;">
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:.12em;color:{_PURPLE};text-transform:uppercase;">
              &#10022;&#10022; DOC::VERSE
            </span>
          </td>
        </tr>
        <tr><td style="padding:8px 32px 32px;">{body_html}</td></tr>
        <tr>
          <td style="padding:18px 32px;background:{_BG2};border-top:1px solid {_BORDER};">
            <p style="margin:0 0 6px;font-size:12px;color:{_MUTED};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
              Vous recevez cet email car une action lui correspond a été initiée sur votre compte Docverse.
              {contact_line}
            </p>
            {legal_footer}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _button(url: str, label: str) -> str:
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="border-radius:10px;background:{_PINK};">
        <a href="{url}" style="display:inline-block;padding:13px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:10px;">{label}</a>
      </td></tr>
    </table>"""


def password_reset_email(reset_url: str) -> tuple[str, str, str]:
    subject = "Réinitialisation de votre mot de passe - Docverse"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Mot de passe oublié ?</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien
        expire dans <strong>60 minutes</strong> et ne fonctionne qu'une fois.
      </p>
      {_button(reset_url, "Choisir un nouveau mot de passe")}
      <p style="margin:0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email -
        votre mot de passe actuel reste valide.
      </p>
    """
    text = f"Réinitialisation de votre mot de passe Docverse : {reset_url} (expire dans 60 minutes)"
    return subject, _layout("Réinitialisez votre mot de passe Docverse", body), text


def welcome_email(display_name: str, app_url: str) -> tuple[str, str, str]:
    subject = "Bienvenue sur Docverse"
    name = display_name or "vous"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Bienvenue, {escape(name)} !</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:{_INK};">
        Votre compte est créé. Vous pouvez maintenant créer des espaces de travail,
        y déposer des documents, et générer des liens de partage en lecture seule ou
        en lecture/écriture pour vos collaborateurs.
      </p>
      {_button(app_url, "Lancer l'application")}
    """
    text = f"Bienvenue sur Docverse, {name} ! Votre compte est créé. Lancer l'application : {app_url}"
    return subject, _layout("Votre compte Docverse est prêt", body), text


def space_member_added_email(inviter_name: str, space_name: str, app_url: str) -> tuple[str, str, str]:
    # Both names are user-chosen: collapse whitespace so a newline can never
    # reach the Subject header.
    inviter_name, space_name = " ".join(inviter_name.split()), " ".join(space_name.split())
    subject = f"{inviter_name} vous a ajouté à l'espace « {space_name} » - Docverse"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Nouvel espace partagé avec vous</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:{_INK};">
        <strong>{escape(inviter_name)}</strong> vous a ajouté comme membre de l'espace de travail
        <strong>{escape(space_name)}</strong>. Vous pouvez dès maintenant y poser vos questions
        sur les documents partagés.
      </p>
      {_button(app_url, "Ouvrir l'espace")}
    """
    text = f"{inviter_name} vous a ajouté à l'espace « {space_name} » sur Docverse. Ouvrir l'espace : {app_url}"
    return subject, _layout("Un espace de travail a été partagé avec vous", body), text


def verify_email_email(verify_url: str) -> tuple[str, str, str]:
    subject = "Confirmez votre adresse email - Docverse"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Confirmez votre email</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Cliquez sur le bouton ci-dessous pour confirmer que cette adresse vous
        appartient bien.
      </p>
      {_button(verify_url, "Confirmer mon email")}
      <p style="margin:0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Si vous n'êtes pas à l'origine de la création de ce compte, ignorez cet email.
      </p>
    """
    text = f"Confirmez votre email Docverse : {verify_url}"
    return subject, _layout("Confirmez votre email Docverse", body), text


def contact_notification_email(name: str, email: str, subject: str, phone: str, company: str, message: str) -> tuple[str, str, str]:
    mail_subject = f"Nouveau message de contact : {subject}" if subject else "Nouveau message de contact"
    rows = "".join(
        f'<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:{_INK};"><strong>{label} :</strong> {escape(value)}</p>'
        for label, value in (
            ("Nom", name),
            ("Email", email),
            ("Téléphone", phone),
            ("Société", company),
        )
        if value
    )
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Nouveau message de contact</h1>
      {rows}
      <p style="margin:16px 0 4px;font-size:13px;line-height:1.6;color:{_INK};white-space:pre-wrap;">{escape(message)}</p>
    """
    text = (
        f"Nouveau message de contact\nNom : {name}\nEmail : {email}\n"
        f"Téléphone : {phone}\nSociété : {company}\n\n{message}"
    )
    return mail_subject, _layout("Nouveau message reçu via le formulaire de contact", body), text


def newsletter_confirm_email(confirm_url: str, unsubscribe_url: str) -> tuple[str, str, str]:
    subject = "Confirmez votre inscription à la newsletter"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Plus qu'une étape</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Confirmez votre adresse pour recevoir les actualités d'Docverse. Si vous n'avez
        rien demandé, ignorez cet email.
      </p>
      {_button(confirm_url, "Confirmer mon inscription")}
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Vous pourrez vous désinscrire à tout moment :
        <a href="{unsubscribe_url}" style="color:{_MUTED};">se désinscrire</a>.
      </p>
    """
    text = (
        f"Confirmez votre inscription à la newsletter Docverse : {confirm_url}\n"
        f"Se désinscrire : {unsubscribe_url}"
    )
    return subject, _layout("Confirmez votre inscription à la newsletter", body), text


def newsletter_campaign_email(subject: str, message: str, unsubscribe_url: str) -> tuple[str, str, str]:
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:{_INK};">{escape(line)}</p>'
        for line in message.strip().splitlines()
        if line.strip()
    )
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">{escape(subject)}</h1>
      {paragraphs}
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Vous recevez cet email car vous êtes inscrit à la newsletter Docverse.
        <a href="{unsubscribe_url}" style="color:{_MUTED};">Se désinscrire</a>.
      </p>
    """
    text = f"{message.strip()}\n\nSe désinscrire : {unsubscribe_url}"
    return subject, _layout(subject, body), text
