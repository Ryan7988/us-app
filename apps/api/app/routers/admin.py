import json
import shutil
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, col, func, select

from app.core.config import get_settings
from app.core.db import engine
from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import ErrorLog, GachaCard, Location, Photo, PushSubscription, User, WishItem
from app.realtime.manager import manager
from app.schemas.common import UTCDateTime
from app.services import ai
from app.services.media import media_root, rebuild_derivatives
from app.services.push import PushMessage, send_to_users
from app.services.settings import get_app_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class ErrorOut(BaseModel):
    id: str
    method: str
    path: str
    error: str
    created_at: UTCDateTime


def _dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _read_jsonl(path: Path, n: int) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[-n:]:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(out))


def db_path() -> Path | None:
    url = get_settings().database_url
    return Path(url.removeprefix("sqlite:///")) if url.startswith("sqlite:///") else None


@router.get("/health")
def health(_: CurrentUser, session: SessionDep) -> dict[str, Any]:
    """服務健康狀態：API、DB、Ollama、排程器最後執行時間。"""
    try:
        session.exec(text("SELECT 1"))  # type: ignore[call-overload]
        integrity = session.exec(text("PRAGMA quick_check")).one()[0]  # type: ignore[call-overload]
        db = {"ok": integrity == "ok", "detail": integrity}
    except Exception as e:
        db = {"ok": False, "detail": repr(e)}
    s = get_app_settings(session)
    hb = s.worker_heartbeat_at
    worker_ok = hb is not None and utcnow() - hb < timedelta(minutes=15)
    return {
        "api": {"ok": True, "version": get_settings().app_version},
        "db": db,
        "worker": {
            "ok": worker_ok,
            "heartbeat_at": hb.isoformat() if hb else None,
            "jobs": s.job_runs,
        },
        "ollama": ai.ollama_status(),
        "websocket_online": manager.online_users(),
    }


@router.get("/stats")
def stats(_: CurrentUser, session: SessionDep) -> dict[str, Any]:
    root = media_root()
    root.mkdir(parents=True, exist_ok=True)
    disk = shutil.disk_usage(root)
    dbp = db_path()

    def count(model, *where):
        return session.exec(select(func.count()).select_from(model).where(*where)).one()  # noqa: E731

    return {
        "disk": {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "free_ratio": disk.free / disk.total,
        },
        "photos": {
            "count": count(Photo, col(Photo.deleted_at).is_(None)),
            "originals_bytes": _dir_size(root / "originals"),
            "derived_bytes": _dir_size(root / "thumbs") + _dir_size(root / "display"),
        },
        "db_bytes": dbp.stat().st_size if dbp and dbp.exists() else 0,
        "wishes": count(WishItem, col(WishItem.deleted_at).is_(None)),
        "cards": count(GachaCard, GachaCard.status == "active"),
        "locations": count(Location),
        "push_devices": count(PushSubscription),
    }


@router.get("/backups")
def backups(_: CurrentUser) -> dict[str, Any]:
    d = Path(get_settings().backup_status_dir)
    return {
        "backups": _read_jsonl(d / "backups.jsonl", 10),
        "verify": _read_jsonl(d / "verify.jsonl", 10),
    }


@router.get("/errors", response_model=list[ErrorOut])
def errors(_: CurrentUser, session: SessionDep):
    return session.exec(select(ErrorLog).order_by(col(ErrorLog.created_at).desc()).limit(30)).all()


def _generate_job(n: int, user_id: str) -> None:
    with Session(engine) as session:
        try:
            cards = ai.generate_cards(session, n)
            msg = PushMessage(
                f"🤖 AI 出了 {len(cards)} 張新卡", "來審核吧！", "/gacha/review", tag="ai"
            )
        except ai.AIUnavailable as e:
            msg = PushMessage("🤖 AI 出題失敗", str(e)[:100], "/more/admin", tag="ai")
    send_to_users([user_id], msg)


@router.post("/ai/generate", status_code=status.HTTP_202_ACCEPTED)
def ai_generate(user: CurrentUser, bg: BackgroundTasks, n: int = 10) -> dict[str, str]:
    """手動補卡（背景執行，完成後推播）。"""
    st = ai.ollama_status()
    if not st["reachable"]:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "連不到 Ollama")
    if not st.get("chat_model_ready"):
        raise HTTPException(status.HTTP_409_CONFLICT, "AI 模型還沒下載，先按「下載 AI 模型」")
    bg.add_task(_generate_job, max(1, min(n, 30)), user.id)
    return {"status": "started"}


@router.post("/ai/pull", status_code=status.HTTP_202_ACCEPTED)
def ai_pull(_: CurrentUser, bg: BackgroundTasks) -> dict[str, str]:
    if not ai.ollama_status()["reachable"]:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "連不到 Ollama")
    bg.add_task(ai.pull_models)
    return {"status": "started"}


@router.post("/media/rebuild")
def media_rebuild(_: CurrentUser, session: SessionDep) -> dict[str, int]:
    """還原備份後，從原圖重新產生縮圖與顯示用圖片。"""
    rebuilt = failed = 0
    for p in session.exec(select(Photo).where(col(Photo.deleted_at).is_(None))).all():
        try:
            rebuilt += int(rebuild_derivatives(p))
        except Exception:
            failed += 1
    return {"rebuilt": rebuilt, "failed": failed}


@router.get("/users")
def users(_: CurrentUser, session: SessionDep) -> list[dict[str, Any]]:
    return [{"id": u.id, "display_name": u.display_name} for u in session.exec(select(User)).all()]
