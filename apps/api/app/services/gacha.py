"""扭蛋：先決定稀有度，再在該稀有度內依來源權重抽卡；保底只影響第一層。"""

import secrets
import threading
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

from sqlmodel import Session, col, select

from app.core.time import current_period, utcnow
from app.models import GachaCard, GachaDraw, GachaSettings

_rng = secrets.SystemRandom()
RARITIES = ("SSR", "SR", "R")
FINISHED = ("drawn", "done", "failed")

# api 是單一程序：同一時間只讓一個請求進入「標記準備 → 抽卡」區段；
# 另外還有資料庫層的條件更新（status='waiting'）做第二道保護
draw_lock = threading.Lock()


class EmptyPoolError(Exception):
    pass


class CardLike(Protocol):
    id: str
    rarity: str
    source: str


@dataclass
class DrawResult:
    card: CardLike
    rarity: str
    pity: bool
    rolls: list[float] = field(default_factory=list)


def weighted_choice[T](items: Sequence[tuple[T, float]], rolls: list[float]) -> T:
    """依權重抽一個；用到的隨機值記進 rolls（寫入 gacha_draws.rng_value）。"""
    total = sum(w for _, w in items)
    if total <= 0:
        raise EmptyPoolError
    x = _rng.random()
    rolls.append(x)
    acc = 0.0
    last: T | None = None
    for item, w in items:
        acc += w / total
        last = item
        if x < acc:
            return item
    assert last is not None
    return last  # 浮點誤差保護


def draw(
    pool: Sequence[CardLike],
    rarity_weights: dict[str, float],
    source_weights: dict[str, float],
    pity_threshold: int,
    misses: int,
) -> DrawResult:
    tiers = {r: [c for c in pool if c.rarity == r] for r in RARITIES}
    # 空的稀有度：機率按比例分給其他非空的（只保留非空項再正規化）
    weights = {r: rarity_weights.get(r, 0.0) for r in RARITIES if tiers[r]}
    weights = {r: w for r, w in weights.items() if w > 0} or {r: 1.0 for r in RARITIES if tiers[r]}
    if not weights:
        raise EmptyPoolError
    rolls: list[float] = []
    pity = pity_threshold > 0 and misses >= pity_threshold - 1 and "SSR" in weights
    rarity = "SSR" if pity else weighted_choice(list(weights.items()), rolls)
    card = weighted_choice(
        [(c, max(source_weights.get(c.source, 1.0), 0.0001)) for c in tiers[rarity]], rolls
    )
    return DrawResult(card=card, rarity=rarity, pity=pity, rolls=rolls)


def misses_since_last_ssr(rarities_newest_first: Sequence[str | None]) -> int:
    n = 0
    for r in rarities_newest_first:
        if r is None:
            continue
        if r == "SSR":
            break
        n += 1
    return n


def history_rarities(session: Session, exclude_period: str | None = None) -> list[str | None]:
    q = select(GachaDraw).where(col(GachaDraw.status).in_(FINISHED))
    if exclude_period:
        q = q.where(GachaDraw.period != exclude_period)
    return [d.rarity for d in session.exec(q.order_by(col(GachaDraw.period).desc())).all()]


def streak(session: Session) -> int:
    """連續達成：從最近一期往回數 done，遇到 failed 就停（進行中的本月不算斷）。"""
    n = 0
    draws = session.exec(select(GachaDraw).order_by(col(GachaDraw.period).desc())).all()
    for d in draws:
        if d.status == "done":
            n += 1
        elif d.status == "failed":
            break
    return n


def active_pool(session: Session) -> list[GachaCard]:
    return list(session.exec(select(GachaCard).where(GachaCard.status == "active")).all())


def get_or_create_current(session: Session, period: str | None = None) -> GachaDraw:
    period = period or current_period()
    d = session.exec(select(GachaDraw).where(GachaDraw.period == period)).first()
    if d is None:
        d = GachaDraw(period=period)
        session.add(d)
        session.commit()
        session.refresh(d)
    return d


def perform_draw(session: Session, d: GachaDraw, settings: GachaSettings) -> GachaDraw:
    """呼叫前必須持有 draw_lock。結果與當下卡池快照都寫進紀錄，誰都無法重抽。"""
    pool = active_pool(session)
    misses = misses_since_last_ssr(history_rarities(session, exclude_period=d.period))
    result = draw(
        pool, settings.rarity_weights, settings.source_weights, settings.pity_threshold, misses
    )
    card = result.card
    assert isinstance(card, GachaCard)
    now = utcnow()
    d.card_id = card.id
    d.card_content = card.content
    d.rarity = result.rarity
    d.pity_triggered = result.pity
    d.rng_value = result.rolls
    d.pool_snapshot = [{"id": c.id, "rarity": c.rarity, "source": c.source} for c in pool]
    d.drawn_at = now
    d.status = "drawn"
    d.updated_at = now
    if not card.repeatable:
        card.status = "drawn"
        card.updated_at = now
        session.add(card)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def simulate(
    n: int,
    pool: Sequence[CardLike],
    rarity_weights: dict[str, float],
    source_weights: dict[str, float],
    pity_threshold: int,
) -> dict[str, object]:
    """模擬 n 次（含保底），給後台畫分佈圖。卡池不消耗（不可重複的卡也視為一直都在）。"""
    counts: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    pity_count = 0
    misses = 0
    for _ in range(n):
        r = draw(pool, rarity_weights, source_weights, pity_threshold, misses)
        counts[r.rarity] += 1
        sources[r.card.source] += 1
        pity_count += int(r.pity)
        misses = 0 if r.rarity == "SSR" else misses + 1
    return {
        "n": n,
        "rarity": {k: counts[k] / n for k in RARITIES},
        "source": {k: v / n for k, v in sources.items()},
        "pity_rate": pity_count / n,
    }
