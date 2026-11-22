from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import WishItem
from app.realtime.manager import manager
from app.schemas.wish import WishComplete, WishCreate, WishOut, WishUpdate

router = APIRouter(prefix="/wishes", tags=["wishes"])


def _get_or_404(session: SessionDep, wish_id: str) -> WishItem:
    wish = session.get(WishItem, wish_id)
    if wish is None or wish.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個願望")
    return wish


def _notify(bg: BackgroundTasks, action: str, wish: WishItem, by: str) -> None:
    bg.add_task(manager.broadcast, "wish.changed", {"id": wish.id, "action": action, "by": by})


@router.get("", response_model=list[WishOut])
def list_wishes(
    _: CurrentUser,
    session: SessionDep,
    status_filter: Literal["all", "open", "done"] = "all",
    category: str | None = None,
):
    q = select(WishItem).where(col(WishItem.deleted_at).is_(None))
    if status_filter == "open":
        q = q.where(col(WishItem.done_at).is_(None))
    elif status_filter == "done":
        q = q.where(col(WishItem.done_at).is_not(None))
    if category:
        q = q.where(WishItem.category == category)
    return session.exec(q.order_by(col(WishItem.created_at).desc())).all()


@router.post("", response_model=WishOut, status_code=status.HTTP_201_CREATED)
def create_wish(body: WishCreate, user: CurrentUser, session: SessionDep, bg: BackgroundTasks):
    wish = WishItem(
        title=body.title,
        note=body.note,
        url=str(body.url) if body.url else None,
        category=body.category or None,
        created_by=user.id,
    )
    session.add(wish)
    session.commit()
    session.refresh(wish)
    _notify(bg, "created", wish, user.id)
    # TODO(P2): 推播通知對方
    return wish


@router.patch("/{wish_id}", response_model=WishOut)
def update_wish(
    wish_id: str, body: WishUpdate, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
):
    wish = _get_or_404(session, wish_id)
    data = body.model_dump(exclude_unset=True)
    if "url" in data:
        data["url"] = str(data["url"]) if data["url"] else None
    for k, v in data.items():
        setattr(wish, k, v)
    wish.updated_at = utcnow()
    session.add(wish)
    session.commit()
    session.refresh(wish)
    _notify(bg, "updated", wish, user.id)
    return wish


@router.delete("/{wish_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wish(wish_id: str, user: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> None:
    wish = _get_or_404(session, wish_id)
    wish.deleted_at = utcnow()  # 軟刪除，誤刪可救回
    session.add(wish)
    session.commit()
    _notify(bg, "deleted", wish, user.id)


@router.post("/{wish_id}/complete", response_model=WishOut)
def complete_wish(
    wish_id: str,
    body: WishComplete,
    user: CurrentUser,
    session: SessionDep,
    bg: BackgroundTasks,
):
    wish = _get_or_404(session, wish_id)
    if body.done:
        wish.done_at = utcnow()
        wish.done_by = user.id
    else:
        wish.done_at = None
        wish.done_by = None
    wish.updated_at = utcnow()
    session.add(wish)
    session.commit()
    session.refresh(wish)
    _notify(bg, "completed" if body.done else "reopened", wish, user.id)
    # TODO(P4): 完成時附照片，自動進相簿
    return wish
