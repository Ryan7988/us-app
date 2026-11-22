import secrets

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.models import Event, User
from app.schemas.settings import IcsOut
from app.services.calendar import build_ics

router = APIRouter(tags=["ics"])


@router.get("/ics/link", response_model=IcsOut)
def ics_link(user: CurrentUser) -> IcsOut:
    return IcsOut(path=f"/api/v1/ics/{user.ics_token}.ics")


@router.post("/ics/link/rotate", response_model=IcsOut)
def rotate_ics(user: CurrentUser, session: SessionDep) -> IcsOut:
    user.ics_token = secrets.token_urlsafe(24)
    session.add(user)
    session.commit()
    return IcsOut(path=f"/api/v1/ics/{user.ics_token}.ics")


@router.get("/ics/{token}.ics", include_in_schema=False)
def ics_feed(token: str, session: SessionDep) -> Response:
    """行事曆訂閱：行事曆 App 無法帶 JWT，用隨機 token 驗證。內容含雙方與共同行程。"""
    user = session.exec(select(User).where(User.ics_token == token)).first()
    if user is None or len(token) < 16:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    users = session.exec(select(User)).all()
    names: dict[str | None, str] = {None: "💕 "}
    for u in users:
        names[u.id] = "" if u.id == user.id else f"[{u.display_name}] "
    events = session.exec(select(Event).where(col(Event.deleted_at).is_(None))).all()
    body = build_ics(events, "我們的行事曆", names)
    return Response(
        body,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "no-cache", "Content-Disposition": 'inline; filename="us.ics"'},
    )
