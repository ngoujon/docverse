from .conftest import auth_headers, register_user


def test_register_first_user_becomes_admin(client):
    data = register_user(client, "first@example.com")
    assert data["user"]["role"] == "admin"
    assert data["access_token"]


def test_register_second_user_is_plain_user(client):
    register_user(client, "first@example.com")
    data = register_user(client, "second@example.com")
    assert data["user"]["role"] == "user"


def test_register_rejects_duplicate_email(client):
    register_user(client, "dupe@example.com")
    challenge = client.get("/api/captcha/challenge").json()
    res = client.post(
        "/api/auth/register",
        json={
            "email": "dupe@example.com",
            "password": "Correct-horse-battery1",
            "display_name": "",
            "captcha_salt": challenge["salt"],
            "captcha_nonce": 0,
            "terms_accepted": True,
        },
    )
    assert res.status_code == 409


def test_register_requires_accepting_terms(client):
    """The CGV waive the 14-day right of withdrawal, so an account must
    never exist without a recorded acceptance of the terms - the checkbox
    is enforced server-side, not just in the signup form."""
    challenge = client.get("/api/captcha/challenge").json()
    res = client.post(
        "/api/auth/register",
        json={
            "email": "noterms@example.com",
            "password": "Correct-horse-battery1",
            "display_name": "",
            "captcha_salt": challenge["salt"],
            "captcha_nonce": 0,
            "terms_accepted": False,
        },
    )
    assert res.status_code == 400


def test_register_records_terms_acceptance_date(client):
    from app.database import SessionLocal
    from app import models_db

    data = register_user(client, "terms@example.com")
    db = SessionLocal()
    try:
        user = db.get(models_db.User, data["user"]["id"])
        assert user.terms_accepted_at is not None
    finally:
        db.close()


def test_login_success_and_wrong_password(client):
    register_user(client, "user@example.com", password="Right-password1")
    ok = client.post("/api/auth/login", json={"email": "user@example.com", "password": "Right-password1"})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    bad = client.post("/api/auth/login", json={"email": "user@example.com", "password": "wrong-password"})
    assert bad.status_code == 401


def test_me_requires_valid_token(client):
    register_user(client, "user@example.com")
    res = client.get("/api/auth/me")
    assert res.status_code == 401

    res = client.get("/api/auth/me", headers=auth_headers("not-a-real-token"))
    assert res.status_code == 401


def test_me_returns_current_user(client):
    data = register_user(client, "user@example.com", display_name="Ada")
    res = client.get("/api/auth/me", headers=auth_headers(data["access_token"]))
    assert res.status_code == 200
    assert res.json()["email"] == "user@example.com"
    assert res.json()["display_name"] == "Ada"


def test_disabled_account_cannot_use_its_token(client):
    from app.database import SessionLocal
    from app import models_db

    data = register_user(client, "todisable@example.com")
    db = SessionLocal()
    try:
        user = db.get(models_db.User, data["user"]["id"])
        user.is_active = False
        db.commit()
    finally:
        db.close()

    res = client.get("/api/auth/me", headers=auth_headers(data["access_token"]))
    assert res.status_code == 401


def test_password_reset_token_is_single_use(client):
    """Regression test for a real bug found during manual QA this
    session: the reset token used to be replayable indefinitely within
    its TTL. It's now bound to a fingerprint of the password hash at
    issue time, so it self-invalidates the moment the password actually
    changes."""
    from app.services import auth as auth_service
    from app.database import SessionLocal
    from app import models_db

    data = register_user(client, "reset@example.com", password="Old-password-123")
    db = SessionLocal()
    try:
        user = db.get(models_db.User, data["user"]["id"])
        token = auth_service.issue_password_reset_token(user.id, user.password_hash)
    finally:
        db.close()

    first = client.post("/api/auth/reset-password", json={"token": token, "password": "New-password-456"})
    assert first.status_code == 200

    replay = client.post("/api/auth/reset-password", json={"token": token, "password": "Another-password-789"})
    assert replay.status_code == 400

    login_new = client.post(
        "/api/auth/login", json={"email": "reset@example.com", "password": "New-password-456"}
    )
    assert login_new.status_code == 200

    login_old = client.post(
        "/api/auth/login", json={"email": "reset@example.com", "password": "Old-password-123"}
    )
    assert login_old.status_code == 401


