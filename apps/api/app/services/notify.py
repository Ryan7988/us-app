"""寫入後的通知：WebSocket（App 開著時）＋ Web Push（重要事件）。"""

from typing import Any

from fastapi import BackgroundTasks

from app.realtime.manager import manager
from app.services.push import PushMessage, send_to_users


def ws(bg: BackgroundTasks, event_type: str, data: dict[str, Any] | None = None) -> None:
    bg.add_task(manager.broadcast, event_type, data or {})


def push(bg: BackgroundTasks, user_ids: list[str | None], msg: PushMessage) -> None:
    ids = [u for u in user_ids if u]
    if ids:
        bg.add_task(send_to_users, ids, msg)
