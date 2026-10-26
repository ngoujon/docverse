"""Account self-service (stats, GDPR export, deletion) and admin dashboard
routes: pagination, space purge, snapshots and the vector-graph view."""

import io

from .conftest import auth_headers, register_user


def _space(client, token, name="Espace"):
    res = client.post("/api/spaces", json={"name": name}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    return res.json()


def _upload(client, token, space_id, content=b"hello world"):
    res = client.post(
        f"/api/spaces/{space_id}/documents/upload",
        files={"file": ("note.txt", io.BytesIO(content), "text/plain")},
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_me_stats_counts_owned_and_member_spaces(client):
    owner = register_user(client, "owner@example.com")
    member = register_user(client, "member@example.com")
    headers = auth_headers(owner["access_token"])
    space = _space(client, owner["access_token"])
    _upload(client, owner["access_token"], space["id"], b"12345")
    client.post(f"/api/spaces/{space['id']}/conversations", json={"title": "c"}, headers=headers)
    client.post(f"/api/spaces/{space['id']}/members", json={"email": "member@example.com"}, headers=headers)

    owner_stats = client.get("/api/auth/me/stats", headers=headers).json()
    assert owner_stats["owned_spaces"] == 1
    assert owner_stats["member_spaces"] == 0
    assert owner_stats["document_count"] == 1
    assert owner_stats["conversation_count"] == 1
    assert owner_stats["message_count"] == 0
    assert owner_stats["storage_bytes"] == 5
    assert owner_stats["messages_today"] == 0

    member_stats = client.get("/api/auth/me/stats", headers=auth_headers(member["access_token"])).json()
    assert member_stats["owned_spaces"] == 0
    assert member_stats["member_spaces"] == 1
    assert member_stats["document_count"] == 1
    assert member_stats["storage_bytes"] == 5


def test_me_stats_for_a_new_account_is_all_zero(client):
    user = register_user(client, "solo@example.com")
    stats = client.get("/api/auth/me/stats", headers=auth_headers(user["access_token"])).json()
    assert stats["owned_spaces"] == stats["document_count"] == stats["storage_bytes"] == 0


def test_space_stats_reports_storage_and_headcount(client):
    owner = register_user(client, "owner@example.com")
    space = _space(client, owner["access_token"])
    _upload(client, owner["access_token"], space["id"], b"abc")
    stats = client.get(f"/api/spaces/{space['id']}/stats", headers=auth_headers(owner["access_token"])).json()
    assert stats["storage_bytes"] == 3
    assert stats["member_count"] == 1  # the owner counts
    assert stats["document_count"] == 1


def test_gdpr_export_lists_owned_and_member_spaces(client):
    owner = register_user(client, "owner@example.com", display_name="Owner")
    member = register_user(client, "member@example.com")
    space = _space(client, owner["access_token"], name="Partage")
    client.post(
        f"/api/spaces/{space['id']}/members",
        json={"email": "member@example.com"},
        headers=auth_headers(owner["access_token"]),
    )

    owner_export = client.get("/api/auth/me/export", headers=auth_headers(owner["access_token"])).json()
    assert owner_export["account"]["email"] == "owner@example.com"
    assert [s["name"] for s in owner_export["owned_spaces"]] == ["Partage"]
    assert owner_export["owned_spaces"][0]["my_role"] == "owner"

    member_export = client.get("/api/auth/me/export", headers=auth_headers(member["access_token"])).json()
    assert member_export["owned_spaces"] == []
    assert member_export["member_spaces"][0]["my_role"] == "member"


def test_deleting_own_account_purges_owned_spaces(client):
    register_user(client, "admin@example.com")
    user = register_user(client, "user@example.com")
    headers = auth_headers(user["access_token"])
    space = _space(client, user["access_token"])

    res = client.request("DELETE", "/api/auth/me", json={"password": "Correct-horse-battery1"}, headers=headers)
    assert res.status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    admin = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "Correct-horse-battery1"}
    ).json()
    spaces = client.get("/api/admin/spaces", headers=auth_headers(admin["access_token"])).json()
    assert space["id"] not in [s["id"] for s in spaces["items"]]


def test_last_admin_cannot_delete_own_account(client):
    admin = register_user(client, "admin@example.com")
    res = client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "Correct-horse-battery1"},
        headers=auth_headers(admin["access_token"]),
    )
    assert res.status_code == 400


