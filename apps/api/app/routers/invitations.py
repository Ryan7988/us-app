from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlmodel import col, or_, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import ensure_aware, utcnow
from app.models import Event, Invitation
from app.schemas.calendar import InvitationIn, InvitationOut, InvitationRespond, Slot
from app.services import notify
from app.services.calendar import InvalidTransition, check_transition, invitation_expiry
from app.services.people import partner_of
from app.services.push import PushMessage

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _slots_json(slots: list[Slot]) -> list[dict[str, str]]:
    return [
        {
            "start_at": ensure_aware(s.start_at).isoformat(),
            "end_at": ensure_aware(s.end_at).isoformat(),
        }
        for s in slots
    ]


def expire_overdue(session: SessionDep) -> int:
    """把已過期但還是 pending 的邀請標為 expired（讀取時與每日排程都會呼叫）。"""
    now = utcnow()
    rows = session.exec(
        select(Invitation).where(Invitation.status == "pending", col(Invitation.expires_at) < now)
    ).all()
    for inv in rows:
        inv.status = "expired"
        inv.updated_at = now
        session.add(inv)
    if rows:
        session.commit()
    return len(rows)


def _create(
    session: SessionDep, from_user: str, to_user: str, body: InvitationIn, reply_to: str | None
) -> Invitation:
    slots = _slots_json(body.proposed_slots)
    now = utcnow()
    inv = Invitation(
        from_user=from_user,
        to_user=to_user,
        title=body.title,
        message=body.message,
        location=body.location,
        proposed_slots=slots,
        theme=body.theme,
        reply_to_id=reply_to,
        expires_at=invitation_expiry(slots, now),
    )
    session.add(inv)
    return inv


@router.get("", response_model=list[InvitationOut])
def list_invitations(
    user: CurrentUser, session: SessionDep, box: Literal["inbox", "sent", "all"] = "all"
):
    expire_overdue(session)
    q = select(Invitation)
    if box == "inbox":
        q = q.where(Invitation.to_user == user.id)
    elif box == "sent":
        q = q.where(Invitation.from_user == user.id)
    else:
        q = q.where(or_(Invitation.to_user == user.id, Invitation.from_user == user.id))
    return session.exec(q.order_by(col(Invitation.created_at).desc()).limit(100)).all()


@router.post("", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
def send_invitation(
    body: InvitationIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
):
    partner = partner_of(session, user.id)
    if partner is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "還沒有另一個帳號")
    inv = _create(session, user.id, partner.id, body, None)
    session.commit()
    session.refresh(inv)
    notify.ws(bg, "invitation.received", {"id": inv.id, "to": partner.id})
    notify.push(
        bg,
        [partner.id],
        PushMessage(
            f"💌 {user.display_name} 寄了一封邀請函",
            inv.title,
            f"/calendar/invitations/{inv.id}",
            tag=f"inv-{inv.id}",
        ),
    )
    return inv


@router.post("/{inv_id}/respond", response_model=InvitationOut)
def respond(
    inv_id: str,
    body: InvitationRespond,
    user: CurrentUser,
    session: SessionDep,
    bg: BackgroundTasks,
):
    expire_overdue(session)
    inv = session.get(Invitation, inv_id)
    if inv is None or user.id not in (inv.to_user, inv.from_user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這封邀請函")
    if inv.to_user != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只有收件人可以回覆")
    target = {"accept": "accepted", "decline": "declined", "counter": "countered"}[body.action]
    try:
        check_transition(inv.status, target)
    except InvalidTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

    now = utcnow()
    inv.status = target
    inv.responded_at = now
    inv.response_message = body.message
    inv.updated_at = now
    labels = {"accepted": "答應了 💕", "declined": "婉拒了", "countered": "提議了其他時間"}

    if target == "accepted":
        idx = body.chosen_slot if body.chosen_slot is not None else 0
        if idx >= len(inv.proposed_slots):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "沒有這個候選時間")
        slot = inv.proposed_slots[idx]
        ev = Event(
            title=inv.title,
            note=inv.message,
            location=inv.location,
            start_at=datetime.fromisoformat(slot["start_at"]),
            end_at=datetime.fromisoformat(slot["end_at"]),
            owner_id=None,  # 共同行程
            remind_minutes=60,
            source_invitation_id=inv.id,
            created_by=inv.from_user,
        )
        session.add(ev)
        session.flush()
        inv.chosen_slot = idx
        inv.event_id = ev.id
        notify.ws(bg, "event.changed", {"id": ev.id, "action": "created", "by": user.id})
    elif target == "countered":
        if not body.counter_slots:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "請提供其他時間")
        reply = InvitationIn(
            title=inv.title,
            message=body.message or inv.message,
            location=inv.location,
            proposed_slots=body.counter_slots,
            theme=inv.theme,
        )
        new_inv = _create(session, user.id, inv.from_user, reply, inv.id)
        session.flush()
        notify.ws(bg, "invitation.received", {"id": new_inv.id, "to": inv.from_user})

    session.add(inv)
    session.commit()
    session.refresh(inv)
    notify.ws(bg, "invitation.responded", {"id": inv.id, "status": inv.status})
    notify.push(
        bg,
        [inv.from_user],
        PushMessage(
            f"{user.display_name} {labels[target]}",
            inv.title,
            "/calendar/invitations",
            tag=f"inv-{inv.id}",
        ),
    )
    return inv


@router.post("/{inv_id}/cancel", response_model=InvitationOut)
def cancel(inv_id: str, user: CurrentUser, session: SessionDep, bg: BackgroundTasks):
    """寄件人收回還沒回覆的邀請（視為過期）。"""
    inv = session.get(Invitation, inv_id)
    if inv is None or inv.from_user != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這封邀請函")
    try:
        check_transition(inv.status, "expired")
    except InvalidTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    inv.status = "expired"
    inv.updated_at = utcnow()
    session.add(inv)
    session.commit()
    session.refresh(inv)
    notify.ws(bg, "invitation.responded", {"id": inv.id, "status": inv.status})
    return inv
