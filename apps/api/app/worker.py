"""排程 worker（獨立容器，時區 Asia/Taipei）。

每分鐘：行程提醒          每 5 分鐘：心跳
每天 04:00：清除舊位置、過期邀請、過期 token    每天 04:30：檢查備份與磁碟
每月 1 號 00:00：開放扭蛋   3 號 20:00：還沒抽就提醒   25 號 20:00：還沒完成就提醒
每月最後一天 23:59：月底結算   每月 20 號 03:00：AI 補卡
"""

import json
import shutil
import signal
from collections.abc import Callable
from datetime import timedelta
from functools import wraps
from pathlib import Path
from types import FrameType
from typing import Any

import structlog
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, col, delete, or_, select

from app.core.config import get_settings
from app.core.db import engine
from app.core.logging import configure_logging
from app.core.time import current_period, taipei_now, utcnow
from app.models import (
    Event,
    GachaCard,
    GachaDraw,
    Invitation,
    Location,
    RefreshToken,
    ReminderLog,
    User,
)
from app.services import ai
from app.services.calendar import expand
from app.services.gacha import get_or_create_current
from app.services.media import media_root
from app.services.push import PushMessage, send_to_all, send_to_users
from app.services.settings import get_app_settings, get_gacha_settings, record_job_run

log = structlog.get_logger()


def job(name: str) -> Callable[[Callable[[Session], str | None]], Callable[[], None]]:
    """每個排程都記錄最後執行時間與結果（後台顯示）。"""

    def deco(fn: Callable[[Session], str | None]) -> Callable[[], None]:
        @wraps(fn)
        def run() -> None:
            with Session(engine) as session:
                try:
                    msg = fn(session) or ""
                    record_job_run(session, name, True, msg)
                except Exception as e:
                    log.exception("job_failed", job=name)
                    session.rollback()
                    record_job_run(session, name, False, repr(e))

        return run

    return deco


@job("heartbeat")
def heartbeat(session: Session) -> str:
    s = get_app_settings(session)
    s.worker_heartbeat_at = utcnow()
    session.add(s)
    session.commit()
    return "ok"


@job("reminders")
def send_reminders(session: Session) -> str:
    """掃描接下來 24 小時內的行程；到了提醒時間就推播（ReminderLog 防重複）。"""
    now = utcnow()
    events = session.exec(
        select(Event).where(col(Event.deleted_at).is_(None), col(Event.remind_minutes).is_not(None))
    ).all()
    users = session.exec(select(User)).all()
    sent = 0
    for occ in expand(events, now - timedelta(minutes=10), now + timedelta(days=15)):
        ev = occ.event
        assert ev.remind_minutes is not None
        remind_at = occ.start - timedelta(minutes=ev.remind_minutes)
        if not (now - timedelta(minutes=10) <= remind_at <= now):
            continue
        exists = session.exec(
            select(ReminderLog).where(
                ReminderLog.event_id == ev.id, ReminderLog.occurrence_start == occ.start
            )
        ).first()
        if exists:
            continue
        session.add(ReminderLog(event_id=ev.id, occurrence_start=occ.start))
        session.commit()
        targets = [u.id for u in users] if ev.owner_id is None else [ev.owner_id]
        when = "現在" if ev.remind_minutes == 0 else _fmt_minutes(ev.remind_minutes) + "後"
        send_to_users(
            targets,
            PushMessage(
                f"⏰ {when}：{ev.title}", ev.location or "", "/calendar", tag=f"ev-{ev.id}"
            ),
        )
        sent += 1
    return f"sent {sent}"


def _fmt_minutes(m: int) -> str:
    if m % 1440 == 0:
        return f"{m // 1440} 天"
    if m % 60 == 0:
        return f"{m // 60} 小時"
    return f"{m} 分鐘"


@job("daily_cleanup")
def daily_cleanup(session: Session) -> str:
    now = utcnow()
    locs = session.exec(  # type: ignore[call-overload]
        delete(Location).where(col(Location.recorded_at) < now - timedelta(days=30))
    ).rowcount
    tokens = session.exec(  # type: ignore[call-overload]
        delete(RefreshToken).where(
            or_(
                col(RefreshToken.expires_at) < now,
                col(RefreshToken.revoked_at) < now - timedelta(days=7),
            )
        )
    ).rowcount
    session.exec(delete(ReminderLog).where(col(ReminderLog.sent_at) < now - timedelta(days=60)))  # type: ignore[call-overload]
    invs = session.exec(
        select(Invitation).where(Invitation.status == "pending", col(Invitation.expires_at) < now)
    ).all()
    for inv in invs:
        inv.status = "expired"
        session.add(inv)
    session.commit()
    return f"locations={locs} tokens={tokens} invitations={len(invs)}"


