"""Dev-only seed data: one admin account and one regular account, so the
account quotas (config.FREE_QUOTAS) can be exercised locally without going
through real signups. Idempotent - safe to run more than
once, existing accounts are left untouched.

Usage (inside the backend container):
    docker compose exec backend python -m app.scripts.seed_dev_data
"""

import logging

from ..database import SessionLocal
from .. import models_db
from ..services import auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docverse.seed")

DEV_PASSWORD = "ChangeMe123!"

SEED_ACCOUNTS = [
    {"email": "admin@example.com", "display_name": "Admin", "role": "admin"},
    {"email": "user@example.com", "display_name": "Compte utilisateur", "role": "user"},
]


def seed() -> None:
    db = SessionLocal()
    try:
        for account in SEED_ACCOUNTS:
            existing = db.query(models_db.User).filter_by(email=account["email"]).first()
            if existing:
                logger.info("Deja present, ignore : %s", account["email"])
                continue
            user = models_db.User(
                email=account["email"],
                password_hash=auth.hash_password(DEV_PASSWORD),
                display_name=account["display_name"],
                role=account["role"],
                is_active=True,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            logger.info("Cree : %s (mot de passe %s)", account["email"], DEV_PASSWORD)
    finally:
        db.close()

    logger.info("Termine. Mot de passe commun a tous les comptes de seed : %s", DEV_PASSWORD)


if __name__ == "__main__":
    seed()
