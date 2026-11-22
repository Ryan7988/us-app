from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, Index, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.time import utcnow
from app.models.base import TimestampMixin, new_id


class Event(TimestampMixin, table=True):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_owner_start", "owner_id", "start_at"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    title: str = Field(max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=300)
    start_at: datetime = Field(index=True)
    end_at: datetime
    all_day: bool = False
    # NULL = 共同行程；否則是某個人的
    owner_id: str | None = Field(default=None, foreign_key="users.id", max_length=36)
    # RFC 5545 RRULE（不含 DTSTART），例如 FREQ=WEEKLY、FREQ=YEARLY
    rrule: str | None = Field(default=None, max_length=300)
    remind_minutes: int | None = None
    source_invitation_id: str | None = Field(default=None, max_length=36)
    created_by: str = Field(foreign_key="users.id", max_length=36)
    deleted_at: datetime | None = None


class ReminderLog(SQLModel, table=True):
    """避免同一次行程提醒重複發送。"""

    __tablename__ = "reminder_logs"
    __table_args__ = (UniqueConstraint("event_id", "occurrence_start"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    event_id: str = Field(max_length=36)
    occurrence_start: datetime
    sent_at: datetime = Field(default_factory=utcnow)


class Invitation(TimestampMixin, table=True):
    __tablename__ = "invitations"
    __table_args__ = (Index("ix_invitations_to_status", "to_user", "status"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    from_user: str = Field(foreign_key="users.id", max_length=36)
    to_user: str = Field(foreign_key="users.id", max_length=36)
    title: str = Field(max_length=200)
    message: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=300)
    # [{"start_at": iso, "end_at": iso}]，1–3 個候選時間
    proposed_slots: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    theme: str = Field(default="rose", max_length=32)
    status: str = Field(default="pending", max_length=16)
    chosen_slot: int | None = None
    response_message: str | None = Field(default=None, max_length=500)
    reply_to_id: str | None = Field(default=None, max_length=36)
    event_id: str | None = Field(default=None, max_length=36)
    responded_at: datetime | None = None
    expires_at: datetime
