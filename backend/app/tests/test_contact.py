from fastapi.testclient import TestClient


def _valid_payload(**overrides) -> dict:
    payload = {
        "name": "Alice Dupont",
        "email": "alice@example.com",
        "subject": "Question sur l'offre",
        "phone": "",
        "company": "",
        "message": "Bonjour, j'aimerais en savoir plus sur vos offres.",
        "consent": True,
        "website": "",
        "captcha_salt": "",
        "captcha_nonce": 0,
    }
    payload.update(overrides)
    return payload


def _solved_captcha(client: TestClient) -> dict:
    challenge = client.get("/api/captcha/challenge").json()
    return {"captcha_salt": challenge["salt"], "captcha_nonce": 0}


def test_submit_contact_persists_message(client: TestClient):
    payload = _valid_payload(**_solved_captcha(client))

    res = client.post("/api/contact", json=payload)

    assert res.status_code == 201, res.text
    assert res.json() == {"ok": True}

    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        stored = db.query(models_db.ContactMessage).one()
        assert stored.name == payload["name"]
        assert stored.email == payload["email"]
        assert stored.subject == payload["subject"]
        assert stored.message == payload["message"]
        assert stored.consent_given is True
    finally:
        db.close()


def test_submit_contact_without_consent_is_rejected(client: TestClient):
    payload = _valid_payload(consent=False, **_solved_captcha(client))

    res = client.post("/api/contact", json=payload)

    assert res.status_code == 422


def test_submit_contact_with_invalid_captcha_is_rejected(client: TestClient):
    payload = _valid_payload(captcha_salt="not-a-real-salt", captcha_nonce=0)

    res = client.post("/api/contact", json=payload)

    assert res.status_code == 400

    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        assert db.query(models_db.ContactMessage).count() == 0
    finally:
        db.close()


def test_submit_contact_honeypot_pretends_success_but_does_not_persist(client: TestClient):
    payload = _valid_payload(website="http://spam.example", **_solved_captcha(client))

    res = client.post("/api/contact", json=payload)

    assert res.status_code == 201
    assert res.json() == {"ok": True}

    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        assert db.query(models_db.ContactMessage).count() == 0
    finally:
        db.close()


def test_submit_contact_rate_limited_after_five_attempts(client: TestClient):
    for _ in range(5):
        payload = _valid_payload(**_solved_captcha(client))
        res = client.post("/api/contact", json=payload)
        assert res.status_code == 201, res.text

    payload = _valid_payload(**_solved_captcha(client))
    res = client.post("/api/contact", json=payload)
    assert res.status_code == 429
