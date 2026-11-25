from collections import Counter
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import update
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import GachaCard, GachaDraw, Photo, PhotoLink, User
from app.schemas.gacha import (
    CardIn,
    CardOut,
    CardPatch,
    CompleteIn,
    CurrentOut,
    DrawOut,
    GachaSettingsIO,
    RerollRequestIn,
    RerollRespondIn,
    SimulateOut,
)
from app.services import notify
from app.services.gacha import (
    EmptyPoolError,
    RerollError,
    active_pool,
    draw_lock,
    excluded_this_period,
    get_or_create_current,
    history_rarities,
    misses_since_last_ssr,
    perform_draw,
    reroll,
    rerolls_left,
    simulate,
    streak,
)
from app.services.media import thumb_url
from app.services.people import partner_id
from app.services.push import PushMessage
from app.services.settings import get_gacha_settings

router = APIRouter(prefix="/gacha", tags=["gacha"])


def _draw_out(session: SessionDep, d: GachaDraw) -> DrawOut:
    out = DrawOut.model_validate(d, from_attributes=True)
    out.rerolls_left = rerolls_left(d, get_gacha_settings(session))
    if d.proof_photo_id:
        p = session.get(Photo, d.proof_photo_id)
        out.proof_thumb_url = thumb_url(p) if p else None
    return out


