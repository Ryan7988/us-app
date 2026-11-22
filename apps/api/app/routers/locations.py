from fastapi import APIRouter, BackgroundTasks, status
from sqlmodel import col, delete, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import Location, User
from app.schemas.location import LatestOut, LocationIn, LocationOut, SharingIn
from app.services import notify
from app.services.people import partner_id
from app.services.push import PushMessage

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def post_location(body: LocationIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks):
    """自動更新（打開 App 時）或「報平安」。報平安一定會推播給對方。"""
    if body.kind == "auto" and not user.location_sharing:
        # 沒開分享就不記錄自動位置
        return LocationOut(
            user_id=user.id,
            lat=body.lat,
            lng=body.lng,
            accuracy_m=body.accuracy_m,
            kind="auto",
            message=None,
            recorded_at=utcnow(),
        )
    loc = Location(user_id=user.id, **body.model_dump())
    session.add(loc)
    session.commit()
    session.refresh(loc)
    notify.ws(bg, "location.updated", {"user_id": user.id, "kind": loc.kind})
    if loc.kind == "checkin":
        notify.push(
            bg,
            [partner_id(session, user.id)],
            PushMessage(
                f"📍 {user.display_name} 報平安",
                loc.message or "我很好 💕",
                "/more/location",
                tag="checkin",
            ),
        )
    return loc


def _latest(session: SessionDep, user_id: str, kind: str | None = None) -> Location | None:
    q = select(Location).where(Location.user_id == user_id)
    if kind:
        q = q.where(Location.kind == kind)
    return session.exec(q.order_by(col(Location.recorded_at).desc())).first()


@router.get("/latest", response_model=list[LatestOut])
def latest(user: CurrentUser, session: SessionDep) -> list[LatestOut]:
    """雙方最後位置。對方關閉分享時看不到自動位置，但報平安（主動送出的）仍看得到。"""
    out = []
    for u in session.exec(select(User).order_by(col(User.created_at))).all():
        visible = u.id == user.id or u.location_sharing
        loc = _latest(session, u.id) if visible else None
        checkin = _latest(session, u.id, "checkin")
        out.append(
            LatestOut(
                user_id=u.id,
                sharing=u.location_sharing,
                location=LocationOut.model_validate(loc, from_attributes=True) if loc else None,
                last_checkin=LocationOut.model_validate(checkin, from_attributes=True)
                if checkin
                else None,
            )
        )
    return out


@router.put("/sharing", response_model=SharingIn)
def set_sharing(
    body: SharingIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
) -> SharingIn:
    user.location_sharing = body.enabled
    session.add(user)
    session.commit()
    notify.ws(bg, "location.updated", {"user_id": user.id, "sharing": body.enabled})
    return body


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(user: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> None:
    """一鍵清除自己的位置紀錄。"""
    session.exec(delete(Location).where(col(Location.user_id) == user.id))  # type: ignore[call-overload]
    session.commit()
    notify.ws(bg, "location.updated", {"user_id": user.id, "cleared": True})
