import asyncio
import contextlib
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """每個使用者可能有多台裝置；以 user_id 分組管理連線。"""

    def __init__(self) -> None:
        self._conns: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns.setdefault(user_id, set()).add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._conns.get(user_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._conns.pop(user_id, None)

    async def broadcast(self, event_type: str, data: dict[str, Any] | None = None) -> None:
        msg = {"type": event_type, "data": data or {}}
        async with self._lock:
            targets = [(uid, ws) for uid, conns in self._conns.items() for ws in conns]
        for uid, ws in targets:
            try:
                await ws.send_json(msg)
            except Exception:
                await self.disconnect(uid, ws)

    def online_users(self) -> list[str]:
        return list(self._conns.keys())

    async def close_all(self) -> None:
        async with self._lock:
            targets = [ws for conns in self._conns.values() for ws in conns]
            self._conns.clear()
        for ws in targets:
            with contextlib.suppress(Exception):
                await ws.close()


manager = ConnectionManager()
