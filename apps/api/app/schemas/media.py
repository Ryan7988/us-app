from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class PhotoOut(BaseModel):
    id: str
    uploader_id: str
    width: int
    height: int
    taken_at: UTCDateTime
    created_at: UTCDateTime
    mime: str
    size_bytes: int
    thumb_url: str
    display_url: str
    original_url: str


class UploadResult(BaseModel):
    photos: list[PhotoOut]
    duplicates: int
    errors: list[str]


class PhotoPage(BaseModel):
    items: list[PhotoOut]
    next_cursor: str | None


class LinkIn(BaseModel):
    ref_type: Literal["wish", "event", "draw"]
    ref_id: str = Field(max_length=36)


class AlbumIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None


class AlbumPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    cover_photo_id: str | None = None


class AlbumOut(BaseModel):
    id: str
    title: str
    start_date: date | None
    end_date: date | None
    cover_photo_id: str | None
    cover_url: str | None
    photo_count: int
    created_at: UTCDateTime


class AlbumPhotosIn(BaseModel):
    photo_ids: list[str] = Field(max_length=2000)
