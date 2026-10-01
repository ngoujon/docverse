"""Makes one account the instance's only administrator.

- creates the account if it doesn't exist yet (email marked verified), or
  updates the password of the existing one;
- gives it the admin role and turns its 2FA off;
- demotes every other admin to a plain user.

The password is asked interactively (never passed on the command line, so it
doesn't end up in the shell history), or read from ADMIN_PASSWORD.

Usage (inside the backend container):
    docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.set_admin you@example.com
"""

import getpass
import os
import sys
from datetime import datetime

from pydantic import ValidationError

from .. import models_db, schemas
from ..database import SessionLocal
from ..services import auth


def _read_password() -> str:
    password = os.environ.get("ADMIN_PASSWORD")
    if password:
        return password
    password = getpass.getpass("Mot de passe : ")
    if password != getpass.getpass("Confirmez le mot de passe : "):
        sys.exit("Les deux mots de passe ne correspondent pas.")
    return password


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage : python -m app.scripts.set_admin <email>")
    email = sys.argv[1].lower().strip()
    password = _read_password()
    try:
        # Same rules as the signup form (length + complexity).
        schemas.ResetPasswordRequest(token="-", password=password)
    except ValidationError as err:
        sys.exit("Mot de passe refuse : " + "; ".join(e["msg"] for e in err.errors()))

    db = SessionLocal()
    try:
        user = db.query(models_db.User).filter_by(email=email).first()
        if user is None:
            user = models_db.User(email=email, display_name="", terms_accepted_at=datetime.utcnow())
            db.add(user)
            print(f"Compte cree : {email}")
        else:
            print(f"Compte existant mis a jour : {email}")
        user.password_hash = auth.hash_password(password)
        user.role = "admin"
        user.is_active = True
        user.email_verified = True
        user.totp_enabled = False
        user.totp_secret = None
        # Sessions opened with the previous password stop working.
        user.token_version = (user.token_version or 0) + 1

        demoted = (
            db.query(models_db.User)
            .filter(models_db.User.role == "admin", models_db.User.email != email)
            .all()
        )
        for other in demoted:
            other.role = "user"
            other.token_version += 1
            print(f"Admin retire : {other.email}")
        db.commit()
        print(f"{email} est desormais le seul administrateur (sans 2FA).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