@job("backup_watch")
def backup_watch(session: Session) -> str:
    """備份失敗或超過 26 小時沒備份 → 推播；磁碟剩不到 10% → 推播。"""
    problems = []
    status_file = Path(get_settings().backup_status_dir) / "backups.jsonl"
    last: dict[str, Any] | None = None
    if status_file.exists():
        lines = status_file.read_text().strip().splitlines()
        if lines:
            last = json.loads(lines[-1])
    if last is None:
        problems.append("還沒有任何備份紀錄")
    elif last.get("status") != "ok":
        problems.append(f"最近一次備份失敗：{last.get('message', '')}")
    else:
        from datetime import datetime

        finished = datetime.fromisoformat(str(last["finished_at"]).replace("Z", "+00:00"))
        if utcnow() - finished > timedelta(hours=26):
            problems.append("超過 26 小時沒有備份")
    root = media_root()
    root.mkdir(parents=True, exist_ok=True)
    disk = shutil.disk_usage(root)
    if disk.free / disk.total < 0.10:
        problems.append(f"磁碟只剩 {disk.free / disk.total:.0%}")
    if problems:
        send_to_all(PushMessage("⚠️ 伺服器需要注意", "；".join(problems), "/more/admin", tag="ops"))
    return "; ".join(problems) or "ok"


@job("gacha_open")
def gacha_open(session: Session) -> str:
    d = get_or_create_current(session)
    send_to_all(
        PushMessage(
            "🎰 本月扭蛋開放了！", "兩個人都按「準備好了」就開獎", "/gacha", tag="gacha-open"
        )
    )
    return d.period


@job("gacha_remind_draw")
def gacha_remind_draw(session: Session) -> str:
    d = get_or_create_current(session)
    if d.status == "waiting":
        send_to_all(
            PushMessage("🎰 這個月還沒抽扭蛋喔", "找個時間一起抽吧", "/gacha", tag="gacha-open")
        )
        return "reminded"
    return "already drawn"


@job("gacha_remind_finish")
def gacha_remind_finish(session: Session) -> str:
    d = get_or_create_current(session)
    if d.status == "drawn":
        days = 31 - taipei_now().day
        send_to_all(
            PushMessage(
                f"⏳ 這個月只剩幾天了（約 {days} 天）",
                d.card_content or "",
                "/gacha",
                tag="gacha-finish",
            )
        )
        return "reminded"
    return d.status


@job("gacha_settle")
def gacha_settle(session: Session) -> str:
    """月底結算：抽了但沒完成 → failed（連續達成歸零），卡片回到卡池給第二次機會。"""
    d = session.exec(select(GachaDraw).where(GachaDraw.period == current_period())).first()
    if d is None or d.status in ("done", "failed"):
        return "nothing"
    if d.status == "drawn" and d.card_id:
        card = session.get(GachaCard, d.card_id)
        if card and card.status == "drawn":
            card.status = "active"
            session.add(card)
    d.status = "failed"
    d.reroll_requested_by = None
    d.updated_at = utcnow()
    session.add(d)
    session.commit()
    send_to_all(
        PushMessage("😢 這個月的扭蛋任務沒有完成", "連續達成歸零了，下個月再一起加油！", "/gacha")
    )
    return "failed"


@job("ai_refill")
def ai_refill(session: Session) -> str:
    s = get_gacha_settings(session)
    active_ai = session.exec(
        select(GachaCard).where(GachaCard.source == "ai", GachaCard.status == "active")
    ).all()
    if len(active_ai) >= s.ai_min_pool:
        return f"enough ({len(active_ai)})"
    st = ai.ollama_status()
    if not st["reachable"] or not st.get("chat_model_ready"):
        return "ollama not ready"
    cards = ai.generate_cards(session, min(15, s.ai_min_pool - len(active_ai) + 5))
    if cards:
        send_to_all(
            PushMessage(f"🤖 AI 出了 {len(cards)} 張新卡", "來審核吧！", "/gacha/review", tag="ai")
        )
    return f"generated {len(cards)}"


def build_scheduler() -> BlockingScheduler:
    tz = get_settings().tz
    sched = BlockingScheduler(
        timezone=tz,
        job_defaults={"misfire_grace_time": 6 * 3600, "coalesce": True, "max_instances": 1},
    )

    def cron(**kw: Any) -> CronTrigger:
        return CronTrigger(timezone=tz, **kw)

    sched.add_job(heartbeat, "interval", minutes=5, id="heartbeat", next_run_time=taipei_now())
    sched.add_job(send_reminders, "interval", minutes=1, id="reminders", misfire_grace_time=300)
    sched.add_job(daily_cleanup, cron(hour=4, minute=0), id="daily_cleanup")
    sched.add_job(backup_watch, cron(hour=4, minute=30), id="backup_watch")
    sched.add_job(gacha_open, cron(day=1, hour=0, minute=0), id="gacha_open")
    sched.add_job(gacha_remind_draw, cron(day=3, hour=20, minute=0), id="gacha_remind_draw")
    sched.add_job(gacha_remind_finish, cron(day=25, hour=20, minute=0), id="gacha_remind_finish")
    sched.add_job(gacha_settle, cron(day="last", hour=23, minute=59), id="gacha_settle")
    sched.add_job(ai_refill, cron(day=20, hour=3, minute=0), id="ai_refill")
    return sched


def main() -> None:
    configure_logging()
    sched = build_scheduler()

    def _stop(_sig: int, _frame: FrameType | None) -> None:
        sched.shutdown(wait=False)

    signal.signal(signal.SIGTERM, _stop)
    log.info("worker_started")
    sched.start()


if __name__ == "__main__":
    main()
