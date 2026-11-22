from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_version: str = "0.1.0"
    tz: str = "Asia/Taipei"
    database_url: str = "sqlite:///./data/db/app.sqlite3"

    jwt_secret: str = "dev-insecure-change-me-dev-insecure-change-me-0000000000000000"
    access_token_minutes: int = 15
    refresh_token_days: int = 90
    # 正式環境走 HTTPS（Tailscale），本機開發用 http://localhost 時可設 false
    cookie_secure: bool = True

    media_signing_key: str = "dev-insecure-media-key"
    login_rate_limit_per_minute: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
