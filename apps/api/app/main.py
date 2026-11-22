from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.realtime.manager import manager
from app.routers import auth, setup, system, users, wishes, ws

API_PREFIX = "/api/v1"


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
    for r in (system.router, setup.router, auth.router, users.router, wishes.router, ws.router):
        app.include_router(r, prefix=API_PREFIX)
    return app


app = create_app()
