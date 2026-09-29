import io

from .conftest import auth_headers, register_user, set_quota


def create_space(client, token, name="Test space"):
    res = client.post("/api/spaces", json={"name": name, "description": "", "color": "#6366f1"}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    return res.json()


def create_share_link(client, token, space_id, can_upload=False):
    res = client.post(
        f"/api/spaces/{space_id}/share-links",
        json={"can_upload": can_upload, "label": "", "expires_in_days": None},
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def upload_document(client, token, space_id, share_id=None):
    headers = share_headers(token, share_id) if share_id else auth_headers(token)
    return client.post(
        f"/api/spaces/{space_id}/documents/upload",
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
        headers=headers,
    )


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


def share_headers(token: str, share_id: str) -> dict:
    return {**auth_headers(token), "X-Share-Token": share_id}


def test_anonymous_share_link_access_is_rejected(client):
    """A share link alone is no longer enough - the visitor must also be
    signed in, so the space owner's quota (members per space) means
    something and every access is attributable to a real account."""
    owner = register_user(client, "owner@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"])

    res = client.get(f"/api/spaces/{space['id']}", headers={"X-Share-Token": link["id"]})
    assert res.status_code == 401


def test_share_link_member_can_always_chat_but_upload_is_opt_in(client):
    """A share link (like any space member) can always chat - uploading
    documents is a separate, opt-in permission carried by can_upload."""
    owner = register_user(client, "owner@example.com")
    visitor = register_user(client, "visitor@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"], can_upload=False)

    res = client.get(f"/api/spaces/{space['id']}", headers=share_headers(visitor["access_token"], link["id"]))
    assert res.status_code == 200
    assert res.json()["my_role"] == "member"
    assert res.json()["can_upload"] is False

    # can always chat, even without upload rights
    res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=share_headers(visitor["access_token"], link["id"]),
    )
    assert res.status_code == 200

    # cannot upload documents without the explicit permission
    res = upload_document(client, visitor["access_token"], space["id"], share_id=link["id"])
    assert res.status_code == 403


def test_share_link_with_upload_permission_can_upload(client):
    owner = register_user(client, "owner@example.com")
    visitor = register_user(client, "visitor@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"], can_upload=True)

    res = upload_document(client, visitor["access_token"], space["id"], share_id=link["id"])
    assert res.status_code == 200


def test_revoked_share_link_is_rejected(client):
    owner = register_user(client, "owner@example.com")
    visitor = register_user(client, "visitor@example.com")
    space = create_space(client, owner["access_token"])
    link = create_share_link(client, owner["access_token"], space["id"])

    # a signed-in visitor works before revocation
    res = client.get(f"/api/spaces/{space['id']}", headers=share_headers(visitor["access_token"], link["id"]))
    assert res.status_code == 200

    revoke = client.delete(
        f"/api/spaces/{space['id']}/share-links/{link['id']}", headers=auth_headers(owner["access_token"])
    )
    assert revoke.status_code == 200

    res = client.get(f"/api/spaces/{space['id']}", headers=share_headers(visitor["access_token"], link["id"]))
    assert res.status_code == 401


def test_member_can_always_chat_but_upload_is_opt_in(client):
    owner = register_user(client, "owner@example.com")
    uploader = register_user(client, "uploader@example.com")
    chatter = register_user(client, "chatter@example.com")
    space = create_space(client, owner["access_token"])

    add_uploader = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "uploader@example.com", "can_upload": True},
        headers=auth_headers(owner["access_token"]),
    )
    assert add_uploader.status_code == 200

    add_chatter = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "chatter@example.com", "can_upload": False},
        headers=auth_headers(owner["access_token"]),
    )
    assert add_chatter.status_code == 200

    # both members can chat, regardless of upload permission
    uploader_conv = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(uploader["access_token"]),
    )
    assert uploader_conv.status_code == 200

    chatter_conv = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(chatter["access_token"]),
    )
    assert chatter_conv.status_code == 200

    # only the member with can_upload can upload documents
    assert upload_document(client, uploader["access_token"], space["id"]).status_code == 200
    assert upload_document(client, chatter["access_token"], space["id"]).status_code == 403


