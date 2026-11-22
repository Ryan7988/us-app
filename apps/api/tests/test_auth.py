from fastapi.testclient import TestClient

from tests.conftest import USERS, auth, login


def test_healthz(client: TestClient) -> None:
    r = client.get("/api/v1/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_setup_flow_once(client: TestClient) -> None:
    assert client.get("/api/v1/setup/status").json() == {"needs_setup": True}
    r = client.post("/api/v1/setup", json={"users": USERS})
    assert r.status_code == 201
    assert [u["username"] for u in r.json()] == ["ryan", "her"]
    assert "password_hash" not in r.json()[0]
    assert client.get("/api/v1/setup/status").json() == {"needs_setup": False}
    # 建完永久關閉
    assert client.post("/api/v1/setup", json={"users": USERS}).status_code == 409


def test_setup_rejects_duplicate_and_short_password(client: TestClient) -> None:
    dup = [USERS[0], {**USERS[1], "username": "RYAN"}]
    assert client.post("/api/v1/setup", json={"users": dup}).status_code == 422
    weak = [USERS[0], {**USERS[1], "password": "short"}]
    assert client.post("/api/v1/setup", json={"users": weak}).status_code == 422
    assert client.post("/api/v1/setup", json={"users": [USERS[0]]}).status_code == 422


def test_login_and_me(client: TestClient, setup_done: None) -> None:
    token = login(client, 0)
    assert "us_refresh" in client.cookies
    r = client.get("/api/v1/auth/me", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["username"] == "ryan"


def test_login_wrong_password(client: TestClient, setup_done: None) -> None:
    r = client.post("/api/v1/auth/login", json={"username": "ryan", "password": "nope"})
    assert r.status_code == 401


def test_login_rate_limit(client: TestClient, setup_done: None) -> None:
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"username": "ryan", "password": "nope"})
    r = client.post(
        "/api/v1/auth/login", json={"username": "ryan", "password": USERS[0]["password"]}
    )
    assert r.status_code == 429


def test_requires_auth(client: TestClient, setup_done: None) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/wishes").status_code == 401
    assert client.get("/api/v1/auth/me", headers=auth("garbage")).status_code == 401


def test_refresh_rotates_and_old_token_is_rejected(client: TestClient, setup_done: None) -> None:
    login(client, 0)
    old = client.cookies.get("us_refresh")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    new = client.cookies.get("us_refresh")
    assert new and new != old
    assert client.get("/api/v1/auth/me", headers=auth(r.json()["access_token"])).status_code == 200
    # 舊 token 不能再用
    client.cookies.clear()
    client.cookies.set("us_refresh", old, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_revokes_refresh(client: TestClient, setup_done: None) -> None:
    login(client, 0)
    raw = client.cookies.get("us_refresh")
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set("us_refresh", raw, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_users_list(client: TestClient, setup_done: None) -> None:
    token = login(client, 1)
    r = client.get("/api/v1/users", headers=auth(token))
    assert [u["display_name"] for u in r.json()] == ["Ryan", "寶貝"]
