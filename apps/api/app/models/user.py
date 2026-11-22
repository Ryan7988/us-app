from datetime import datetime

from sqlmodel import Field

from app.models.base import TimestampMixin, new_id


class User(TimestampMixin, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    username: str = Field(index=True, unique=True, max_length=32)
    display_name: str = Field(max_length=32)
    password_hash: str
    avatar_path: str | None = None
    color: str = Field(default="#f472b6", max_length=16)
    is_admin: bool = True


class RefreshToken(TimestampMixin, table=True):
    __tablename__ = "refresh_tokens"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    user_id: str = Field(foreign_key="users.id", index=True, max_length=36)
    token_hash: str = Field(index=True, unique=True, max_length=64)
    device_name: str | None = Field(default=None, max_length=200)
    expires_at: datetime
    revoked_at: datetime | None = None
