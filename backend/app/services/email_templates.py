"""Neo-retro HTML email templates. Inline styles only (email clients don't
load external CSS) - matches the marketing site's always-light "retro"
palette (frontend/tailwind.config.js -> theme.extend.colors.retro)."""

from html import escape

from ..config import settings

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
              &#10022;&#10022; HYA::IDES
            </span>
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;color:{_MUTED};text-transform:uppercase;">
              &nbsp;by [credit]
            </span>
          </td>
        </tr>
        <tr><td style="padding:8px 32px 32px;">{body_html}</td></tr>
        <tr>
          <td style="padding:18px 32px;background:{_BG2};border-top:1px solid {_BORDER};">
            <p style="margin:0 0 6px;font-size:12px;color:{_MUTED};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
              Vous recevez cet email car une action lui correspond a ete initiee sur votre compte Hyaides.
              Une question ? Ecrivez-nous a
              <a href="mailto:{settings.contact_email or 'contact@example.com'}" style="color:{_CYAN};">{settings.contact_email or 'contact@example.com'}</a>.
            </p>
            <p style="margin:0;font-size:11px;color:{_MUTED};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
              Hyaides est un service edite par [credit] ([editeur], SIREN [immatriculation]) - [adresse], [CP] [ville], France.
            </p>
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
    subject = "Reinitialisation de votre mot de passe - Hyaides"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Mot de passe oublie ?</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien
        expire dans <strong>60 minutes</strong> et ne fonctionne qu'une fois.
      </p>
      {_button(reset_url, "Choisir un nouveau mot de passe")}
      <p style="margin:0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email -
        votre mot de passe actuel reste valide.
      </p>
    """
    text = f"Reinitialisation de votre mot de passe Hyaides : {reset_url} (expire dans 60 minutes)"
    return subject, _layout("Reinitialisez votre mot de passe Hyaides", body), text


def welcome_email(display_name: str, app_url: str) -> tuple[str, str, str]:
    subject = "Bienvenue sur Hyaides"
    name = display_name or "vous"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Bienvenue, {name} !</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:{_INK};">
        Votre compte est cree. Vous pouvez maintenant creer des espaces de travail,
        y deposer des documents, et generer des liens de partage en lecture seule ou
        en lecture/ecriture pour vos collaborateurs.
      </p>
      {_button(app_url, "Lancer l'application")}
    """
    text = f"Bienvenue sur Hyaides, {name} ! Votre compte est cree. Lancer l'application : {app_url}"
    return subject, _layout("Votre compte Hyaides est pret", body), text


def verify_email_email(verify_url: str) -> tuple[str, str, str]:
    subject = "Confirmez votre adresse email - Hyaides"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Confirmez votre email</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Cliquez sur le bouton ci-dessous pour confirmer que cette adresse vous
        appartient bien.
      </p>
      {_button(verify_url, "Confirmer mon email")}
      <p style="margin:0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Si vous n'etes pas a l'origine de la creation de ce compte, ignorez cet email.
      </p>
    """
    text = f"Confirmez votre email Hyaides : {verify_url}"
    return subject, _layout("Confirmez votre email Hyaides", body), text


def contact_notification_email(name: str, email: str, subject: str, phone: str, company: str, message: str) -> tuple[str, str, str]:
    mail_subject = f"Nouveau message de contact : {subject}" if subject else "Nouveau message de contact"
    rows = "".join(
        f'<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:{_INK};"><strong>{label} :</strong> {escape(value)}</p>'
        for label, value in (
            ("Nom", name),
            ("Email", email),
            ("Telephone", phone),
            ("Societe", company),
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
        f"Telephone : {phone}\nSociete : {company}\n\n{message}"
    )
    return mail_subject, _layout("Nouveau message recu via le formulaire de contact", body), text


def newsletter_confirm_email(confirm_url: str, unsubscribe_url: str) -> tuple[str, str, str]:
    subject = "Confirmez votre inscription a la newsletter"
    body = f"""
      <h1 style="margin:0 0 12px;font-size:22px;color:{_INK};">Plus qu'une etape</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:{_INK};">
        Confirmez votre adresse pour recevoir les actualites d'Hyaides. Si vous n'avez
        rien demande, ignorez cet email.
      </p>
      {_button(confirm_url, "Confirmer mon inscription")}
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:{_MUTED};">
        Vous pourrez vous desinscrire a tout moment :
        <a href="{unsubscribe_url}" style="color:{_MUTED};">se desinscrire</a>.
      </p>
    """
    text = (
        f"Confirmez votre inscription a la newsletter Hyaides : {confirm_url}\n"
        f"Se desinscrire : {unsubscribe_url}"
    )
    return subject, _layout("Confirmez votre inscription a la newsletter", body), text
