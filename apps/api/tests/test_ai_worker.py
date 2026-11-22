import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import worker
from app.core.db import engine
from app.core.time import current_period, utcnow
from app.models import Event, GachaCard, GachaDraw, Invitation, Location, ReminderLog
from app.services import ai
from tests.conftest import login, me_id, subscribe_push

GOOD = json.dumps(
    {
        "cards": [
            {"content": "一起去看一場沒看過的展覽", "rarity": "SR", "reason": "需要半天"},
            {"content": "交換寫一封給一年後對方的信", "rarity": "R", "reason": "免費"},
            {"content": "一起去看一場沒看過的展覽！", "rarity": "SR", "reason": "重複"},
        ]
    }
)


def fake_embed(texts: list[str]) -> list[list[float]]:
    # 「展覽」相關的向量都很像，其他不像
    return [[1.0, 0.0] if "展覽" in t else [0.0, 1.0] for t in texts]


def test_generate_cards_validates_and_dedupes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai, "_chat", lambda prompt: GOOD)
    monkeypatch.setattr(ai, "embed", fake_embed)
    with Session(engine) as s:
        cards = ai.generate_cards(s, 3)
        assert [c.content for c in cards] == [
            "一起去看一場沒看過的展覽",
            "交換寫一封給一年後對方的信",
        ]
        assert all(c.status == "pending_review" and c.source == "ai" for c in cards)
        again = ai.generate_cards(s, 3)  # 第二次全部和既有卡片太像 → 丟棄
        assert again == []


def test_generate_retries_then_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def bad(prompt: str) -> str:
        calls.append(1)
        return '{"cards": [{"content": "x", "rarity": "UR"}]}'

    monkeypatch.setattr(ai, "_chat", bad)
    with Session(engine) as s, pytest.raises(ai.AIUnavailable):
        ai.generate_cards(s, 3)
    assert len(calls) == 3


def test_prompt_contains_existing_and_wishes() -> None:
    p = ai.build_prompt(5, ["一起煮飯"], ["去日本"])
    assert "5 張" in p and "一起煮飯" in p and "去日本" in p
    assert ai.cosine([1, 0], [1, 0]) == 1 and ai.cosine([1, 0], [0, 1]) == 0


def test_reminders_sent_once(client: TestClient, setup_done: None, pushes: list[dict]) -> None:
    ta = login(client, 0)
    a = me_id(client, ta)
    subscribe_push(client, ta)
    with Session(engine) as s:
        s.add(
            Event(
                title="看電影",
                start_at=utcnow() + timedelta(minutes=29),
                end_at=utcnow() + timedelta(hours=2),
                owner_id=a,
                remind_minutes=30,
                created_by=a,
            )
        )
        s.add(
            Event(
                title="還很久",
                start_at=utcnow() + timedelta(days=3),
                end_at=utcnow() + timedelta(days=3, hours=1),
                owner_id=None,
                remind_minutes=30,
                created_by=a,
            )
        )
        s.commit()
    worker.send_reminders()
    worker.send_reminders()
    titles = [p["title"] for p in pushes]
    assert titles == ["⏰ 30 分鐘後：看電影"]
    with Session(engine) as s:
        assert len(s.exec(select(ReminderLog)).all()) == 1


def test_gacha_lifecycle_jobs(client: TestClient, setup_done: None, pushes: list[dict]) -> None:
    ta = login(client, 0)
    subscribe_push(client, ta)
    worker.gacha_open()
    assert any("開放" in p["title"] for p in pushes)
    worker.gacha_remind_draw()
    assert any("還沒抽" in p["title"] for p in pushes)
    with Session(engine) as s:
        card = GachaCard(content="爬山", rarity="R", status="drawn")
        s.add(card)
        s.flush()
        d = s.exec(select(GachaDraw).where(GachaDraw.period == current_period())).one()
        d.status, d.card_id, d.rarity = "drawn", card.id, "R"
        s.add(d)
        s.commit()
        card_id = card.id
    worker.gacha_remind_finish()
    assert any("只剩" in p["title"] for p in pushes)
    worker.gacha_settle()
    with Session(engine) as s:
        assert s.exec(select(GachaDraw)).one().status == "failed"
        assert s.get(GachaCard, card_id).status == "active"  # type: ignore[union-attr]  # 給第二次機會


def test_daily_cleanup_and_heartbeat(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    a = me_id(client, ta)
    with Session(engine) as s:
        s.add(Location(user_id=a, lat=1, lng=1, recorded_at=utcnow() - timedelta(days=31)))
        s.add(Location(user_id=a, lat=1, lng=1))
        s.add(
            Invitation(from_user=a, to_user=a, title="x", expires_at=utcnow() - timedelta(hours=1))
        )
        s.commit()
    worker.daily_cleanup()
    worker.heartbeat()
    with Session(engine) as s:
        assert len(s.exec(select(Location)).all()) == 1
        assert s.exec(select(Invitation)).one().status == "expired"
    from app.services.settings import get_app_settings

    with Session(engine) as s:
        st = get_app_settings(s)
        assert st.worker_heartbeat_at is not None and st.job_runs["daily_cleanup"]["ok"]


def test_backup_watch_alerts(client: TestClient, setup_done: None, pushes: list[dict]) -> None:
    ta = login(client, 0)
    subscribe_push(client, ta)
    worker.backup_watch()  # 沒有任何備份紀錄
    assert any("伺服器需要注意" in p["title"] for p in pushes)


def test_scheduler_builds() -> None:
    ids = {j.id for j in worker.build_scheduler().get_jobs()}
    assert {"reminders", "gacha_open", "gacha_settle", "ai_refill", "backup_watch"} <= ids
