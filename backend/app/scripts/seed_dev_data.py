"""Dev-only seed data: one admin account and one account per pricing plan,
so the plan-based quotas (config.PLAN_QUOTAS) can be exercised locally
without going through real signups. Idempotent - safe to run more than
once, existing accounts are left untouched.

Usage (inside the backend container):
    docker compose exec backend python -m app.scripts.seed_dev_data
"""

import logging

from ..database import SessionLocal
from .. import models_db
from ..services import auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("open-rag.seed")

DEV_PASSWORD = "ChangeMe123!"

SEED_ACCOUNTS = [
    {"email": "admin@example.com", "display_name": "Admin", "role": "admin", "plan": "entreprise"},
    {"email": "decouverte@example.com", "display_name": "Compte Decouverte", "role": "user", "plan": "decouverte"},
    {"email": "particulier@example.com", "display_name": "Compte Particulier", "role": "user", "plan": "particulier"},
    {"email": "pro@example.com", "display_name": "Compte Pro", "role": "user", "plan": "pro"},
    {"email": "entreprise@example.com", "display_name": "Compte Entreprise", "role": "user", "plan": "entreprise"},
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
                plan=account["plan"],
            )
            db.add(user)
            db.commit()
            logger.info("Cree : %s (palier %s, mot de passe %s)", account["email"], account["plan"], DEV_PASSWORD)
    finally:
        db.close()

    logger.info("Termine. Mot de passe commun a tous les comptes de seed : %s", DEV_PASSWORD)


if __name__ == "__main__":
    seed()
