import threading
from collections import Counter
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.db import engine
from app.models import GachaCard, GachaDraw
from app.services.gacha import EmptyPoolError, draw, misses_since_last_ssr, simulate
from tests.conftest import USERS, auth, login, subscribe_push

RW = {"SSR": 0.08, "SR": 0.27, "R": 0.65}
SW = {"custom": 2.0, "ai": 1.0}


@dataclass(frozen=True)
class C:
    id: str
    rarity: str
    source: str


POOL = [
    C(f"{r}{i}{s}", r, s) for r in ("SSR", "SR", "R") for i in range(3) for s in ("custom", "ai")
]


def test_rarity_distribution_100k() -> None:
    """驗收：抽 10 萬次，各稀有度比例與設定值誤差 < 0.5 個百分點（關閉保底）。"""
    n = 100_000
    counts = Counter(draw(POOL, RW, SW, 0, 0).rarity for _ in range(n))
    for r, p in RW.items():
        assert abs(counts[r] / n - p) < 0.005, (r, counts[r] / n)


def test_source_weight_within_rarity() -> None:
    n = 60_000
    counts = Counter(draw(POOL, RW, SW, 0, 0).card.source for _ in range(n))
    assert abs(counts["custom"] / n - 2 / 3) < 0.01  # 自己寫的卡是 AI 卡的 2 倍容易抽到


def test_pity_and_empty_tiers() -> None:
    r = draw(POOL, RW, SW, 6, misses=5)
    assert r.rarity == "SSR" and r.pity and len(r.rolls) == 1  # 保底只跳過第一層
    assert not draw(POOL, RW, SW, 6, misses=4).pity
    no_ssr = [c for c in POOL if c.rarity != "SSR"]
    rr = draw(no_ssr, RW, SW, 6, misses=10)  # SSR 池空：保底不觸發，機率分給其他稀有度
    assert rr.rarity in ("SR", "R") and not rr.pity
    only_r = [c for c in POOL if c.rarity == "R"]
    assert all(draw(only_r, RW, SW, 6, 0).rarity == "R" for _ in range(50))
    with pytest.raises(EmptyPoolError):
        draw([], RW, SW, 6, 0)


def test_misses_and_simulate() -> None:
    assert misses_since_last_ssr(["R", "SR", None, "R", "SSR", "R"]) == 3
    assert misses_since_last_ssr([]) == 0
    res = simulate(20_000, POOL, RW, SW, 6)
    assert res["rarity"]["SSR"] > 0.08  # type: ignore[index]  # 保底讓實際 SSR 機率變高
    assert res["pity_rate"] > 0


def _cards(client: TestClient, token: str) -> None:
    for content, rarity in [("一起去看海", "SSR"), ("交換手寫信", "SR"), ("一起煮晚餐", "R")]:
        r = client.post(
            "/api/v1/gacha/cards", json={"content": content, "rarity": rarity}, headers=auth(token)
        )
        assert r.status_code == 201


def test_ready_flow_and_draw_once(client: TestClient, setup_done: None, pushes: list[dict]) -> None:
    ta, tb = login(client, 0), login(client, 1)
    subscribe_push(client, ta)
    subscribe_push(client, tb)
    _cards(client, ta)

    cur = client.get("/api/v1/gacha/current", headers=auth(ta)).json()
    assert cur["draw"]["status"] == "waiting" and cur["pool_counts"] == {"SSR": 1, "SR": 1, "R": 1}

    resp = client.post("/api/v1/gacha/current/ready", headers=auth(ta))
    assert resp.status_code == 200, resp.text
    r = resp.json()
    assert r["status"] == "waiting" and len(r["ready_users"]) == 1
    assert any("準備好" in p["title"] for p in pushes)
    # 取消準備再按一次
    assert (
        client.post("/api/v1/gacha/current/unready", headers=auth(ta)).json()["ready_users"] == []
    )
    client.post("/api/v1/gacha/current/ready", headers=auth(ta))

    with client.websocket_connect(f"/api/v1/ws?token={ta}") as ws:
        resp = client.post("/api/v1/gacha/current/ready", headers=auth(tb))
        assert resp.status_code == 200, resp.text
        r = resp.json()
        assert r["status"] == "drawn" and r["card_content"] and r["rarity"]
        msg = ws.receive_json()
        assert msg["type"] == "gacha.drawn"
    assert sum("開出" in p["title"] for p in pushes) == 2  # 兩支手機都收到

    # 再按也不會重抽
    again = client.post("/api/v1/gacha/current/ready", headers=auth(ta)).json()
    assert again["card_id"] == r["card_id"]
    with Session(engine) as s:
        d = s.exec(select(GachaDraw)).one()
        assert d.pool_snapshot and d.rng_value
        assert s.get(GachaCard, d.card_id).status == "drawn"  # type: ignore[union-attr]

    # 完成需要照片
    assert (
        client.post(
            "/api/v1/gacha/current/complete", json={"photo_id": "x"}, headers=auth(ta)
        ).status_code
        == 404
    )
    hist = client.get("/api/v1/gacha/history", headers=auth(ta)).json()
    assert len(hist) == 1


