from pydantic import BaseModel, Field, HttpUrl

from app.schemas.common import UTCDateTime


class WishCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    url: HttpUrl | None = None
    category: str | None = Field(default=None, max_length=32)


class WishUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    url: HttpUrl | None = None
    category: str | None = Field(default=None, max_length=32)


class WishComplete(BaseModel):
    done: bool = True  # false = 取消完成


class WishOut(BaseModel):
    id: str
    title: str
    note: str | None
    url: str | None
    category: str | None
    cover_photo_id: str | None
    created_by: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
    done_at: UTCDateTime | None
    done_by: str | None
