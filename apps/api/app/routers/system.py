from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.core.deps import SessionDep

router = APIRouter(tags=["system"])


@router.get("/healthz")
def healthz(session: SessionDep) -> dict[str, str]:
    session.exec(text("SELECT 1"))  # type: ignore[call-overload]
    return {"status": "ok", "version": get_settings().app_version}