def test_concurrent_ready_draws_once(client: TestClient, setup_done: None) -> None:
    """兩人同時按「準備好了」：只會抽一次。"""
    ta, tb = login(client, 0), login(client, 1)
    _cards(client, ta)
    barrier = threading.Barrier(2)
    results: list[dict] = []

    def press(token: str) -> None:
        barrier.wait()
        results.append(client.post("/api/v1/gacha/current/ready", headers=auth(token)).json())

    threads = [threading.Thread(target=press, args=(t,)) for t in (ta, tb)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with Session(engine) as s:
        draws = s.exec(select(GachaDraw)).all()
        drawn_cards = s.exec(select(GachaCard).where(GachaCard.status == "drawn")).all()
    assert len(draws) == 1 and draws[0].status == "drawn"
    assert len(drawn_cards) == 1


def test_empty_pool_returns_409(client: TestClient, setup_done: None) -> None:
    ta, tb = login(client, 0), login(client, 1)
    client.post("/api/v1/gacha/current/ready", headers=auth(ta))
    r = client.post("/api/v1/gacha/current/ready", headers=auth(tb))
    assert r.status_code == 409
    assert (
        client.get("/api/v1/gacha/current", headers=auth(ta)).json()["draw"]["status"] == "waiting"
    )


def test_ai_review_and_settings(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    with Session(engine) as s:
        s.add(GachaCard(content="AI 出的題", rarity="R", source="ai", status="pending_review"))
        s.add(GachaCard(content="怪題目", rarity="R", source="ai", status="pending_review"))
        s.commit()
    pending = client.get(
        "/api/v1/gacha/cards?status_filter=pending_review", headers=auth(ta)
    ).json()
    assert len(pending) == 2
    ok = next(c for c in pending if c["content"] == "AI 出的題")
    bad = next(c for c in pending if c["content"] == "怪題目")
    r = client.post(
        f"/api/v1/gacha/cards/{ok['id']}/approve",
        json={"rarity": "SR", "content": "改過的題"},
        headers=auth(ta),
    )
    assert (
        r.json()["status"] == "active"
        and r.json()["rarity"] == "SR"
        and r.json()["content"] == "改過的題"
    )
    assert (
        client.post(f"/api/v1/gacha/cards/{bad['id']}/reject", headers=auth(ta)).json()["status"]
        == "archived"
    )
    assert (
        client.post(f"/api/v1/gacha/cards/{ok['id']}/approve", headers=auth(ta)).status_code == 409
    )

    s_ = client.get("/api/v1/gacha/settings", headers=auth(ta)).json()
    assert s_["pity_threshold"] == 6
    bad_settings = s_ | {"rarity_weights": {"SSR": 0.5, "SR": 0.5, "R": 0.5}}
    assert (
        client.put("/api/v1/gacha/settings", json=bad_settings, headers=auth(ta)).status_code == 422
    )
    new = s_ | {"rarity_weights": {"SSR": 0.1, "SR": 0.3, "R": 0.6}, "pity_threshold": 4}
    assert (
        client.put("/api/v1/gacha/settings", json=new, headers=auth(ta)).json()["pity_threshold"]
        == 4
    )

    _cards(client, ta)
    sim = client.post("/api/v1/gacha/simulate?n=5000", headers=auth(ta)).json()
    assert sim["n"] == 5000 and abs(sum(sim["rarity"].values()) - 1) < 1e-9


def test_streak(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    with Session(engine) as s:
        for period, st in [
            ("2026-01", "done"),
            ("2026-02", "failed"),
            ("2026-03", "done"),
            ("2026-04", "done"),
        ]:
            s.add(GachaDraw(period=period, status=st, rarity="R"))
        s.commit()
    assert client.get("/api/v1/gacha/current", headers=auth(ta)).json()["streak"] == 2
    assert USERS
