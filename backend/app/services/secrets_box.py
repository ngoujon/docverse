"""Chiffrement des secrets stockés en base (clés API Mistral des
utilisateurs). Fernet (AES-128-CBC + HMAC-SHA256), avec une clé dérivée de
SECRET_KEY : une copie volée du fichier SQLite seule ne révèle aucune clé.

Si SECRET_KEY change, les clés déjà enregistrées ne sont plus lisibles :
decrypt() renvoie alors None et l'utilisateur est simplement ramené au
mode gratuit, avec un message l'invitant à ressaisir sa clé."""

import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(b"docverse-secrets-box:" + settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def hint(value: str) -> str:
    """Les 4 derniers caractères, pour que l'utilisateur reconnaisse sa clé."""
    return f"••••{value[-4:]}" if len(value) >= 8 else "••••"
