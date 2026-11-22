from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)
    kind: Literal["auto", "checkin"] = "auto"
    message: str | None = Field(default=None, max_length=200)


class LocationOut(BaseModel):
    user_id: str
    lat: float
    lng: float
    accuracy_m: float | None
    kind: str
    message: str | None
    recorded_at: UTCDateTime


class LatestOut(BaseModel):
    user_id: str
    sharing: bool
    location: LocationOut | None
    last_checkin: LocationOut | None


class SharingIn(BaseModel):
    enabled: bool
