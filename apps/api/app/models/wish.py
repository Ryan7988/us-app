from datetime import datetime

from sqlmodel import Field

from app.models.base import TimestampMixin, new_id


class WishItem(TimestampMixin, table=True):
    __tablename__ = "wish_items"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    title: str = Field(max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    url: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, index=True, max_length=32)
    cover_photo_id: str | None = Field(default=None, max_length=36)  # P4 相簿上線後接 photos
    created_by: str = Field(foreign_key="users.id", max_length=36)
    done_at: datetime | None = None
    done_by: str | None = Field(default=None, foreign_key="users.id", max_length=36)
    deleted_at: datetime | None = Field(default=None, index=True)
