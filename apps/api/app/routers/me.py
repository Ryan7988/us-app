from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, status
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.core.security import hash_password, hash_token, verify_password
from app.core.time import utcnow
from app.models import RefreshToken, User
from app.schemas.auth import UserPublic
from app.schemas.settings import (
    AppSettingsOut,
    AppSettingsPatch,
    PasswordChange,
    ProfilePatch,
    SessionOut,
)
from app.services.settings import get_app_settings

router = APIRouter(tags=["me"])


@router.patch("/auth/me", response_model=UserPublic)
def update_profile(body: ProfilePatch, user: CurrentUser, session: SessionDep) -> User:
    for k, v in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, k, v)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/auth/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChange, user: CurrentUser, session: SessionDep) -> None:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "目前的密碼不正確")
    user.password_hash = hash_password(body.new_password)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()


@router.get("/auth/sessions", response_model=list[SessionOut])
def list_sessions(
    user: CurrentUser, session: SessionDep, us_refresh: Annotated[str | None, Cookie()] = None
):
    """兩個人的所有登入裝置（後台可強制登出）。"""
    current = hash_token(us_refresh) if us_refresh else None
    now = utcnow()
    rows = session.exec(
        select(RefreshToken)
        .where(col(RefreshToken.revoked_at).is_(None), col(RefreshToken.expires_at) > now)
        .order_by(col(RefreshToken.created_at).desc())
    ).all()
    return [
        SessionOut(
            id=r.id,
            device_name=f"{_name(session, r.user_id)}・{_short_device(r.device_name)}",
            created_at=r.created_at,
            expires_at=r.expires_at,
            current=r.token_hash == current,
        )
        for r in rows
    ]


def _name(session: SessionDep, user_id: str) -> str:
    u = session.get(User, user_id)
    return u.display_name if u else "?"


def _short_device(ua: str | None) -> str:
    if not ua:
        return "未知裝置"
    for key, label in (
        ("iPhone", "iPhone"),
        ("iPad", "iPad"),
        ("Android", "Android"),
        ("Macintosh", "Mac"),
        ("Windows", "Windows"),
    ):
        if key in ua:
            return label
    return ua[:40]


@router.delete("/auth/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: str, _: CurrentUser, session: SessionDep) -> None:
    rt = session.get(RefreshToken, session_id)
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到")
    rt.revoked_at = utcnow()
    session.add(rt)
    session.commit()


@router.get("/settings", response_model=AppSettingsOut)
def read_settings(_: CurrentUser, session: SessionDep) -> AppSettingsOut:
    return AppSettingsOut(anniversary=get_app_settings(session).anniversary)


@router.patch("/settings", response_model=AppSettingsOut)
def patch_settings(body: AppSettingsPatch, _: CurrentUser, session: SessionDep) -> AppSettingsOut:
    s = get_app_settings(session)
    if "anniversary" in body.model_fields_set:
        s.anniversary = body.anniversary
    s.updated_at = utcnow()
    session.add(s)
    session.commit()
    return AppSettingsOut(anniversary=s.anniversary)
