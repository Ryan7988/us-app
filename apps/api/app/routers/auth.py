from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlmodel import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep
from app.core.ratelimit import SlidingWindowLimiter
from app.core.security import (
    create_access_token,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.core.time import utcnow
from app.models import RefreshToken, User
from app.schemas.auth import LoginRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "us_refresh"
COOKIE_PATH = "/api/v1/auth"

login_limiter = SlidingWindowLimiter(get_settings().login_rate_limit_per_minute, 60)


def _set_refresh_cookie(response: Response, raw: str) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=s.refresh_token_days * 86400,
        path=COOKIE_PATH,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
    )


def _issue_tokens(
    session: SessionDep, response: Response, user: User, device_name: str | None
) -> TokenResponse:
    s = get_settings()
    raw, token_hash = new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            device_name=device_name,
            expires_at=utcnow() + timedelta(days=s.refresh_token_days),
        )
    )
    session.commit()
    _set_refresh_cookie(response, raw)
    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=s.access_token_minutes * 60,
        user=UserPublic.model_validate(user, from_attributes=True),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, session: SessionDep):
    ip = request.client.host if request.client else "unknown"
    if not login_limiter.hit(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "嘗試太多次，請一分鐘後再試")
    user = session.exec(select(User).where(User.username == body.username.lower())).first()
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "帳號或密碼錯誤")
    device = body.device_name or request.headers.get("user-agent", "")[:200]
    return _issue_tokens(session, response, user, device)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    session: SessionDep,
    us_refresh: Annotated[str | None, Cookie()] = None,
):
    """每次使用就輪替：舊 token 作廢、發新 token。"""
    if not us_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登入")
    rt = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(us_refresh))
    ).first()
    now = utcnow()
    if rt is None or rt.revoked_at is not None or rt.expires_at <= now:
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登入已過期，請重新登入")
    user = session.get(User, rt.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "使用者不存在")
    rt.revoked_at = now
    session.add(rt)
    return _issue_tokens(session, response, user, rt.device_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session: SessionDep,
    us_refresh: Annotated[str | None, Cookie()] = None,
) -> Response:
    if us_refresh:
        rt = session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(us_refresh))
        ).first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = utcnow()
            session.add(rt)
            session.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response


@router.get("/me", response_model=UserPublic)
def me(user: CurrentUser) -> User:
    return user
