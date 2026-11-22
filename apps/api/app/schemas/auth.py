from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str
    color: str
    avatar_path: str | None
    is_admin: bool
    location_sharing: bool = False


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=200)
    device_name: str | None = Field(default=None, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic


class SetupUser(BaseModel):
    username: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=8, max_length=200)
    color: str = Field(default="#f472b6", pattern=r"^#[0-9a-fA-F]{6}$")


class SetupRequest(BaseModel):
    users: list[SetupUser] = Field(min_length=2, max_length=2)


class SetupStatus(BaseModel):
    needs_setup: bool
