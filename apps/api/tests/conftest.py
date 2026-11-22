import os
import tempfile
from collections.abc import Iterator

import pytest

# 測試用暫存 SQLite；必須在 import app 之前設定
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.sqlite3"
os.environ["COOKIE_SECURE"] = "false"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.auth import login_limiter  # noqa: E402

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
