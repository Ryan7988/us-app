from fastapi import APIRouter
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.models import User
from app.schemas.auth import UserPublic

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserPublic])
def list_users(_: CurrentUser, session: SessionDep):
    """兩個人的基本資料（顯示「誰加的」、顏色）。"""
    return session.exec(select(User).order_by(col(User.created_at))).all()
