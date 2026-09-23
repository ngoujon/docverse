import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import settings

logger = logging.getLogger("docverse.mail")


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
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, [to], msg.as_string())
    except Exception:
        logger.exception("Echec de l'envoi de l'email a %s", to)
