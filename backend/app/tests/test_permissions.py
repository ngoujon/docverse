from .conftest import auth_headers, register_user


def create_space(client, token, name="Test space"):
    res = client.post("/api/spaces", json={"name": name, "description": "", "color": "#6366f1"}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    return res.json()


def create_share_link(client, token, space_id, role):
    res = client.post(
        f"/api/spaces/{space_id}/share-links",
        json={"role": role, "label": "", "expires_in_days": None},
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_space_creation_requires_auth(client):
    res = client.post("/api/spaces", json={"name": "Nope", "description": "", "color": "#000"})
    assert res.status_code == 401


def test_owner_can_create_conversation_and_message(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 200


def test_other_user_without_membership_cannot_see_space(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    stranger = register_user(client, "stranger@example.com")

    res = client.get(f"/api/spaces/{space['id']}", headers=auth_headers(stranger["access_token"]))
    assert res.status_code == 401


def test_viewer_share_link_is_read_only(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"], "viewer")

    # viewer can read
    res = client.get(f"/api/spaces/{space['id']}", headers={"X-Share-Token": link["id"]})
    assert res.status_code == 200
    assert res.json()["my_role"] == "viewer"

    # viewer cannot create a conversation
    res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers={"X-Share-Token": link["id"]},
    )
    assert res.status_code == 403


def test_editor_share_link_can_write(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"], "editor")

    res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers={"X-Share-Token": link["id"]},
    )
    assert res.status_code == 200


def test_revoked_share_link_is_rejected(client):
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"], "viewer")

    revoke = client.delete(
        f"/api/spaces/{space['id']}/share-links/{link['id']}", headers=auth_headers(owner["access_token"])
    )
    assert revoke.status_code == 200

    res = client.get(f"/api/spaces/{space['id']}", headers={"X-Share-Token": link["id"]})
    assert res.status_code == 401


def test_member_viewer_cannot_write_but_editor_can(client):
    owner = register_user(client, "owner@example.com")
    editor = register_user(client, "editor@example.com")
    viewer = register_user(client, "viewer@example.com")
    space = create_space(client, owner["access_token"])

    add_editor = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "editor@example.com", "role": "editor"},
        headers=auth_headers(owner["access_token"]),
    )
    assert add_editor.status_code == 200

    add_viewer = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=auth_headers(owner["access_token"]),
    )
    assert add_viewer.status_code == 200

    editor_res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(editor["access_token"]),
    )
    assert editor_res.status_code == 200

    viewer_res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(viewer["access_token"]),
    )
    assert viewer_res.status_code == 403


def test_non_owner_member_cannot_manage_members_or_links(client):
    owner = register_user(client, "owner@example.com")
    editor = register_user(client, "editor@example.com")
    space = create_space(client, owner["access_token"])
    client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "editor@example.com", "role": "editor"},
        headers=auth_headers(owner["access_token"]),
    )

    res = client.post(
        f"/api/spaces/{space['id']}/share-links",
        json={"role": "viewer", "label": "", "expires_in_days": None},
        headers=auth_headers(editor["access_token"]),
    )
    assert res.status_code == 403


def test_only_owner_can_delete_space(client):
    owner = register_user(client, "owner@example.com")
    editor = register_user(client, "editor@example.com")
    space = create_space(client, owner["access_token"])
    client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "editor@example.com", "role": "editor"},
        headers=auth_headers(owner["access_token"]),
    )

    forbidden = client.delete(f"/api/spaces/{space['id']}", headers=auth_headers(editor["access_token"]))
    assert forbidden.status_code == 403

    allowed = client.delete(f"/api/spaces/{space['id']}", headers=auth_headers(owner["access_token"]))
    assert allowed.status_code == 200


def test_admin_cannot_write_to_spaces_they_do_not_own(client):
    """Deliberate privacy default: an admin sees any space via the admin
    dashboard but does not get implicit edit rights over content they
    don't own or belong to."""
    owner = register_user(client, "owner@example.com")  # first user -> admin
    space = create_space(client, owner["access_token"])

    admin2_data = register_user(client, "admin2@example.com")
    from app.database import SessionLocal
    from app import models_db

    db = SessionLocal()
    try:
        u = db.get(models_db.User, admin2_data["user"]["id"])
        u.role = "admin"
        db.commit()
    finally:
        db.close()

    res = client.get(f"/api/spaces/{space['id']}", headers=auth_headers(admin2_data["access_token"]))
    assert res.status_code == 200
    assert res.json()["my_role"] == "viewer"

    write_res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(admin2_data["access_token"]),
    )
    assert write_res.status_code == 403