def test_non_owner_member_cannot_manage_members_or_links(client):
    owner = register_user(client, "owner@example.com")
    member = register_user(client, "member@example.com")
    space = create_space(client, owner["access_token"])
    client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com", "can_upload": True},
        headers=auth_headers(owner["access_token"]),
    )

    res = client.post(
        f"/api/spaces/{space['id']}/share-links",
        json={"can_upload": False, "label": "", "expires_in_days": None},
        headers=auth_headers(member["access_token"]),
    )
    assert res.status_code == 403


def test_only_owner_can_delete_space(client):
    owner = register_user(client, "owner@example.com")
    member = register_user(client, "member@example.com")
    space = create_space(client, owner["access_token"])
    client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com", "can_upload": True},
        headers=auth_headers(owner["access_token"]),
    )

    forbidden = client.delete(f"/api/spaces/{space['id']}", headers=auth_headers(member["access_token"]))
    assert forbidden.status_code == 403

    allowed = client.delete(f"/api/spaces/{space['id']}", headers=auth_headers(owner["access_token"]))
    assert allowed.status_code == 200


def test_member_quota_is_enforced(client, monkeypatch):
    owner = register_user(client, "owner@example.com")
    register_user(client, "member@example.com")
    register_user(client, "other@example.com")
    set_quota(monkeypatch, "members_per_space", 2)  # the owner + one member
    space = create_space(client, owner["access_token"])

    allowed = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com", "can_upload": False},
        headers=auth_headers(owner["access_token"]),
    )
    assert allowed.status_code == 200

    rejected = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "other@example.com", "can_upload": False},
        headers=auth_headers(owner["access_token"]),
    )
    assert rejected.status_code == 400


def test_removed_member_faces_reinvite_cooldown(client):
    owner = register_user(client, "owner@example.com")
    member = register_user(client, "member@example.com")
    space = create_space(client, owner["access_token"])

    added = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com", "can_upload": False},
        headers=auth_headers(owner["access_token"]),
    )
    assert added.status_code == 200
    member_id = added.json()["id"]

    removed = client.delete(
        f"/api/spaces/{space['id']}/members/{member_id}",
        headers=auth_headers(owner["access_token"]),
    )
    assert removed.status_code == 200

    blocked = client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com", "can_upload": False},
        headers=auth_headers(owner["access_token"]),
    )
    assert blocked.status_code == 400
    assert "reinvit" in blocked.json()["detail"].lower()


def test_space_quota_is_enforced(client, monkeypatch):
    owner = register_user(client, "owner@example.com")
    set_quota(monkeypatch, "spaces", 1)
    create_space(client, owner["access_token"], name="First space")

    rejected = client.post(
        "/api/spaces",
        json={"name": "Second space", "description": "", "color": "#000"},
        headers=auth_headers(owner["access_token"]),
    )
    assert rejected.status_code == 400


def test_daily_message_quota_is_enforced(client, monkeypatch):
    owner = register_user(client, "owner@example.com")
    set_quota(monkeypatch, "messages_per_day", 0)
    space = create_space(client, owner["access_token"])
    conv = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(owner["access_token"]),
    ).json()

    res = client.post(
        f"/api/conversations/{conv['id']}/chat",
        json={"message": "Bonjour"},
        headers=auth_headers(owner["access_token"]),
    )
    assert res.status_code == 429
    assert "par jour" in res.json()["detail"]


def test_admin_cannot_write_to_spaces_they_do_not_own(client):
    """Deliberate privacy default: an admin sees any space via the admin
    dashboard but does not get implicit chat/edit rights over content they
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
    assert res.json()["my_role"] == "admin_view"

    write_res = client.post(
        f"/api/spaces/{space['id']}/conversations",
        json={"title": "Hello"},
        headers=auth_headers(admin2_data["access_token"]),
    )
    assert write_res.status_code == 403
