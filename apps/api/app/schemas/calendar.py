from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import UTCDateTime

OwnerKind = Literal["me", "partner", "shared"]


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=300)
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    owner: OwnerKind = "me"
    rrule: str | None = Field(default=None, max_length=300)
    remind_minutes: int | None = Field(default=None, ge=0, le=60 * 24 * 14)

    @model_validator(mode="after")
    def _check_range(self) -> "EventIn":
        if self.end_at < self.start_at:
            raise ValueError("結束時間不能早於開始時間")
        return self


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=300)
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    owner: OwnerKind | None = None
    rrule: str | None = Field(default=None, max_length=300)
    remind_minutes: int | None = Field(default=None, ge=0, le=60 * 24 * 14)


class EventOut(BaseModel):
    id: str
    title: str
    note: str | None
    location: str | None
    start_at: UTCDateTime
    end_at: UTCDateTime
    all_day: bool
    owner_id: str | None
    rrule: str | None
    remind_minutes: int | None
    source_invitation_id: str | None
    created_by: str


class OccurrenceOut(BaseModel):
    """展開後的一次行程；重複行程每次出現都是一筆，id 是原行程的 id。"""

    event: EventOut
    start: UTCDateTime
    end: UTCDateTime


class Slot(BaseModel):
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def _check(self) -> "Slot":
        if self.end_at < self.start_at:
            raise ValueError("結束時間不能早於開始時間")
        return self


class InvitationIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=300)
    proposed_slots: list[Slot] = Field(min_length=1, max_length=3)
    theme: str = Field(default="rose", max_length=32)


class InvitationRespond(BaseModel):
    action: Literal["accept", "decline", "counter"]
    chosen_slot: int | None = Field(default=None, ge=0, le=2)
    message: str | None = Field(default=None, max_length=500)
    counter_slots: list[Slot] | None = Field(default=None, max_length=3)

    @field_validator("counter_slots")
    @classmethod
    def _non_empty(cls, v: list[Slot] | None) -> list[Slot] | None:
        if v is not None and len(v) == 0:
            raise ValueError("請至少提供一個時間")
        return v


class SlotOut(BaseModel):
    start_at: str
    end_at: str


class InvitationOut(BaseModel):
    id: str
    from_user: str
    to_user: str
    title: str
    message: str | None
    location: str | None
    proposed_slots: list[SlotOut]
    theme: str
    status: str
    chosen_slot: int | None
    response_message: str | None
    reply_to_id: str | None
    event_id: str | None
    responded_at: UTCDateTime | None
    expires_at: UTCDateTime
    created_at: UTCDateTime
