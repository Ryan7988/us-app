from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import ensure_aware, utcnow
from app.models import Event, User
from app.schemas.calendar import EventIn, EventOut, EventPatch, OccurrenceOut, OwnerKind
from app.services import notify
from app.services.calendar import expand, validate_rrule
from app.services.people import partner_id

router = APIRouter(prefix="/events", tags=["events"])


def _owner_id(session: SessionDep, user: User, owner: OwnerKind) -> str | None:
    if owner == "shared":
        return None
    if owner == "me":
        return user.id
    return partner_id(session, user.id)


def _check_rrule(rule: str | None) -> str | None:
    if not rule:
        return None
    rule = rule.strip().removeprefix("RRULE:")
    try:
        validate_rrule(rule)
    except (ValueError, TypeError) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "重複規則格式不正確") from e
    return rule


def _get(session: SessionDep, event_id: str) -> Event:
    ev = session.get(Event, event_id)
    if ev is None or ev.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個行程")
    return ev


@router.get("", response_model=list[OccurrenceOut])
def list_events(
    _: CurrentUser,
    session: SessionDep,
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
):
    """回傳區間內的每一次行程（後端展開重複規則）。"""
    start, end = ensure_aware(from_), ensure_aware(to)
    if end <= start or end - start > timedelta(days=400):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "時間區間不正確")
    events = session.exec(
        select(Event).where(
            col(Event.deleted_at).is_(None),
            (col(Event.rrule).is_not(None)) | (col(Event.start_at) < end),
        )
    ).all()
    return [
        OccurrenceOut(
            event=EventOut.model_validate(o.event, from_attributes=True), start=o.start, end=o.end
        )
        for o in expand(events, start, end)
    ]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks):
    ev = Event(
        title=body.title,
        note=body.note,
        location=body.location,
        start_at=ensure_aware(body.start_at),
        end_at=ensure_aware(body.end_at),
        all_day=body.all_day,
        owner_id=_owner_id(session, user, body.owner),
        rrule=_check_rrule(body.rrule),
        remind_minutes=body.remind_minutes,
        created_by=user.id,
    )
    session.add(ev)
    session.commit()
    session.refresh(ev)
    notify.ws(bg, "event.changed", {"id": ev.id, "action": "created", "by": user.id})
    return ev


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: str, body: EventPatch, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
):
    ev = _get(session, event_id)
    data = body.model_dump(exclude_unset=True)
    if "owner" in data:
        ev.owner_id = _owner_id(session, user, data.pop("owner"))
    if "rrule" in data:
        ev.rrule = _check_rrule(data.pop("rrule"))
    for k in ("start_at", "end_at"):
        if data.get(k) is not None:
            data[k] = ensure_aware(data[k])
    for k, v in data.items():
        setattr(ev, k, v)
    if ev.end_at < ev.start_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "結束時間不能早於開始時間")
    ev.updated_at = utcnow()
    session.add(ev)
    session.commit()
    session.refresh(ev)
    notify.ws(bg, "event.changed", {"id": ev.id, "action": "updated", "by": user.id})
    return ev


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
) -> None:
    ev = _get(session, event_id)
    ev.deleted_at = utcnow()
    session.add(ev)
    session.commit()
    notify.ws(bg, "event.changed", {"id": ev.id, "action": "deleted", "by": user.id})
