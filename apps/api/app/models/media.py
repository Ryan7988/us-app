from datetime import date, datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.core.time import utcnow
from app.models.base import TimestampMixin, new_id


class Photo(TimestampMixin, table=True):
    __tablename__ = "photos"
    __table_args__ = (Index("ix_photos_taken", "taken_at", "id"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    uploader_id: str = Field(foreign_key="users.id", max_length=36)
    original_path: str = Field(max_length=300)  # 相對 data/media/originals
    display_path: str = Field(max_length=300)  # 相對 data/media/display（JPEG，所有瀏覽器可看）
    thumb_path: str = Field(max_length=300)  # 相對 data/media/thumbs
    mime: str = Field(max_length=50)
    width: int
    height: int
    taken_at: datetime
    sha256: str = Field(unique=True, max_length=64)
    size_bytes: int
    deleted_at: datetime | None = None


class Album(TimestampMixin, table=True):
    __tablename__ = "albums"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    title: str = Field(max_length=100)
    cover_photo_id: str | None = Field(default=None, max_length=36)
    start_date: date | None = None
    end_date: date | None = None
    created_by: str = Field(foreign_key="users.id", max_length=36)


class AlbumPhoto(SQLModel, table=True):
    __tablename__ = "album_photos"

    album_id: str = Field(foreign_key="albums.id", primary_key=True, max_length=36)
    photo_id: str = Field(foreign_key="photos.id", primary_key=True, max_length=36)
    sort_order: int = 0


class PhotoLink(SQLModel, table=True):
    """照片關聯到願望 / 行程 / 扭蛋，形成「回憶」。"""

    __tablename__ = "photo_links"
    __table_args__ = (Index("ix_photo_links_ref", "ref_type", "ref_id"),)

    photo_id: str = Field(foreign_key="photos.id", primary_key=True, max_length=36)
    ref_type: str = Field(primary_key=True, max_length=8)  # wish / event / draw
    ref_id: str = Field(primary_key=True, max_length=36)
    created_at: datetime = Field(default_factory=utcnow)


class Location(SQLModel, table=True):
    __tablename__ = "locations"
    __table_args__ = (Index("ix_locations_user_time", "user_id", "recorded_at"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    user_id: str = Field(foreign_key="users.id", max_length=36)
    lat: float
    lng: float
    accuracy_m: float | None = None
    message: str | None = Field(default=None, max_length=200)
    kind: str = Field(default="auto", max_length=8)  # auto / checkin
    recorded_at: datetime = Field(default_factory=utcnow)
