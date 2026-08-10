"""Must run before any `app.*` module is imported: config.py reads
DATA_DIR (and therefore DB_PATH/UPLOAD_DIR/CHROMA_DIR/BACKUP_DIR) at
import time, so the env vars below have to be in place first. pytest
guarantees conftest.py is imported before the test modules in the same
directory, which is what makes this work without fixtures."""

import os
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="open_rag_test_")
os.environ["DATA_DIR"] = _TEST_DATA_DIR
# Force-override (not setdefault): docker-compose.yml always sets these on
# the backend container's environment - even "unset" host vars resolve to
# their compose-level defaults (e.g. CAPTCHA_DIFFICULTY=5), so setdefault
# would be a no-op here and the real proof-of-work difficulty would leak
# into the test run.
os.environ["SECRET_KEY"] = "test-only-secret-key"
os.environ["CAPTCHA_DIFFICULTY"] = "0"
os.environ["CORS_ORIGINS"] = "*"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine


@pytest.fixture(autouse=True)
def _clean_database():
    """Every test starts from an empty schema - cheap enough at this
    scale and avoids order-dependence between tests (e.g. "first user
    becomes admin")."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """The rate limiters are in-memory module-level singletons (by
    design, see services/rate_limiter.py) shared across the whole test
    session since app.main is only imported once - without this, tests
    that each register a few users trip the real 10/hour register
    limit after a handful of test functions."""
    from app.services import rate_limiter

    for name in dir(rate_limiter):
        obj = getattr(rate_limiter, name)
        if isinstance(obj, rate_limiter.RateLimiter):
            obj._hits.clear()
    yield


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def register_user(client: TestClient, email: str, password: str = "correct-horse-battery", display_name: str = "") -> dict:
    challenge = client.get("/api/captcha/challenge").json()
    res = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": display_name,
            "captcha_salt": challenge["salt"],
            "captcha_nonce": 0,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def set_plan(user_id: str, plan: str) -> None:
    """New accounts default to the 'decouverte' plan (1 member per space) -
    tests that need to add multiple members to one space must bump the
    owner's plan first, same as a real upgrade would."""
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        user = db.get(models_db.User, user_id)
        user.plan = plan
        db.commit()
    finally:
        db.close()
