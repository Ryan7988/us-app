from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.models import Event
from app.services.calendar import expand
from tests.conftest import auth, login, me_id

RANGE = {"from": "2026-12-01T00:00:00+08:00", "to": "2027-01-01T00:00:00+08:00"}


def _ev(**kw):  # type: ignore[no-untyped-def]
    base = dict(id="e", title="t", created_by="u", all_day=False)
    return Event(**(base | kw))


def test_expand_weekly_keeps_local_time() -> None:
    ev = _ev(
        start_at=datetime(2026, 12, 1, 11, 0, tzinfo=UTC),  # 台北 19:00
        end_at=datetime(2026, 12, 1, 13, 0, tzinfo=UTC),
        rrule="FREQ=WEEKLY",
    )
    occ = expand([ev], datetime(2026, 12, 1, tzinfo=UTC), datetime(2026, 12, 31, tzinfo=UTC))
    assert [o.start.day for o in occ] == [1, 8, 15, 22, 29]
    assert all(o.start.hour == 11 and o.end - o.start == ev.end_at - ev.start_at for o in occ)


def test_expand_yearly_and_overlap() -> None:
    bday = _ev(
        start_at=datetime(2020, 12, 24, 16, 0, tzinfo=UTC),
        end_at=datetime(2020, 12, 25, 16, 0, tzinfo=UTC),
        all_day=True,
        rrule="FREQ=YEARLY",
    )
    occ = expand([bday], datetime(2026, 12, 25, 0, tzinfo=UTC), datetime(2026, 12, 26, tzinfo=UTC))
    assert len(occ) == 1 and occ[0].start.year == 2026  # 跨日的行程只要有重疊就算


def test_event_crud_and_owner(client: TestClient, setup_done: None) -> None:
    ta, tb = login(client, 0), login(client, 1)
    a, b = me_id(client, ta), me_id(client, tb)
    body = {
        "title": "晚餐",
        "start_at": "2026-12-05T19:00:00+08:00",
        "end_at": "2026-12-05T21:00:00+08:00",
    }
    r_me = client.post("/api/v1/events", json=body | {"owner": "me"}, headers=auth(ta)).json()
    r_p = client.post("/api/v1/events", json=body | {"owner": "partner"}, headers=auth(ta)).json()
    r_s = client.post("/api/v1/events", json=body | {"owner": "shared"}, headers=auth(ta)).json()
    assert (r_me["owner_id"], r_p["owner_id"], r_s["owner_id"]) == (a, b, None)
    assert r_me["start_at"] == "2026-12-05T11:00:00Z"

    occ = client.get("/api/v1/events", params=RANGE, headers=auth(tb)).json()
    assert len(occ) == 3

    r = client.patch(
        f"/api/v1/events/{r_me['id']}",
        json={"title": "改成午餐", "owner": "shared"},
        headers=auth(tb),
    )
    assert r.json()["title"] == "改成午餐" and r.json()["owner_id"] is None
    assert client.delete(f"/api/v1/events/{r_p['id']}", headers=auth(ta)).status_code == 204
    assert len(client.get("/api/v1/events", params=RANGE, headers=auth(ta)).json()) == 2


def test_recurring_event_api(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    client.post(
        "/api/v1/events",
        json={
            "title": "紀念日",
            "start_at": "2025-12-10T00:00:00+08:00",
            "end_at": "2025-12-11T00:00:00+08:00",
            "all_day": True,
            "owner": "shared",
            "rrule": "RRULE:FREQ=YEARLY",
        },
        headers=auth(t),
    )
    occ = client.get("/api/v1/events", params=RANGE, headers=auth(t)).json()
    assert len(occ) == 1 and occ[0]["start"] == "2026-12-09T16:00:00Z"
    assert occ[0]["event"]["rrule"] == "FREQ=YEARLY"


def test_event_validation(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    bad = {
        "title": "x",
        "start_at": "2026-12-05T19:00:00+08:00",
        "end_at": "2026-12-05T18:00:00+08:00",
    }
    assert client.post("/api/v1/events", json=bad, headers=auth(t)).status_code == 422
    ok = bad | {"end_at": "2026-12-05T20:00:00+08:00", "rrule": "FREQ=NOPE"}
    assert client.post("/api/v1/events", json=ok, headers=auth(t)).status_code == 422
    params = {"from": "2026-12-02T00:00:00Z", "to": "2026-12-01T00:00:00Z"}
    assert client.get("/api/v1/events", params=params, headers=auth(t)).status_code == 422


def test_ics_feed(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    client.post(
        "/api/v1/events",
        json={
            "title": "一起看電影, 好嗎; 要早點到",
            "start_at": "2026-12-05T19:00:00+08:00",
            "end_at": "2026-12-05T21:00:00+08:00",
            "owner": "shared",
            "remind_minutes": 30,
            "rrule": "FREQ=WEEKLY;COUNT=3",
        },
        headers=auth(t),
    )
    path = client.get("/api/v1/ics/link", headers=auth(t)).json()["path"]
    r = client.get(path)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert "BEGIN:VCALENDAR" in body and "DTSTART:20261205T110000Z" in body
    assert "RRULE:FREQ=WEEKLY;COUNT=3" in body and "TRIGGER:-PT30M" in body
    unfolded = body.replace("\r\n ", "")
    assert r"一起看電影\, 好嗎\; 要早點到" in unfolded
    # 重新產生後舊連結失效
    new = client.post("/api/v1/ics/link/rotate", headers=auth(t)).json()["path"]
    assert (
        new != path and client.get(path).status_code == 404 and client.get(new).status_code == 200
    )
    assert client.get("/api/v1/ics/nope.ics").status_code == 404
