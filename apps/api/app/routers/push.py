from fastapi import APIRouter, Request, status
from sqlmodel import select

from app.core.deps import CurrentUser, SessionDep
from app.models import PushSubscription
from app.schemas.settings import PushSubscribeIn, PushTestOut, PushUnsubscribeIn
from app.services.push import PushMessage, send_to_users
from app.services.settings import ensure_vapid

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
def vapid_public_key(_: CurrentUser, session: SessionDep) -> dict[str, str]:
    pub, _pem = ensure_vapid(session)
    return {"key": pub}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    body: PushSubscribeIn, request: Request, user: CurrentUser, session: SessionDep
) -> None:
    sub = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if sub is None:
        sub = PushSubscription(
            endpoint=body.endpoint, user_id=user.id, p256dh=body.p256dh, auth=body.auth
        )
    sub.user_id, sub.p256dh, sub.auth = user.id, body.p256dh, body.auth
    sub.user_agent = request.headers.get("user-agent", "")[:300]
    session.add(sub)
    session.commit()


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(body: PushUnsubscribeIn, _: CurrentUser, session: SessionDep) -> None:
    sub = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if sub:
        session.delete(sub)
        session.commit()


@router.get("/status")
def push_status(user: CurrentUser, session: SessionDep) -> dict[str, int]:
    subs = session.exec(select(PushSubscription).where(PushSubscription.user_id == user.id)).all()
    return {"devices": len(subs)}


@router.post("/test", response_model=PushTestOut)
def test_push(user: CurrentUser) -> PushTestOut:
    stats = send_to_users(
        [user.id], PushMessage("🔔 推播測試", f"嗨 {user.display_name}，推播正常！", "/more")
    )
    return PushTestOut(**stats)
