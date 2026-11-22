from fastapi import APIRouter, HTTPException, status
from sqlmodel import func, select

from app.core.deps import SessionDep
from app.core.security import hash_password
from app.models import User
from app.schemas.auth import SetupRequest, SetupStatus, UserPublic

router = APIRouter(prefix="/setup", tags=["setup"])


def _user_count(session: SessionDep) -> int:
    return session.exec(select(func.count()).select_from(User)).one()


@router.get("/status", response_model=SetupStatus)
def setup_status(session: SessionDep) -> SetupStatus:
    return SetupStatus(needs_setup=_user_count(session) == 0)


@router.post("", response_model=list[UserPublic], status_code=status.HTTP_201_CREATED)
def run_setup(body: SetupRequest, session: SessionDep) -> list[User]:
    # 只在資料庫沒有任何使用者時可用；建完永久關閉
    if _user_count(session) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "已完成初始設定")
    names = {u.username.lower() for u in body.users}
    if len(names) != 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "兩個帳號名稱不可相同")
    users = [
        User(
            username=u.username.lower(),
            display_name=u.display_name,
            password_hash=hash_password(u.password),
            color=u.color,
            is_admin=True,
        )
        for u in body.users
    ]
    session.add_all(users)
    session.commit()
    for u in users:
        session.refresh(u)
    return users
