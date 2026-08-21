from .conftest import auth_headers, register_user


def _make_admin(user_id: str) -> None:
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        user = db.get(models_db.User, user_id)
        user.role = "admin"
        # require_admin also mandates 2FA for admin routes - simulate an
        # admin who has already completed setup, since that's not what
        # these tests are about.
        user.totp_enabled = True
        db.commit()
    finally:
        db.close()


def test_public_endpoint_only_returns_published(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])

    created = client.post(
        "/api/admin/testimonials",
        json={"author_name": "Alice", "content": "Tres pratique.", "published": True},
        headers=auth_headers(admin["access_token"]),
    )
    assert created.status_code == 200

    draft = client.post(
        "/api/admin/testimonials",
        json={"author_name": "Bob", "content": "Brouillon non publie.", "published": False},
        headers=auth_headers(admin["access_token"]),
    )
    assert draft.status_code == 200

    public = client.get("/api/testimonials")
    assert public.status_code == 200
    names = [t["author_name"] for t in public.json()]
    assert "Alice" in names
    assert "Bob" not in names


def test_admin_sees_all_testimonials_including_drafts(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    client.post(
        "/api/admin/testimonials",
        json={"author_name": "Bob", "content": "Brouillon.", "published": False},
        headers=auth_headers(admin["access_token"]),
    )

    res = client.get("/api/admin/testimonials", headers=auth_headers(admin["access_token"]))
    assert res.status_code == 200
    assert any(t["author_name"] == "Bob" and not t["published"] for t in res.json())


def test_non_admin_cannot_manage_testimonials(client):
    # The very first account ever registered becomes admin automatically -
    # register a throwaway first account so this one stays a regular user.
    register_user(client, "first@example.com")
    user = register_user(client, "user@example.com")
    res = client.post(
        "/api/admin/testimonials",
        json={"author_name": "Eve", "content": "Tentative non autorisee."},
        headers=auth_headers(user["access_token"]),
    )
    assert res.status_code == 403


def test_admin_can_update_and_publish_a_testimonial(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    created = client.post(
        "/api/admin/testimonials",
        json={"author_name": "Alice", "content": "Version initiale.", "published": False},
        headers=auth_headers(admin["access_token"]),
    ).json()

    updated = client.patch(
        f"/api/admin/testimonials/{created['id']}",
        json={"content": "Version corrigee.", "published": True},
        headers=auth_headers(admin["access_token"]),
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "Version corrigee."
    assert updated.json()["published"] is True

    public = client.get("/api/testimonials")
    assert any(t["id"] == created["id"] for t in public.json())


def test_admin_can_delete_a_testimonial(client):
    admin = register_user(client, "admin@example.com")
    _make_admin(admin["user"]["id"])
    created = client.post(
        "/api/admin/testimonials",
        json={"author_name": "Alice", "content": "A supprimer."},
        headers=auth_headers(admin["access_token"]),
    ).json()

    deleted = client.delete(
        f"/api/admin/testimonials/{created['id']}", headers=auth_headers(admin["access_token"])
    )
    assert deleted.status_code == 200

    res = client.get("/api/admin/testimonials", headers=auth_headers(admin["access_token"]))
    assert all(t["id"] != created["id"] for t in res.json())
