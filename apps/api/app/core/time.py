from datetime import UTC, datetime


def utcnow() -> datetime:
    """一律使用帶時區的 UTC；SQLite 存 UTC，讀回來也是 UTC，顯示時前端轉 Asia/Taipei。"""
    return datetime.now(UTC)
