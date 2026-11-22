from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=32)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class SessionOut(BaseModel):
    id: str
    device_name: str | None
    created_at: UTCDateTime
    expires_at: UTCDateTime
    current: bool


class AppSettingsOut(BaseModel):
    anniversary: date | None


class AppSettingsPatch(BaseModel):
    anniversary: date | None = None


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(max_length=1000)
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(max_length=1000)


class PushTestOut(BaseModel):
    sent: int
    failed: int
    removed: int


class IcsOut(BaseModel):
    path: str
