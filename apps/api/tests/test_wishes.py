from fastapi.testclient import TestClient

from tests.conftest import auth, login


def test_wish_crud_and_filters(client: TestClient, setup_done: None) -> None:
    a = auth(login(client, 0))
    b = auth(login(client, 1))

    r = client.post(
        "/api/v1/wishes",
        json={"title": "去合歡山看星星", "category": "旅行", "url": "https://example.com/x"},
        headers=a,
    )
    assert r.status_code == 201, r.text
    wish = r.json()
    assert wish["created_at"].endswith("Z")
    assert wish["done_at"] is None

    client.post("/api/v1/wishes", json={"title": "一起做蛋糕", "category": "在家"}, headers=b)

    # B 看得到 A 加的
    items = client.get("/api/v1/wishes", headers=b).json()
    assert {w["title"] for w in items} == {"去合歡山看星星", "一起做蛋糕"}

    # 編輯
    r = client.patch(f"/api/v1/wishes/{wish['id']}", json={"note": "要帶外套"}, headers=b)
    assert r.json()["note"] == "要帶外套"
    assert r.json()["title"] == "去合歡山看星星"

    # 完成
    r = client.post(f"/api/v1/wishes/{wish['id']}/complete", json={"done": True}, headers=b)
    assert r.json()["done_at"] is not None
    assert r.json()["done_by"] == items[0]["created_by"] or r.json()["done_by"]

    done = client.get("/api/v1/wishes?status_filter=done", headers=a).json()
    open_ = client.get("/api/v1/wishes?status_filter=open", headers=a).json()
    assert [w["title"] for w in done] == ["去合歡山看星星"]
    assert [w["title"] for w in open_] == ["一起做蛋糕"]
    cat = client.get("/api/v1/wishes?category=在家", headers=a).json()
    assert [w["title"] for w in cat] == ["一起做蛋糕"]

    # 取消完成
    r = client.post(f"/api/v1/wishes/{wish['id']}/complete", json={"done": False}, headers=a)
    assert r.json()["done_at"] is None

    # 軟刪除
    assert client.delete(f"/api/v1/wishes/{wish['id']}", headers=a).status_code == 204
    assert len(client.get("/api/v1/wishes", headers=a).json()) == 1
    assert client.patch(f"/api/v1/wishes/{wish['id']}", json={}, headers=a).status_code == 404


def test_wish_validation(client: TestClient, setup_done: None) -> None:
    a = auth(login(client, 0))
    assert client.post("/api/v1/wishes", json={"title": ""}, headers=a).status_code == 422
    r = client.post("/api/v1/wishes", json={"title": "x", "url": "not a url"}, headers=a)
    assert r.status_code == 422


def test_websocket_receives_wish_changed(client: TestClient, setup_done: None) -> None:
    token_a = login(client, 0)
    token_b = login(client, 1)
    with client.websocket_connect(f"/api/v1/ws?token={token_b}") as ws:
        client.post("/api/v1/wishes", json={"title": "看海"}, headers=auth(token_a))
        msg = ws.receive_json()
        assert msg["type"] == "wish.changed"
        assert msg["data"]["action"] == "created"


def test_websocket_rejects_bad_token(client: TestClient, setup_done: None) -> None:
    import pytest
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/api/v1/ws?token=bad") as ws:
        ws.receive_json()
