import os
import tempfile
from collections.abc import Iterator

import pytest

# 測試用暫存 SQLite；必須在 import app 之前設定
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.sqlite3"
os.environ["COOKIE_SECURE"] = "false"
os.environ["MEDIA_ROOT"] = f"{_tmpdir}/media"
os.environ["BACKUP_STATUS_DIR"] = f"{_tmpdir}/backup-status"
os.environ["OLLAMA_URL"] = "http://127.0.0.1:9"  # 測試不連真的 Ollama

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.auth import login_limiter  # noqa: E402

_send_real = None  # 原始的 push._send_one（給需要測真實加密的測試用）

USERS = [
    {"username": "ryan", "display_name": "Ryan", "password": "password-ryan", "color": "#60a5fa"},
    {"username": "her", "display_name": "寶貝", "password": "password-her", "color": "#f472b6"},
]


@pytest.fixture(autouse=True)
def _fresh_db() -> Iterator[None]:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    login_limiter.reset()
    yield


@pytest.fixture(autouse=True)
def pushes(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """攔截所有推播（不真的送出），測試可以檢查誰收到什麼。"""
    import json

    from app.services import push as push_mod

    sent: list[dict] = []
    global _send_real
    _send_real = push_mod._send_one

    def fake_send(sub, payload, vapid):  # type: ignore[no-untyped-def]
        sent.append({"user_id": sub.user_id, **json.loads(payload)})
        return 201

    monkeypatch.setattr(push_mod, "_send_one", fake_send)
    return sent


def subscribe_push(client: TestClient, token: str, n: int = 0) -> None:
    r = client.post(
        "/api/v1/push/subscribe",
        json={"endpoint": f"https://push.example/{token[-8:]}/{n}", "p256dh": "k", "auth": "a"},
        headers=auth(token),
    )
    assert r.status_code == 204, r.text


def me_id(client: TestClient, token: str) -> str:
    return client.get("/api/v1/auth/me", headers=auth(token)).json()["id"]


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def setup_done(client: TestClient) -> None:
    r = client.post("/api/v1/setup", json={"users": USERS})
    assert r.status_code == 201, r.text


def login(client: TestClient, idx: int) -> str:
    u = USERS[idx]
    r = client.post(
        "/api/v1/auth/login", json={"username": u["username"], "password": u["password"]}
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
