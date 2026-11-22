from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.db import engine
from app.models import Invitation
from app.services.calendar import InvalidTransition, check_transition
from tests.conftest import auth, login, me_id, subscribe_push

SLOTS = [
    {"start_at": "2099-12-05T19:00:00+08:00", "end_at": "2099-12-05T21:00:00+08:00"},
    {"start_at": "2099-12-06T12:00:00+08:00", "end_at": "2099-12-06T14:00:00+08:00"},
]
INV = {
    "title": "要一起吃晚餐嗎",
    "message": "我請客 💕",
    "location": "桃園",
    "proposed_slots": SLOTS,
}


def test_state_machine() -> None:
    check_transition("pending", "accepted")
    for cur, tgt in [("accepted", "declined"), ("declined", "accepted"), ("expired", "accepted")]:
        try:
            check_transition(cur, tgt)
            raise AssertionError("should fail")
        except InvalidTransition:
            pass


def test_send_and_accept_creates_shared_event(
    client: TestClient, setup_done: None, pushes: list[dict]
) -> None:
    ta, tb = login(client, 0), login(client, 1)
    subscribe_push(client, ta)
    subscribe_push(client, tb)
    a, b = me_id(client, ta), me_id(client, tb)

    inv = client.post("/api/v1/invitations", json=INV, headers=auth(ta)).json()
    assert inv["status"] == "pending" and inv["to_user"] == b
    assert any(p["user_id"] == b and "邀請函" in p["title"] for p in pushes)

    inbox = client.get("/api/v1/invitations?box=inbox", headers=auth(tb)).json()
    assert [i["id"] for i in inbox] == [inv["id"]]
    assert client.get("/api/v1/invitations?box=inbox", headers=auth(ta)).json() == []

    # 寄件人不能自己回覆
    r = client.post(
        f"/api/v1/invitations/{inv['id']}/respond", json={"action": "accept"}, headers=auth(ta)
    )
    assert r.status_code == 403

    r = client.post(
        f"/api/v1/invitations/{inv['id']}/respond",
        json={"action": "accept", "chosen_slot": 1},
        headers=auth(tb),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "accepted" and body["chosen_slot"] == 1 and body["event_id"]
    assert any(p["user_id"] == a and "答應" in p["title"] for p in pushes)

    params = {"from": "2099-12-01T00:00:00Z", "to": "2099-12-31T00:00:00Z"}
    for t in (ta, tb):  # 兩人的行事曆都立即出現
        occ = client.get("/api/v1/events", params=params, headers=auth(t)).json()
        assert len(occ) == 1
        assert occ[0]["event"]["owner_id"] is None and occ[0]["start"] == "2099-12-06T04:00:00Z"

    # 不能再回覆一次
    r = client.post(
        f"/api/v1/invitations/{inv['id']}/respond", json={"action": "decline"}, headers=auth(tb)
    )
    assert r.status_code == 409


def test_decline_and_counter(client: TestClient, setup_done: None) -> None:
    ta, tb = login(client, 0), login(client, 1)
    a = me_id(client, ta)
    inv = client.post("/api/v1/invitations", json=INV, headers=auth(ta)).json()
    r = client.post(
        f"/api/v1/invitations/{inv['id']}/respond",
        json={"action": "counter", "message": "週日比較好", "counter_slots": [SLOTS[1]]},
        headers=auth(tb),
    )
    assert r.json()["status"] == "countered"
    inbox_a = client.get("/api/v1/invitations?box=inbox", headers=auth(ta)).json()
    assert (
        len(inbox_a) == 1 and inbox_a[0]["reply_to_id"] == inv["id"] and inbox_a[0]["to_user"] == a
    )
    assert inbox_a[0]["message"] == "週日比較好"

    r = client.post(
        f"/api/v1/invitations/{inbox_a[0]['id']}/respond",
        json={"action": "decline"},
        headers=auth(ta),
    )
    assert r.json()["status"] == "declined"

    # counter 沒給時間 → 422
    inv2 = client.post("/api/v1/invitations", json=INV, headers=auth(ta)).json()
    r = client.post(
        f"/api/v1/invitations/{inv2['id']}/respond", json={"action": "counter"}, headers=auth(tb)
    )
    assert r.status_code == 422


def test_expired_and_cancel(client: TestClient, setup_done: None) -> None:
    ta, tb = login(client, 0), login(client, 1)
    past = [{"start_at": "2020-01-01T19:00:00+08:00", "end_at": "2020-01-01T20:00:00+08:00"}]
    inv = client.post(
        "/api/v1/invitations", json=INV | {"proposed_slots": past}, headers=auth(ta)
    ).json()
    inbox = client.get("/api/v1/invitations?box=inbox", headers=auth(tb)).json()
    assert inbox[0]["status"] == "expired"
    r = client.post(
        f"/api/v1/invitations/{inv['id']}/respond", json={"action": "accept"}, headers=auth(tb)
    )
    assert r.status_code == 409

    inv2 = client.post("/api/v1/invitations", json=INV, headers=auth(ta)).json()
    assert (
        client.post(f"/api/v1/invitations/{inv2['id']}/cancel", headers=auth(tb)).status_code == 404
    )
    assert (
        client.post(f"/api/v1/invitations/{inv2['id']}/cancel", headers=auth(ta)).json()["status"]
        == "expired"
    )
    with Session(engine) as s:
        assert s.get(Invitation, inv2["id"]).status == "expired"  # type: ignore[union-attr]


def test_invitation_validation(client: TestClient, setup_done: None) -> None:
    ta = login(client, 0)
    assert (
        client.post(
            "/api/v1/invitations", json=INV | {"proposed_slots": []}, headers=auth(ta)
        ).status_code
        == 422
    )
    four = INV | {"proposed_slots": SLOTS * 2}
    assert client.post("/api/v1/invitations", json=four, headers=auth(ta)).status_code == 422