def test_admin_lists_are_paginated(client):
    admin = register_user(client, "admin@example.com")
    headers = auth_headers(admin["access_token"])
    for i in range(3):
        register_user(client, f"user{i}@example.com")
    _space(client, admin["access_token"], "A")
    _space(client, admin["access_token"], "B")

    users = client.get("/api/admin/users?limit=2&offset=1", headers=headers).json()
    assert users["total"] == 4 and users["limit"] == 2 and users["offset"] == 1
    assert len(users["items"]) == 2

    spaces = client.get("/api/admin/spaces?limit=1", headers=headers).json()
    assert spaces["total"] == 2 and len(spaces["items"]) == 1
    assert spaces["items"][0]["my_role"] == "admin_view"
    assert spaces["items"][0]["can_upload"] is False


def test_admin_can_delete_a_user_and_their_spaces(client):
    admin = register_user(client, "admin@example.com")
    headers = auth_headers(admin["access_token"])
    user = register_user(client, "user@example.com")
    _space(client, user["access_token"])

    user_id = user["user"]["id"]
    assert client.delete(f"/api/admin/users/{user_id}", headers=headers).status_code == 200
    assert client.get("/api/admin/spaces", headers=headers).json()["total"] == 0
    assert client.delete(f"/api/admin/users/{user_id}", headers=headers).status_code == 404


def test_admin_cannot_delete_or_demote_itself(client):
    admin = register_user(client, "admin@example.com")
    headers = auth_headers(admin["access_token"])
    admin_id = admin["user"]["id"]
    assert client.delete(f"/api/admin/users/{admin_id}", headers=headers).status_code == 400
    assert client.patch(f"/api/admin/users/{admin_id}", json={"role": "user"}, headers=headers).status_code == 400


def test_admin_space_delete_and_snapshot_lifecycle(client):
    admin = register_user(client, "admin@example.com")
    headers = auth_headers(admin["access_token"])
    user = register_user(client, "user@example.com")
    space = _space(client, user["access_token"])

    created = client.post(f"/api/admin/spaces/{space['id']}/snapshots", headers=headers)
    assert created.status_code == 200, created.text
    snapshots = client.get(f"/api/admin/spaces/{space['id']}/snapshots", headers=headers).json()
    assert [s["id"] for s in snapshots] == [created.json()["id"]]
    restore = client.post(
        f"/api/admin/spaces/{space['id']}/snapshots/{created.json()['id']}/restore", headers=headers
    )
    assert restore.status_code == 200

    assert client.delete(f"/api/admin/spaces/{space['id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/admin/spaces/{space['id']}", headers=headers).status_code == 404
    assert client.get(f"/api/admin/spaces/{space['id']}/snapshots", headers=headers).status_code == 404


def test_admin_stats_sum_storage(client):
    admin = register_user(client, "admin@example.com")
    space = _space(client, admin["access_token"])
    _upload(client, admin["access_token"], space["id"], b"1234567")
    stats = client.get("/api/admin/stats", headers=auth_headers(admin["access_token"])).json()
    assert stats["storage_bytes"] == 7
    assert stats["users"] == 1 and stats["spaces"] == 1 and stats["documents"] == 1
    assert stats["new_documents_7d"] == 1
    # 30-day activity chart, oldest day first, today last.
    assert len(stats["daily"]) == 30
    assert stats["daily"][-1]["users"] == 1 and stats["daily"][-1]["documents"] == 1


def test_vector_graph_of_an_empty_space(client):
    owner = register_user(client, "owner@example.com")
    space = _space(client, owner["access_token"])
    res = client.get(f"/api/spaces/{space['id']}/vector-graph", headers=auth_headers(owner["access_token"]))
    assert res.json() == {"nodes": [], "edges": [], "truncated": False}


def test_logout_everywhere_invalidates_previous_tokens(client):
    user = register_user(client, "user@example.com")
    old = auth_headers(user["access_token"])
    res = client.post("/api/auth/logout-everywhere", headers=old)
    assert res.status_code == 200
    assert client.get("/api/auth/me", headers=old).status_code == 401
    assert client.get("/api/auth/me", headers=auth_headers(res.json()["access_token"])).status_code == 200
