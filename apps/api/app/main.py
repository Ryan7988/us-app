import traceback
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.core.config import get_settings
from app.core.db import engine
from app.core.logging import configure_logging
from app.models import ErrorLog
from app.realtime.manager import manager
from app.routers import (
    admin,
    albums,
    auth,
    events,
    gacha,
    ics,
    invitations,
    locations,
    me,
    media,
    photos,
    push,
    setup,
    system,
    users,
    wishes,
    ws,
)

API_PREFIX = "/api/v1"
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    yield
    await manager.close_all()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Us App API",
        version=get_settings().app_version,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def record_errors(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """未捕捉的例外寫進 error_logs，後台可看（不用外部 Sentry）。"""
        try:
            return await call_next(request)
        except Exception as exc:
            log.exception("unhandled_error", path=request.url.path)
            try:
                with Session(engine) as s:
                    s.add(
                        ErrorLog(
                            method=request.method,
                            path=request.url.path[:500],
                            error=repr(exc)[:1000],
                            traceback=traceback.format_exc()[-8000:],
                        )
                    )
                    s.commit()
            except Exception:
                log.exception("error_log_failed")
            return JSONResponse({"detail": "伺服器發生錯誤"}, status_code=500)

    for r in (
        system.router,
        setup.router,
        auth.router,
        me.router,
        users.router,
        wishes.router,
        events.router,
        invitations.router,
        ics.router,
        push.router,
        gacha.router,
        photos.router,
        albums.router,
        media.router,
        locations.router,
        admin.router,
        ws.router,
    ):
        app.include_router(r, prefix=API_PREFIX)
    return app


app = create_app()
