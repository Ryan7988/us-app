"""Web Push（VAPID）。api 與 worker 都會呼叫；伺服器只需要「連得出去」。"""

import json
from dataclasses import dataclass

import structlog
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.core.db import engine
from app.core.time import utcnow
from app.models import PushSubscription, User
from app.services.settings import ensure_vapid

log = structlog.get_logger()


@dataclass
class PushMessage:
    title: str
    body: str = ""
    url: str = "/"
    tag: str | None = None


def _send_one(sub: PushSubscription, payload: str, vapid: Vapid02) -> int:
    """回傳 HTTP 狀態碼（0 = 網路錯誤）。"""
    try:
        resp = webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=payload,
            vapid_private_key=vapid,
            vapid_claims={"sub": get_settings().vapid_subject},
            ttl=86400,
            timeout=10,
        )
        return getattr(resp, "status_code", 201)
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0
    except Exception:
        log.exception("push_error")
        return 0


def send_to_users(user_ids: list[str], msg: PushMessage) -> dict[str, int]:
    """同步發送；在 BackgroundTasks 或 worker 裡呼叫。回傳 {成功, 失敗, 刪除} 數量。"""
    stats = {"sent": 0, "failed": 0, "removed": 0}
    if not user_ids:
        return stats
    with Session(engine) as session:
        _, pem = ensure_vapid(session)
        # RFC 8292（Authorization: vapid t=…, k=…）：Apple 的推播伺服器要求這個格式
        vapid = (
            Vapid02.from_pem(pem.encode()) if pem.startswith("-----") else Vapid02.from_string(pem)
        )
        payload = json.dumps(
            {"title": msg.title, "body": msg.body, "url": msg.url, "tag": msg.tag},
            ensure_ascii=False,
        )
        subs = session.exec(
            select(PushSubscription).where(col(PushSubscription.user_id).in_(user_ids))
        ).all()
        for sub in subs:
            code = _send_one(sub, payload, vapid)
            if 200 <= code < 300:
                sub.last_success_at = utcnow()
                session.add(sub)
                stats["sent"] += 1
            elif code in (404, 410):  # 訂閱失效（App 被刪、權限關掉）
                session.delete(sub)
                stats["removed"] += 1
            else:
                stats["failed"] += 1
        session.commit()
    log.info("push_sent", title=msg.title, **stats)
    return stats


def send_to_all(msg: PushMessage) -> dict[str, int]:
    with Session(engine) as session:
        ids = list(session.exec(select(User.id)).all())
    return send_to_users(ids, msg)
