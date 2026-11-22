from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    """一律使用帶時區的 UTC；SQLite 存 UTC，讀回來也是 UTC，顯示時前端轉 Asia/Taipei。"""
    return datetime.now(UTC)


TAIPEI = ZoneInfo("Asia/Taipei")


def taipei_now() -> datetime:
    return datetime.now(TAIPEI)


def current_period(now: datetime | None = None) -> str:
    """扭蛋期別：台北時間的 YYYY-MM。"""
    return (now or taipei_now()).astimezone(TAIPEI).strftime("%Y-%m")


def ensure_aware(dt: datetime) -> datetime:
    """前端若送來沒有時區的時間，視為台北時間。"""
    return dt.replace(tzinfo=TAIPEI) if dt.tzinfo is None else dt
