"""Basic integration tests — run with: pytest tests/test_api.py -v"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.services.seed import run_seed


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        run_seed(session)
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_health(client: TestClient):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_list_spaces_seeded(client: TestClient):
    resp = client.get("/api/spaces")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert "Inbox" in names
    assert "Personal" in names
    assert "Work" in names


def test_create_space(client: TestClient):
    resp = client.post("/api/spaces", json={"name": "Test Space", "position": 99})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Space"
    assert data["id"] is not None


def test_get_space(client: TestClient):
    create_resp = client.post("/api/spaces", json={"name": "Get Me"})
    space_id = create_resp.json()["id"]
    resp = client.get(f"/api/spaces/{space_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Me"


def test_update_space(client: TestClient):
    create_resp = client.post("/api/spaces", json={"name": "Old Name"})
    space_id = create_resp.json()["id"]
    resp = client.patch(f"/api/spaces/{space_id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_delete_space_soft(client: TestClient):
    create_resp = client.post("/api/spaces", json={"name": "Bye Space"})
    space_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/spaces/{space_id}")
    assert del_resp.status_code == 204
    # Should no longer appear in list
    list_resp = client.get("/api/spaces")
    names = [s["name"] for s in list_resp.json()]
    assert "Bye Space" not in names
    # Direct get should 404
    get_resp = client.get(f"/api/spaces/{space_id}")
    assert get_resp.status_code == 404


def test_create_item_in_space(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Item Space"})
    space_id = space_resp.json()["id"]

    item_resp = client.post(
        "/api/items",
        json={
            "space_id": space_id,
            "type": "task",
            "title": "My first task",
            "priority": 5,
        },
    )
    assert item_resp.status_code == 201
    data = item_resp.json()
    assert data["title"] == "My first task"
    assert data["type"] == "task"
    assert data["space_id"] == space_id
    assert data["metadata"] == {}


def test_list_items_by_space(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Filter Space"})
    space_id = space_resp.json()["id"]

    client.post(
        "/api/items", json={"space_id": space_id, "type": "note", "title": "Note A"}
    )
    client.post(
        "/api/items", json={"space_id": space_id, "type": "task", "title": "Task B"}
    )

    resp = client.get(f"/api/items?space_id={space_id}")
    assert resp.status_code == 200
    titles = [i["title"] for i in resp.json()]
    assert "Note A" in titles
    assert "Task B" in titles


def test_list_items_by_type(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Type Filter Space"})
    space_id = space_resp.json()["id"]

    client.post(
        "/api/items", json={"space_id": space_id, "type": "note", "title": "A Note"}
    )
    client.post(
        "/api/items", json={"space_id": space_id, "type": "task", "title": "A Task"}
    )

    resp = client.get(f"/api/items?space_id={space_id}&type=note")
    assert resp.status_code == 200
    items = resp.json()
    assert all(i["type"] == "note" for i in items)


def test_update_item(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Update Space"})
    space_id = space_resp.json()["id"]
    item_resp = client.post(
        "/api/items", json={"space_id": space_id, "type": "task", "title": "Original"}
    )
    item_id = item_resp.json()["id"]

    resp = client.patch(
        f"/api/items/{item_id}", json={"title": "Updated", "priority": 9}
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"
    assert resp.json()["priority"] == 9


def test_delete_item_soft(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Delete Item Space"})
    space_id = space_resp.json()["id"]
    item_resp = client.post(
        "/api/items", json={"space_id": space_id, "type": "task", "title": "Gone"}
    )
    item_id = item_resp.json()["id"]

    del_resp = client.delete(f"/api/items/{item_id}")
    assert del_resp.status_code == 204

    get_resp = client.get(f"/api/items/{item_id}")
    assert get_resp.status_code == 404


def test_status_sets_seeded(client: TestClient):
    resp = client.get("/api/status-sets")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert "Default" in names
    assert "Task Triage" in names
    assert "Opportunity" in names


def test_create_status_set_and_status(client: TestClient):
    ss_resp = client.post("/api/status-sets", json={"name": "Custom Set"})
    assert ss_resp.status_code == 201
    set_id = ss_resp.json()["id"]

    s_resp = client.post(
        f"/api/status-sets/{set_id}/statuses",
        json={
            "label": "Pending",
            "color": "#facc15",
            "behavior": "active",
            "position": 0,
        },
    )
    assert s_resp.status_code == 201
    assert s_resp.json()["label"] == "Pending"

    list_resp = client.get(f"/api/status-sets/{set_id}/statuses")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_item_with_metadata(client: TestClient):
    space_resp = client.post("/api/spaces", json={"name": "Meta Space"})
    space_id = space_resp.json()["id"]

    item_resp = client.post(
        "/api/items",
        json={
            "space_id": space_id,
            "type": "link",
            "title": "Cool article",
            "metadata": {"url": "https://example.com", "preview_image": None},
        },
    )
    assert item_resp.status_code == 201
    data = item_resp.json()
    assert data["metadata"]["url"] == "https://example.com"


def test_create_task_gets_default_active_status(client: TestClient):
    # Work uses the Triage set (id 2); its first active status is "Active".
    space_id = client.post(
        "/api/spaces", json={"name": "Auto Status", "status_set_id": 2}
    ).json()["id"]

    task = client.post(
        "/api/items",
        json={"space_id": space_id, "type": "task", "title": "Auto"},
    ).json()
    assert task["status_id"] is not None
    active_id = _status_id_by_behavior(client, 2, "active")
    assert task["status_id"] == active_id

    # A note carries no status.
    note = client.post(
        "/api/items",
        json={"space_id": space_id, "type": "note", "title": "Just a note"},
    ).json()
    assert note["status_id"] is None


def test_auth_status_open_by_default(client: TestClient):
    # No AUTH_TOKEN configured in tests → auth disabled, routes open.
    resp = client.get("/api/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"auth_required": False}
    # A protected route works without a token when auth is disabled.
    assert client.get("/api/auth/check").status_code == 200


def test_vapid_public_key(client: TestClient):
    resp = client.get("/api/push/vapid-public-key")
    assert resp.status_code == 200
    key = resp.json()["key"]
    # base64url-encoded uncompressed P-256 point (65 bytes → 87 chars).
    assert isinstance(key, str) and len(key) > 80


def test_push_subscribe_idempotent(client: TestClient):
    sub = {
        "endpoint": "https://example.com/push/abc",
        "keys": {"p256dh": "BPp256dhkeyvalue", "auth": "authsecret"},
    }
    assert client.post("/api/push/subscribe", json=sub).status_code == 201
    # Re-subscribing the same endpoint updates rather than duplicates.
    assert client.post("/api/push/subscribe", json=sub).status_code == 201


def test_space_description_roundtrip(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Described"}).json()["id"]
    resp = client.patch(f"/api/spaces/{sid}", json={"description": "What it's for."})
    assert resp.status_code == 200
    assert resp.json()["description"] == "What it's for."


def test_attachment_upload_list_download_delete(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Files"}).json()["id"]
    up = client.post(
        "/api/attachments",
        files={"file": ("hello.txt", b"hi there", "text/plain")},
        data={"space_id": str(sid)},
    )
    assert up.status_code == 201
    att = up.json()
    assert att["filename"] == "hello.txt"
    assert att["size"] == 8

    listed = client.get(f"/api/attachments?space_id={sid}").json()
    assert len(listed) == 1

    dl = client.get(f"/api/attachments/{att['id']}/download")
    assert dl.status_code == 200
    assert dl.content == b"hi there"

    assert client.delete(f"/api/attachments/{att['id']}").status_code == 204
    assert client.get(f"/api/attachments?space_id={sid}").json() == []


def test_list_all_statuses(client: TestClient):
    resp = client.get("/api/statuses")
    assert resp.status_code == 200
    statuses = resp.json()
    # Seeded sets: 2 (default) + 4 (triage) + 5 (opportunity) = 11
    assert len(statuses) == 11
    behaviors = {s["behavior"] for s in statuses}
    assert behaviors == {"active", "done", "dismissed"}


def _status_id_by_behavior(client: TestClient, set_id: int, behavior: str) -> int:
    statuses = client.get(f"/api/status-sets/{set_id}/statuses").json()
    return next(s["id"] for s in statuses if s["behavior"] == behavior)


def test_completing_item_stamps_and_clears_completed_at(client: TestClient):
    # Default set (id 1): To Do (active) + Done (done).
    active_id = _status_id_by_behavior(client, 1, "active")
    done_id = _status_id_by_behavior(client, 1, "done")

    space_id = client.post("/api/spaces", json={"name": "Done Space"}).json()["id"]
    item = client.post(
        "/api/items",
        json={
            "space_id": space_id,
            "type": "task",
            "title": "Finish me",
            "status_id": active_id,
        },
    ).json()
    assert item["completed_at"] is None

    # Move to a "done" status → completed_at is stamped automatically.
    done = client.patch(f"/api/items/{item['id']}", json={"status_id": done_id}).json()
    assert done["completed_at"] is not None

    # Reopen (back to active) → completed_at is cleared.
    reopened = client.patch(
        f"/api/items/{item['id']}", json={"status_id": active_id}
    ).json()
    assert reopened["completed_at"] is None


def test_update_status_set_rename_and_default(client: TestClient):
    # Rename a set.
    resp = client.patch("/api/status-sets/2", json={"name": "My Triage"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "My Triage"

    # Marking set 2 default must clear the default flag on set 1.
    client.patch("/api/status-sets/2", json={"is_default": True})
    sets = {s["id"]: s for s in client.get("/api/status-sets").json()}
    assert sets[2]["is_default"] is True
    assert sets[1]["is_default"] is False


def test_group_space_rejects_items(client: TestClient):
    g = client.post("/api/spaces", json={"name": "My Group", "is_group": True}).json()
    assert g["is_group"] is True
    # Items can't be created inside a group.
    bad = client.post(
        "/api/items", json={"space_id": g["id"], "type": "task", "title": "nope"}
    )
    assert bad.status_code == 400
    # A normal space still accepts items.
    s = client.post("/api/spaces", json={"name": "Normal"}).json()
    ok = client.post(
        "/api/items", json={"space_id": s["id"], "type": "task", "title": "ok"}
    )
    assert ok.status_code == 201


def test_settings_get_update_and_clamp(client: TestClient):
    base = client.get("/api/settings").json()
    assert set(base) == {"digest_hour", "digest_minute", "digest_count"}

    upd = client.put("/api/settings", json={"digest_hour": 7, "digest_count": 5}).json()
    assert upd["digest_hour"] == 7 and upd["digest_count"] == 5
    # Out-of-range values clamp, and persist across reads.
    clamped = client.put(
        "/api/settings", json={"digest_hour": 99, "digest_count": 0}
    ).json()
    assert clamped["digest_hour"] == 23 and clamped["digest_count"] == 1
    assert client.get("/api/settings").json()["digest_hour"] == 23


def test_item_purge_only_from_trash(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Purge Items"}).json()["id"]
    iid = client.post(
        "/api/items", json={"space_id": sid, "type": "task", "title": "Doomed"}
    ).json()["id"]
    # A live item can't be purged — it must be trashed first.
    assert client.delete(f"/api/items/{iid}/purge").status_code == 400
    assert client.delete(f"/api/items/{iid}").status_code == 204
    assert any(i["id"] == iid for i in client.get("/api/items/trash").json())
    assert client.delete(f"/api/items/{iid}/purge").status_code == 204
    assert all(i["id"] != iid for i in client.get("/api/items/trash").json())
    # Purging again 404s (it's truly gone).
    assert client.delete(f"/api/items/{iid}/purge").status_code == 404


def test_empty_trash_and_purge_selected(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Bulk Purge"}).json()["id"]
    ids = [
        client.post(
            "/api/items", json={"space_id": sid, "type": "task", "title": f"T{i}"}
        ).json()["id"]
        for i in range(3)
    ]
    for i in ids:
        client.delete(f"/api/items/{i}")
    r = client.post("/api/items/trash/purge", json={"ids": ids[:2]})
    assert r.status_code == 200 and r.json()["purged"] == 2
    r2 = client.post("/api/items/trash/empty")
    assert r2.json()["purged"] == 1
    assert client.get("/api/items/trash").json() == []


def test_space_cascade_delete_and_restore(client: TestClient):
    parent = client.post("/api/spaces", json={"name": "Parent"}).json()["id"]
    child = client.post(
        "/api/spaces", json={"name": "Child", "parent_id": parent}
    ).json()["id"]
    it = client.post(
        "/api/items", json={"space_id": child, "type": "task", "title": "Inside"}
    ).json()["id"]

    assert client.delete(f"/api/spaces/{parent}").status_code == 204
    names = [s["name"] for s in client.get("/api/spaces").json()]
    assert "Parent" not in names and "Child" not in names
    # The child's item no longer lingers in cross-space feeds, and is in the Trash.
    assert all(i["id"] != it for i in client.get("/api/items").json())
    assert any(i["id"] == it for i in client.get("/api/items/trash").json())
    trash_ids = [s["id"] for s in client.get("/api/spaces/trash").json()]
    assert parent in trash_ids and child in trash_ids

    assert client.post(f"/api/spaces/{parent}/restore").status_code == 200
    names2 = [s["name"] for s in client.get("/api/spaces").json()]
    assert "Parent" in names2 and "Child" in names2
    assert any(i["id"] == it for i in client.get("/api/items").json())


def test_space_archive_hides_items_then_unarchive(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Archive Me"}).json()["id"]
    it = client.post(
        "/api/items", json={"space_id": sid, "type": "task", "title": "Hidden"}
    ).json()["id"]

    assert client.post(f"/api/spaces/{sid}/archive").status_code == 200
    assert "Archive Me" not in [s["name"] for s in client.get("/api/spaces").json()]
    assert sid in [s["id"] for s in client.get("/api/spaces/archived").json()]
    # Hidden from cross-space feeds, still visible inside the space itself.
    assert all(i["id"] != it for i in client.get("/api/items").json())
    assert any(i["id"] == it for i in client.get(f"/api/items?space_id={sid}").json())

    assert client.post(f"/api/spaces/{sid}/unarchive").status_code == 200
    assert "Archive Me" in [s["name"] for s in client.get("/api/spaces").json()]
    assert any(i["id"] == it for i in client.get("/api/items").json())


def test_space_purge_only_from_trash(client: TestClient):
    sid = client.post("/api/spaces", json={"name": "Hard Delete"}).json()["id"]
    assert client.delete(f"/api/spaces/{sid}/purge").status_code == 400
    client.delete(f"/api/spaces/{sid}")
    assert client.delete(f"/api/spaces/{sid}/purge").status_code == 204
    assert sid not in [s["id"] for s in client.get("/api/spaces/trash").json()]


def test_dismissing_item_stamps_completed_at(client: TestClient):
    # Task Triage set (id 2) has a "dismissed" status.
    active_id = _status_id_by_behavior(client, 2, "active")
    dismissed_id = _status_id_by_behavior(client, 2, "dismissed")

    space_id = client.post("/api/spaces", json={"name": "Skip Space"}).json()["id"]
    item = client.post(
        "/api/items",
        json={
            "space_id": space_id,
            "type": "task",
            "title": "Skip me",
            "status_id": active_id,
        },
    ).json()

    dismissed = client.patch(
        f"/api/items/{item['id']}", json={"status_id": dismissed_id}
    ).json()
    assert dismissed["completed_at"] is not None
