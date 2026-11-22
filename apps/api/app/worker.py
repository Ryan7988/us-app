"""排程 worker（獨立容器）。

P0/P1 只有心跳與每日清理；P2 之後加入：行程提醒、每月扭蛋開放/結算、AI 補卡。
"""

import signal
from datetime import timedelta
from types import FrameType

import structlog
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, col, delete, or_

from app.core.config import get_settings
from app.core.db import engine
from app.core.logging import configure_logging
from app.core.time import utcnow
from app.models import RefreshToken

log = structlog.get_logger()


def cleanup_expired_tokens() -> None:
    """每天 04:00：清除過期或已撤銷超過 7 天的 refresh token。"""
    now = utcnow()
    with Session(engine) as session:
        result = session.exec(  # type: ignore[call-overload]
            delete(RefreshToken).where(
                or_(
                    col(RefreshToken.expires_at) < now,
                    col(RefreshToken.revoked_at) < now - timedelta(days=7),
                )
            )
        )
        session.commit()
        log.info("cleanup_expired_tokens", deleted=result.rowcount)


def heartbeat() -> None:
    log.info("worker_heartbeat")


def build_scheduler() -> BlockingScheduler:
    tz = get_settings().tz
    sched = BlockingScheduler(
        timezone=tz, job_defaults={"misfire_grace_time": 3600, "coalesce": True}
    )
    sched.add_job(heartbeat, "interval", minutes=10, id="heartbeat")
    sched.add_job(cleanup_expired_tokens, CronTrigger(hour=4, minute=0, timezone=tz), id="cleanup")
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
