import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.db import engine
from app.models import PushSubscription
from app.services import push as push_mod
from app.services.push import PushMessage, send_to_users
from tests.conftest import auth, login, me_id, subscribe_push
from tests.images import jpeg

TPE = {"lat": 24.99, "lng": 121.3, "accuracy_m": 20}


def test_location_sharing_and_checkin(
    client: TestClient, setup_done: None, pushes: list[dict]
) -> None:
    ta, tb = login(client, 0), login(client, 1)
    a, b = me_id(client, ta), me_id(client, tb)
    subscribe_push(client, tb)

    client.post("/api/v1/locations", json=TPE, headers=auth(ta))  # 沒開分享：不記錄
    latest = {
        x["user_id"]: x for x in client.get("/api/v1/locations/latest", headers=auth(tb)).json()
    }
    assert latest[a]["location"] is None and latest[a]["sharing"] is False

    client.put("/api/v1/locations/sharing", json={"enabled": True}, headers=auth(ta))
    client.post("/api/v1/locations", json=TPE, headers=auth(ta))
    latest = {
        x["user_id"]: x for x in client.get("/api/v1/locations/latest", headers=auth(tb)).json()
    }
    assert latest[a]["location"]["lat"] == 24.99

    # 報平安：一定記錄、一定推播
    client.put("/api/v1/locations/sharing", json={"enabled": False}, headers=auth(ta))
    r = client.post(
        "/api/v1/locations", json=TPE | {"kind": "checkin", "message": "到家了"}, headers=auth(ta)
    )
    assert r.status_code == 201
    assert any(
        p["user_id"] == b and "報平安" in p["title"] and p["body"] == "到家了" for p in pushes
    )
    latest = {
        x["user_id"]: x for x in client.get("/api/v1/locations/latest", headers=auth(tb)).json()
    }
    assert latest[a]["location"] is None  # 關了分享看不到位置
    assert latest[a]["last_checkin"]["message"] == "到家了"  # 但報平安看得到

    assert client.delete("/api/v1/locations", headers=auth(ta)).status_code == 204
    latest = {
        x["user_id"]: x for x in client.get("/api/v1/locations/latest", headers=auth(ta)).json()
    }
    assert latest[a]["last_checkin"] is None


def test_push_subscribe_and_cleanup(client: TestClient, setup_done: None, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    t = login(client, 0)
    k1 = client.get("/api/v1/push/vapid-public-key", headers=auth(t)).json()["key"]
    k2 = client.get("/api/v1/push/vapid-public-key", headers=auth(t)).json()["key"]
    assert k1 == k2 and len(k1) == 87  # 自動產生一次後固定
    subscribe_push(client, t, 1)
    subscribe_push(client, t, 2)
    subscribe_push(client, t, 2)  # 重複訂閱不會多一筆
    assert client.get("/api/v1/push/status", headers=auth(t)).json() == {"devices": 2}
    assert client.post("/api/v1/push/test", headers=auth(t)).json()["sent"] == 2

    codes = iter([201, 410])
    monkeypatch.setattr(push_mod, "_send_one", lambda sub, payload, vapid: next(codes))
    stats = send_to_users([me_id(client, t)], PushMessage("hi"))
    assert stats == {"sent": 1, "failed": 0, "removed": 1}  # 410 → 刪除失效訂閱
    with Session(engine) as s:
        assert len(s.exec(select(PushSubscription)).all()) == 1


def test_real_webpush_encryption(client: TestClient, setup_done: None, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """不 mock 加密：確認 VAPID 金鑰與 pywebpush 真的能產生請求（只攔截最後的 HTTP）。"""
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    from tests.conftest import _send_real  # noqa: F401  # 由 conftest 保留原始函式

    t = login(client, 0)
    key = (
        ec.generate_private_key(ec.SECP256R1())
        .public_key()
        .public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    )
    p256dh = base64.urlsafe_b64encode(key).rstrip(b"=").decode()
    authsecret = base64.urlsafe_b64encode(b"0123456789abcdef").rstrip(b"=").decode()
    client.post(
        "/api/v1/push/subscribe",
        json={"endpoint": "https://web.push.apple.com/abc", "p256dh": p256dh, "auth": authsecret},
        headers=auth(t),
    )
    captured = {}

    class Resp:
        status_code = 201
        text = ""
        headers: dict = {}

    def fake_post(url, data=None, headers=None, timeout=None, **kw):  # type: ignore[no-untyped-def]
        captured.update(url=url, headers=headers, size=len(data))
        return Resp()

    monkeypatch.setattr(push_mod, "_send_one", _send_real)
    monkeypatch.setattr("requests.post", fake_post)
    stats = send_to_users([me_id(client, t)], PushMessage("測試", "內容"))
    assert stats["sent"] == 1
    assert captured["url"] == "https://web.push.apple.com/abc"
    assert captured["headers"]["Authorization"].startswith("vapid t=")
    assert captured["headers"]["Content-Encoding"] == "aes128gcm"


def test_profile_password_sessions_settings(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    r = client.patch(
        "/api/v1/auth/me", json={"display_name": "小萊", "color": "#123456"}, headers=auth(t)
    )
    assert r.json()["display_name"] == "小萊"
    assert (
        client.post(
            "/api/v1/auth/password",
            json={"current_password": "wrong", "new_password": "newpassword1"},
            headers=auth(t),
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/auth/password",
            json={"current_password": "password-ryan", "new_password": "newpassword1"},
            headers=auth(t),
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "ryan", "password": "newpassword1"}
        ).status_code
        == 200
    )
    sessions = client.get("/api/v1/auth/sessions", headers=auth(t)).json()
    assert len(sessions) >= 2 and any(s["current"] for s in sessions)
    other = next(s for s in sessions if not s["current"])
    assert client.delete(f"/api/v1/auth/sessions/{other['id']}", headers=auth(t)).status_code == 204
    assert client.get("/api/v1/settings", headers=auth(t)).json() == {"anniversary": None}
    assert client.patch(
        "/api/v1/settings", json={"anniversary": "2024-02-14"}, headers=auth(t)
    ).json() == {"anniversary": "2024-02-14"}


def test_admin_endpoints(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    h = client.get("/api/v1/admin/health", headers=auth(t)).json()
    assert h["db"]["ok"] and h["ollama"]["reachable"] is False and h["worker"]["ok"] is False
    st = client.get("/api/v1/admin/stats", headers=auth(t)).json()
    assert st["disk"]["total"] > 0 and "photos" in st

    d = Path(get_settings().backup_status_dir)
    d.mkdir(parents=True, exist_ok=True)
    (d / "backups.jsonl").write_text(
        json.dumps(
            {"status": "ok", "message": "snapshot saved", "finished_at": "2026-11-22T03:31:00Z"}
        )
        + "\n"
    )
    b = client.get("/api/v1/admin/backups", headers=auth(t)).json()
    assert b["backups"][0]["status"] == "ok"

    assert client.post("/api/v1/admin/ai/generate", headers=auth(t)).status_code == 503

    client.post(
        "/api/v1/photos",
        files=[("files", ("a.jpg", jpeg(300, 200), "image/jpeg"))],
        headers=auth(t),
    )
    for p in (Path(get_settings().media_root) / "thumbs").rglob("*.jpg"):
        p.unlink()
    assert client.post("/api/v1/admin/media/rebuild", headers=auth(t)).json() == {
        "rebuilt": 1,
        "failed": 0,
    }
    assert client.get("/api/v1/admin/errors", headers=auth(t)).json() == []
