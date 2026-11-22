from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.time import utcnow
from app.models.base import new_id


class AppSettings(SQLModel, table=True):
    """單一一筆的全域設定（id=1）。VAPID 金鑰存這裡，跟著 data/ 搬家。"""

    __tablename__ = "app_settings"

    id: int = Field(default=1, primary_key=True)
    anniversary: date | None = None
    vapid_public_key: str | None = None
    vapid_private_pem: str | None = None
    worker_heartbeat_at: datetime | None = None
    job_runs: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(default_factory=utcnow)


class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscriptions"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    user_id: str = Field(foreign_key="users.id", index=True, max_length=36)
    endpoint: str = Field(unique=True, max_length=1000)
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)
    user_agent: str | None = Field(default=None, max_length=300)
    last_success_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ErrorLog(SQLModel, table=True):
    __tablename__ = "error_logs"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    method: str = Field(max_length=10)
    path: str = Field(max_length=500)
    error: str = Field(max_length=1000)
    traceback: str
    created_at: datetime = Field(default_factory=utcnow, index=True)
