from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_id

DEFAULT_RARITY_WEIGHTS = {"SSR": 0.08, "SR": 0.27, "R": 0.65}
DEFAULT_SOURCE_WEIGHTS = {"custom": 2.0, "ai": 1.0}


class GachaCard(TimestampMixin, table=True):
    __tablename__ = "gacha_cards"
    __table_args__ = (Index("ix_gacha_cards_status_rarity", "status", "rarity"),)

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    content: str = Field(max_length=300)
    rarity: str = Field(max_length=3)  # SSR / SR / R
    source: str = Field(default="custom", max_length=8)  # custom / ai
    # pending_review / active / drawn / archived
    status: str = Field(default="active", max_length=16)
    repeatable: bool = False
    reason: str | None = Field(default=None, max_length=500)  # AI 給的理由
    created_by: str | None = Field(default=None, foreign_key="users.id", max_length=36)
    approved_by: str | None = Field(default=None, foreign_key="users.id", max_length=36)
    embedding: list[float] | None = Field(default=None, sa_column=Column(JSON))


class GachaSettings(SQLModel, table=True):
    __tablename__ = "gacha_settings"

    id: int = Field(default=1, primary_key=True)
    rarity_weights: dict[str, float] = Field(
        default_factory=lambda: dict(DEFAULT_RARITY_WEIGHTS), sa_column=Column(JSON, nullable=False)
    )
    source_weights: dict[str, float] = Field(
        default_factory=lambda: dict(DEFAULT_SOURCE_WEIGHTS), sa_column=Column(JSON, nullable=False)
    )
    pity_threshold: int = 6
    ai_min_pool: int = 20
    # 每月可重抽次數（雙方都同意才會重抽）
    rerolls_per_month: int = 1


class GachaDraw(TimestampMixin, table=True):
    __tablename__ = "gacha_draws"

    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    period: str = Field(unique=True, max_length=7)  # 2026-12
    card_id: str | None = Field(default=None, max_length=36)
    card_content: str | None = Field(default=None, max_length=300)
    rarity: str | None = Field(default=None, max_length=3)
    pity_triggered: bool = False
    rng_value: list[float] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    pool_snapshot: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    ready_users: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    drawn_at: datetime | None = None
    # waiting / drawn / done / failed
    status: str = Field(default="waiting", max_length=8)
    proof_photo_id: str | None = Field(default=None, max_length=36)
    completed_at: datetime | None = None
    # 重抽：一方提議 → 另一方同意才重抽；換掉的卡留紀錄
    reroll_requested_by: str | None = Field(default=None, max_length=36)
    reroll_reason: str | None = Field(default=None, max_length=200)
    reroll_count: int = 0
    rerolled_cards: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