def _card(session: SessionDep, card_id: str) -> GachaCard:
    c = session.get(GachaCard, card_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這張卡")
    return c


# ---- 卡池 ----
@router.get("/cards", response_model=list[CardOut])
def list_cards(
    _: CurrentUser,
    session: SessionDep,
    status_filter: Literal["active", "pending_review", "drawn", "archived", "all"] = "all",
):
    q = select(GachaCard)
    if status_filter != "all":
        q = q.where(GachaCard.status == status_filter)
    return session.exec(q.order_by(col(GachaCard.created_at).desc())).all()


@router.post("/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(body: CardIn, user: CurrentUser, session: SessionDep) -> GachaCard:
    c = GachaCard(
        content=body.content.strip(),
        rarity=body.rarity,
        repeatable=body.repeatable,
        source="custom",
        status="active",
        created_by=user.id,
        approved_by=user.id,
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card(card_id: str, body: CardPatch, _: CurrentUser, session: SessionDep) -> GachaCard:
    c = _card(session, card_id)
    for k, v in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(c, k, v)
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.post("/cards/{card_id}/approve", response_model=CardOut)
def approve_card(
    card_id: str, user: CurrentUser, session: SessionDep, body: CardPatch | None = None
):
    """AI 卡審核通過（可同時修改文字與稀有度），任一人通過就進卡池。"""
    c = _card(session, card_id)
    if c.status != "pending_review":
        raise HTTPException(status.HTTP_409_CONFLICT, "這張卡不需要審核")
    if body:
        for k, v in body.model_dump(
            exclude_unset=True, exclude_none=True, exclude={"status"}
        ).items():
            setattr(c, k, v)
    c.status = "active"
    c.approved_by = user.id
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.post("/cards/{card_id}/reject", response_model=CardOut)
def reject_card(card_id: str, _: CurrentUser, session: SessionDep) -> GachaCard:
    c = _card(session, card_id)
    if c.status != "pending_review":
        raise HTTPException(status.HTTP_409_CONFLICT, "這張卡不需要審核")
    c.status = "archived"
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


# ---- 本月 ----
@router.get("/current", response_model=CurrentOut)
def current(_: CurrentUser, session: SessionDep) -> CurrentOut:
    d = get_or_create_current(session)
    settings = get_gacha_settings(session)
    pool = active_pool(session)
    pending = session.exec(select(GachaCard).where(GachaCard.status == "pending_review")).all()
    return CurrentOut(
        draw=_draw_out(session, d),
        streak=streak(session),
        # 已開獎的本月也算進去（顯示「再幾次必中」要包含這次）
        misses_since_ssr=misses_since_last_ssr(history_rarities(session)),
        pity_threshold=settings.pity_threshold,
        pool_counts=dict(Counter(c.rarity for c in pool)),
        pending_review=len(pending),
    )


@router.post("/current/ready", response_model=DrawOut)
def ready(user: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> DrawOut:
    """兩人都按下「準備好了」才開獎。整段在同一把鎖內，每月只會抽一次。"""
    with draw_lock:
        d = get_or_create_current(session)
        session.refresh(d)
        if d.status != "waiting":
            return _draw_out(session, d)
        if user.id not in d.ready_users:
            d.ready_users = [*d.ready_users, user.id]
            session.add(d)
            session.commit()
            session.refresh(d)
        n_users = len(session.exec(select(User.id)).all())
        if len(set(d.ready_users)) < n_users:
            notify.ws(bg, "gacha.ready", {"user_id": user.id})
            notify.push(
                bg,
                [partner_id(session, user.id)],
                PushMessage(
                    f"🎰 {user.display_name} 準備好抽扭蛋了！",
                    "就等你了",
                    "/gacha",
                    tag="gacha-ready",
                ),
            )
            return _draw_out(session, d)

        # 資料庫層保護：只有 status 仍是 waiting 時才能搶到抽卡權
        claimed = session.execute(
            update(GachaDraw)
            .where(col(GachaDraw.id) == d.id, col(GachaDraw.status) == "waiting")
            .values(status="drawing")
        )
        session.commit()
        if claimed.rowcount != 1:  # type: ignore[attr-defined]
            session.refresh(d)
            return _draw_out(session, d)
        session.refresh(d)
        try:
            d = perform_draw(
                session, d, get_gacha_settings(session), exclude=excluded_this_period(d)
            )
        except EmptyPoolError as e:
            d.status = "waiting"
            session.add(d)
            session.commit()
            raise HTTPException(status.HTTP_409_CONFLICT, "卡池是空的，先去新增幾張卡吧") from e

    notify.ws(bg, "gacha.drawn", {"id": d.id, "rarity": d.rarity})
    notify.push(
        bg,
        [*session.exec(select(User.id)).all()],
        PushMessage(
            f"🎉 本月扭蛋開出 {d.rarity}！", d.card_content or "", "/gacha", tag="gacha-drawn"
        ),
    )
    return _draw_out(session, d)


@router.post("/current/unready", response_model=DrawOut)
def unready(user: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> DrawOut:
    with draw_lock:
        d = get_or_create_current(session)
        if d.status == "waiting" and user.id in d.ready_users:
            d.ready_users = [u for u in d.ready_users if u != user.id]
            session.add(d)
            session.commit()
            session.refresh(d)
            notify.ws(bg, "gacha.ready", {"user_id": user.id, "ready": False})
    return _draw_out(session, d)


@router.post("/current/complete", response_model=DrawOut)
def complete(
    body: CompleteIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
) -> DrawOut:
    """上傳一張照片作為證明（照片自動在相簿裡，並關聯到這次扭蛋）。"""
    d = get_or_create_current(session)
    if d.status != "drawn":
        raise HTTPException(status.HTTP_409_CONFLICT, "這個月還沒抽卡，或已經完成了")
    photo = session.get(Photo, body.photo_id)
    if photo is None or photo.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到照片")
    now = utcnow()
    d.status = "done"
    d.reroll_requested_by = None
    d.reroll_reason = None
    d.proof_photo_id = photo.id
    d.completed_at = now
    d.updated_at = now
    session.add(d)
    if session.get(PhotoLink, (photo.id, "draw", d.id)) is None:
        session.add(PhotoLink(photo_id=photo.id, ref_type="draw", ref_id=d.id))
    session.commit()
    session.refresh(d)
    notify.ws(bg, "gacha.drawn", {"id": d.id, "status": "done"})
    notify.push(
        bg,
        [partner_id(session, user.id)],
        PushMessage(
            f"🏆 {user.display_name} 上傳了本月任務的證明！", d.card_content or "", "/gacha"
        ),
    )
    return _draw_out(session, d)


# ---- 重抽（雙方都同意才會重抽）----
@router.post("/current/reroll/request", response_model=DrawOut)
def request_reroll(
    body: RerollRequestIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
) -> DrawOut:
    """提議重抽：對方按同意才會真的重抽。"""
    with draw_lock:
        d = get_or_create_current(session)
        settings = get_gacha_settings(session)
        if d.status != "drawn":
            raise HTTPException(status.HTTP_409_CONFLICT, "只有「已開獎、還沒完成」的任務可以重抽")
        if rerolls_left(d, settings) <= 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "這個月的重抽次數用完了")
        if d.reroll_requested_by and d.reroll_requested_by != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "對方已經提議重抽了，直接按同意就好")
        d.reroll_requested_by = user.id
        d.reroll_reason = (body.reason or "").strip() or None
        d.updated_at = utcnow()
        session.add(d)
        session.commit()
        session.refresh(d)
    notify.ws(bg, "gacha.reroll", {"action": "requested", "by": user.id})
    notify.push(
        bg,
        [partner_id(session, user.id)],
        PushMessage(
            f"🔄 {user.display_name} 想重抽這個月的扭蛋",
            d.reroll_reason or "打開 App 決定要不要同意",
            "/gacha",
            tag="gacha-reroll",
        ),
    )
    return _draw_out(session, d)


@router.post("/current/reroll/respond", response_model=DrawOut)
def respond_reroll(
    body: RerollRespondIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks
) -> DrawOut:
    """另一方同意 → 清空這次結果、回到等待開獎（兩人再各自按準備）；不同意 → 維持原本的卡。"""
    with draw_lock:
        d = get_or_create_current(session)
        if not d.reroll_requested_by:
            raise HTTPException(status.HTTP_409_CONFLICT, "沒有人提議重抽")
        if d.reroll_requested_by == user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "要由對方同意才行")
        requester = d.reroll_requested_by
        if not body.accept:
            d.reroll_requested_by = None
            d.reroll_reason = None
            d.updated_at = utcnow()
            session.add(d)
            session.commit()
            session.refresh(d)
            notify.ws(bg, "gacha.reroll", {"action": "declined", "by": user.id})
            notify.push(
                bg,
                [requester],
                PushMessage(f"{user.display_name} 想維持這張卡 💪", d.card_content or "", "/gacha"),
            )
            return _draw_out(session, d)
        try:
            d = reroll(session, d, get_gacha_settings(session), agreed_by=user.id)
        except (RerollError, EmptyPoolError) as e:
            session.rollback()
            msg = str(e) if isinstance(e, RerollError) else "卡池裡沒有其他卡可以抽了"
            raise HTTPException(status.HTTP_409_CONFLICT, msg) from e
    notify.ws(bg, "gacha.reroll", {"action": "accepted", "by": user.id})
    notify.push(
        bg,
        [*session.exec(select(User.id)).all()],
        PushMessage(
            "🔄 重抽成立！", "兩個人都按「準備好了」就重新開獎", "/gacha", tag="gacha-reroll"
        ),
    )
    return _draw_out(session, d)


@router.post("/current/reroll/cancel", response_model=DrawOut)
def cancel_reroll(user: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> DrawOut:
    with draw_lock:
        d = get_or_create_current(session)
        if d.reroll_requested_by == user.id:
            d.reroll_requested_by = None
            d.reroll_reason = None
            session.add(d)
            session.commit()
            session.refresh(d)
            notify.ws(bg, "gacha.reroll", {"action": "cancelled", "by": user.id})
    return _draw_out(session, d)


@router.get("/history", response_model=list[DrawOut])
def history(_: CurrentUser, session: SessionDep):
    draws = session.exec(select(GachaDraw).order_by(col(GachaDraw.period).desc()).limit(60)).all()
    return [_draw_out(session, d) for d in draws]


# ---- 設定與模擬 ----
@router.get("/settings", response_model=GachaSettingsIO)
def read_settings(_: CurrentUser, session: SessionDep) -> GachaSettingsIO:
    s = get_gacha_settings(session)
    return GachaSettingsIO.model_validate(s, from_attributes=True)


@router.put("/settings", response_model=GachaSettingsIO)
def write_settings(body: GachaSettingsIO, _: CurrentUser, session: SessionDep) -> GachaSettingsIO:
    s = get_gacha_settings(session)
    s.rarity_weights = {str(k): v for k, v in body.rarity_weights.items()}
    s.source_weights = {"custom": 2.0, "ai": 1.0} | {
        str(k): v for k, v in body.source_weights.items()
    }
    s.pity_threshold = body.pity_threshold
    s.ai_min_pool = body.ai_min_pool
    s.rerolls_per_month = body.rerolls_per_month
    session.add(s)
    session.commit()
    return GachaSettingsIO.model_validate(s, from_attributes=True)


@router.post("/simulate", response_model=SimulateOut)
def simulate_draws(
    _: CurrentUser, session: SessionDep, n: int = Query(default=10000, ge=100, le=100000)
) -> SimulateOut:
    s = get_gacha_settings(session)
    pool = active_pool(session)
    if not pool:
        raise HTTPException(status.HTTP_409_CONFLICT, "卡池是空的")
    result = simulate(n, pool, s.rarity_weights, s.source_weights, s.pity_threshold)
    return SimulateOut.model_validate(result)
