import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlmodel import Session

from app.core.db import engine
from app.core.security import decode_access_token
from app.models import User
from app.realtime.manager import manager

router = APIRouter(tags=["realtime"])

PING_INTERVAL = 25


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(default="")) -> None:
    user_id = decode_access_token(token)
    if user_id:
        with Session(engine) as session:
            if session.get(User, user_id) is None:
                user_id = None
    if not user_id:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, ws)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_text(), timeout=PING_INTERVAL)
                if msg == "ping":
                    await ws.send_json({"type": "pong", "data": {}})
            except TimeoutError:
                await ws.send_json({"type": "ping", "data": {}})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, ws)