def test_reset_password_bumps_token_version_and_revokes_old_sessions(client):
    data = register_user(client, "revoke@example.com", password="Old-password-123")
    old_token = data["access_token"]

    from app.services import auth as auth_service
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        user = db.get(models_db.User, data["user"]["id"])
        reset_token = auth_service.issue_password_reset_token(user.id, user.password_hash)
    finally:
        db.close()

    res = client.post("/api/auth/reset-password", json={"token": reset_token, "password": "New-password-456"})
    assert res.status_code == 200

    # the session token issued before the reset must no longer work
    res = client.get("/api/auth/me", headers=auth_headers(old_token))
    assert res.status_code == 401


def test_2fa_setup_enable_and_login_flow(client):
    import pyotp

    data = register_user(client, "totp@example.com", password="Right-password1")
    token = data["access_token"]

    setup = client.post("/api/auth/2fa/setup", headers=auth_headers(token))
    assert setup.status_code == 200
    secret = setup.json()["secret"]

    code = pyotp.TOTP(secret).now()
    enable = client.post("/api/auth/2fa/enable", json={"code": code}, headers=auth_headers(token))
    assert enable.status_code == 200

    login = client.post("/api/auth/login", json={"email": "totp@example.com", "password": "Right-password1"})
    assert login.status_code == 200
    body = login.json()
    assert body["requires_2fa"] is True
    assert body["access_token"] is None
    pending_token = body["pending_token"]

    wrong = client.post("/api/auth/2fa/verify", json={"pending_token": pending_token, "code": "000000"})
    assert wrong.status_code in (400, 401)

    verify = client.post(
        "/api/auth/2fa/verify",
        json={"pending_token": pending_token, "code": pyotp.TOTP(secret).now()},
    )
    assert verify.status_code == 200
    assert verify.json()["access_token"]


def test_admin_without_2fa_can_use_admin_routes(client):
    # First registered user becomes admin - 2FA is optional, even for admins.
    data = register_user(client, "admin@example.com", password="Right-password1")
    allowed = client.get("/api/admin/users", headers=auth_headers(data["access_token"]))
    assert allowed.status_code == 200


def test_non_admin_is_denied_admin_routes(client):
    register_user(client, "admin@example.com")
    data = register_user(client, "user@example.com")
    blocked = client.get("/api/admin/users", headers=auth_headers(data["access_token"]))
    assert blocked.status_code == 403


def test_update_profile_changes_display_name(client):
    data = register_user(client, "profile@example.com", display_name="Avant")
    headers = auth_headers(data["access_token"])
    res = client.patch("/api/auth/me", json={"display_name": "  Apres  "}, headers=headers)
    assert res.status_code == 200
    assert res.json()["display_name"] == "Apres"
    assert client.get("/api/auth/me", headers=headers).json()["display_name"] == "Apres"


def test_change_password_requires_current_password(client):
    data = register_user(client, "chpw@example.com")
    res = client.post(
        "/api/auth/change-password",
        json={"current_password": "Wrong-password-1", "new_password": "New-horse-battery2"},
        headers=auth_headers(data["access_token"]),
    )
    assert res.status_code == 400


def test_change_password_rotates_sessions_and_new_password_works(client):
    data = register_user(client, "chpw2@example.com")
    old_token = data["access_token"]
    res = client.post(
        "/api/auth/change-password",
        json={"current_password": "Correct-horse-battery1", "new_password": "New-horse-battery2"},
        headers=auth_headers(old_token),
    )
    assert res.status_code == 200
    new_token = res.json()["access_token"]
    assert client.get("/api/auth/me", headers=auth_headers(old_token)).status_code == 401
    assert client.get("/api/auth/me", headers=auth_headers(new_token)).status_code == 200
    login = client.post("/api/auth/login", json={"email": "chpw2@example.com", "password": "New-horse-battery2"})
    assert login.status_code == 200


def test_resend_verification_is_rate_limited(client):
    data = register_user(client, "resend@example.com")
    headers = auth_headers(data["access_token"])
    for _ in range(3):
        assert client.post("/api/auth/resend-verification", headers=headers).status_code == 200
    assert client.post("/api/auth/resend-verification", headers=headers).status_code == 429


def test_invalid_email_error_is_plain_french(client):
    res = client.post("/api/auth/login", json={"email": "someone@example.test", "password": "x"})
    assert res.status_code == 422
    assert res.json()["detail"] == "Adresse email invalide"
