from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.db import engine
from app.models import GachaCard, GachaDraw
from tests.conftest import auth, login, me_id, subscribe_push


def _drawn(client: TestClient, n_cards: int = 4) -> tuple[str, str]:
    ta, tb = login(client, 0), login(client, 1)
    for i in range(n_cards):
        client.post(
            "/api/v1/gacha/cards", json={"content": f"任務{i}", "rarity": "R"}, headers=auth(ta)
        )
    client.post("/api/v1/gacha/current/ready", headers=auth(ta))
    r = client.post("/api/v1/gacha/current/ready", headers=auth(tb)).json()
    assert r["status"] == "drawn" and r["rerolls_left"] == 1
    return ta, tb


def test_reroll_needs_partner_agreement(
    client: TestClient, setup_done: None, pushes: list[dict]
) -> None:
    ta, tb = _drawn(client)
    subscribe_push(client, tb)
    subscribe_push(client, ta)
    first = client.get("/api/v1/gacha/current", headers=auth(ta)).json()["draw"]

    r = client.post(
        "/api/v1/gacha/current/reroll/request",
        json={"reason": "月底才開始，來不及"},
        headers=auth(ta),
    )
    assert r.status_code == 200 and r.json()["reroll_requested_by"] == me_id(client, ta)
    assert any("想重抽" in p["title"] and p["user_id"] == me_id(client, tb) for p in pushes)
    # 自己不能同意自己的提議
    assert (
        client.post(
            "/api/v1/gacha/current/reroll/respond", json={"accept": True}, headers=auth(ta)
        ).status_code
        == 403
    )
    # 卡片還沒變
    assert (
        client.get("/api/v1/gacha/current", headers=auth(ta)).json()["draw"]["card_id"]
        == first["card_id"]
    )

    with client.websocket_connect(f"/api/v1/ws?token={ta}") as ws:
        r = client.post(
            "/api/v1/gacha/current/reroll/respond", json={"accept": True}, headers=auth(tb)
        )
        assert r.status_code == 200, r.text
        msg = ws.receive_json()
        assert msg["type"] == "gacha.drawn" and msg["data"]["reroll"] == 1  # 兩支手機都會播動畫
    new = r.json()
    assert new["status"] == "drawn" and new["card_id"] != first["card_id"]  # 不會抽到同一張
    assert (
        new["reroll_count"] == 1 and new["rerolls_left"] == 0 and new["reroll_requested_by"] is None
    )
    assert new["rerolled_cards"][0]["card_id"] == first["card_id"]
    assert new["rerolled_cards"][0]["reason"] == "月底才開始，來不及"
    with Session(engine) as s:
        old = s.get(GachaCard, first["card_id"])
        assert old is not None and old.status == "active"  # 換掉的卡放回卡池
        assert len(s.exec(select(GachaCard).where(GachaCard.status == "drawn")).all()) == 1

    # 次數用完
    r = client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(tb))
    assert r.status_code == 409


def test_decline_and_cancel(client: TestClient, setup_done: None) -> None:
    ta, tb = _drawn(client)
    card = client.get("/api/v1/gacha/current", headers=auth(ta)).json()["draw"]["card_id"]
    client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(ta))
    # 對方已提議時，另一個人再提議 → 409（直接按同意就好）
    assert (
        client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(tb)).status_code
        == 409
    )
    r = client.post(
        "/api/v1/gacha/current/reroll/respond", json={"accept": False}, headers=auth(tb)
    ).json()
    assert r["card_id"] == card and r["reroll_requested_by"] is None and r["rerolls_left"] == 1

    client.post("/api/v1/gacha/current/reroll/request", json={"reason": "x"}, headers=auth(tb))
    r = client.post("/api/v1/gacha/current/reroll/cancel", headers=auth(tb)).json()
    assert r["reroll_requested_by"] is None
    assert (
        client.post(
            "/api/v1/gacha/current/reroll/respond", json={"accept": True}, headers=auth(ta)
        ).status_code
        == 409
    )


def test_reroll_only_when_drawn_and_pool_not_empty(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    assert (
        client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(ta)).status_code
        == 409
    )
    ta, tb = _drawn(client, n_cards=1)  # 卡池只有一張：重抽後沒有別的可抽
    client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(ta))
    r = client.post("/api/v1/gacha/current/reroll/respond", json={"accept": True}, headers=auth(tb))
    assert r.status_code == 409 and "沒有其他卡" in r.json()["detail"]
    with Session(engine) as s:
        d = s.exec(select(GachaDraw)).one()
        assert d.status == "drawn" and d.reroll_count == 0  # 失敗時什麼都沒變
        assert s.get(GachaCard, d.card_id).status == "drawn"  # type: ignore[union-attr]


def test_reroll_setting(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    s = client.get("/api/v1/gacha/settings", headers=auth(ta)).json()
    assert s["rerolls_per_month"] == 1
    s["rerolls_per_month"] = 0
    assert (
        client.put("/api/v1/gacha/settings", json=s, headers=auth(ta)).json()["rerolls_per_month"]
        == 0
    )
    ta, tb = _drawn_with_zero(client)
    assert (
        client.post("/api/v1/gacha/current/reroll/request", json={}, headers=auth(ta)).status_code
        == 409
    )


def _drawn_with_zero(client: TestClient) -> tuple[str, str]:
    ta, tb = login(client, 0), login(client, 1)
    for i in range(3):
        client.post(
            "/api/v1/gacha/cards", json={"content": f"卡{i}", "rarity": "R"}, headers=auth(ta)
        )
    client.post("/api/v1/gacha/current/ready", headers=auth(ta))
    client.post("/api/v1/gacha/current/ready", headers=auth(tb))
    return ta, tb
