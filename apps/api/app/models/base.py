from datetime import datetime

from sqlmodel import Field, SQLModel
from uuid6 import uuid7

from app.core.time import utcnow


def new_id() -> str:
    """UUIDv7：有時間順序、不暴露筆數。"""
    return str(uuid7())


class TimestampMixin(SQLModel):
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)
