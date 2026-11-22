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

    # Web Push：留空會在第一次啟動時自動產生並存進資料庫
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:us-app@example.com"

    media_root: str = "./data/media"
    max_upload_mb: int = 30
    backup_status_dir: str = "./data/backup-status"

    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:7b"
    ollama_embed_model: str = "bge-m3"


@lru_cache
def get_settings() -> Settings:
    return Settings()
