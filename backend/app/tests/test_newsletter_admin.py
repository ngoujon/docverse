from .conftest import auth_headers, register_user


def _make_admin(user_id: str) -> None:
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        user = db.get(models_db.User, user_id)
        user.role = "admin"
        user.totp_enabled = True
        db.commit()
    finally:
        db.close()


def _add_subscriber(email: str, confirmed: bool = True) -> str:
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        sub = models_db.NewsletterSubscriber(email=email, confirmed=confirmed)
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub.id
    finally:
        db.close()


def test_admin_can_list_subscribers(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    _add_subscriber("confirmed@example.com", confirmed=True)
    _add_subscriber("pending@example.com", confirmed=False)

    res = client.get("/api/admin/newsletter", headers=auth_headers(admin["access_token"]))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    emails = {item["email"] for item in body["items"]}
    assert emails == {"confirmed@example.com", "pending@example.com"}


def test_admin_can_filter_subscribers_by_confirmed(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    _add_subscriber("confirmed@example.com", confirmed=True)
    _add_subscriber("pending@example.com", confirmed=False)

    res = client.get(
        "/api/admin/newsletter?confirmed=true", headers=auth_headers(admin["access_token"])
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "confirmed@example.com"


def test_non_admin_cannot_list_subscribers(client):
    register_user(client, "first@example.com")
    user = register_user(client, "user@example.com")
    res = client.get("/api/admin/newsletter", headers=auth_headers(user["access_token"]))
    assert res.status_code == 403


def test_admin_can_delete_a_subscriber(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    sub_id = _add_subscriber("bye@example.com", confirmed=True)

    res = client.delete(f"/api/admin/newsletter/{sub_id}", headers=auth_headers(admin["access_token"]))
    assert res.status_code == 200

    listing = client.get("/api/admin/newsletter", headers=auth_headers(admin["access_token"]))
    assert all(item["id"] != sub_id for item in listing.json()["items"])


def test_admin_campaign_only_sends_to_confirmed_subscribers(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    _add_subscriber("confirmed-a@example.com", confirmed=True)
    _add_subscriber("confirmed-b@example.com", confirmed=True)
    _add_subscriber("pending@example.com", confirmed=False)

    res = client.post(
        "/api/admin/newsletter/send",
        json={"subject": "Nouveautes Docverse", "message": "Voici les dernieres nouveautes."},
        headers=auth_headers(admin["access_token"]),
    )
    assert res.status_code == 200
    assert res.json()["sent"] == 2


def test_non_admin_cannot_send_campaign(client):
    register_user(client, "first@example.com")
    user = register_user(client, "user@example.com")
    res = client.post(
        "/api/admin/newsletter/send",
        json={"subject": "Test", "message": "Test"},
        headers=auth_headers(user["access_token"]),
    )
    assert res.status_code == 403
