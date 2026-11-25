from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import UTCDateTime

Rarity = Literal["SSR", "SR", "R"]


class CardIn(BaseModel):
    content: str = Field(min_length=1, max_length=300)
    rarity: Rarity
    repeatable: bool = False


class CardPatch(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=300)
    rarity: Rarity | None = None
    repeatable: bool | None = None
    status: Literal["active", "archived"] | None = None


class CardOut(BaseModel):
    id: str
    content: str
    rarity: str
    source: str
    status: str
    repeatable: bool
    reason: str | None
    created_by: str | None
    approved_by: str | None
    created_at: UTCDateTime


class RerolledCard(BaseModel):
    card_id: str
    content: str | None
    rarity: str | None
    requested_by: str | None
    agreed_by: str | None
    reason: str | None
    at: str


class RerollRequestIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


class RerollRespondIn(BaseModel):
    accept: bool


class DrawOut(BaseModel):
    id: str
    period: str
    status: str
    ready_users: list[str]
    card_id: str | None
    card_content: str | None
    rarity: str | None
    pity_triggered: bool
    drawn_at: UTCDateTime | None
    proof_photo_id: str | None
    proof_thumb_url: str | None = None
    completed_at: UTCDateTime | None
    reroll_requested_by: str | None = None
    reroll_reason: str | None = None
    reroll_count: int = 0
    rerolls_left: int = 0
    rerolled_cards: list[RerolledCard] = []


class CurrentOut(BaseModel):
    draw: DrawOut
    streak: int
    misses_since_ssr: int
    pity_threshold: int
    pool_counts: dict[str, int]
    pending_review: int


class CompleteIn(BaseModel):
    photo_id: str


class GachaSettingsIO(BaseModel):
    rarity_weights: dict[Rarity, float]
    source_weights: dict[Literal["custom", "ai"], float]
    pity_threshold: int = Field(ge=0, le=50)
    ai_min_pool: int = Field(ge=0, le=500)
    rerolls_per_month: int = Field(default=1, ge=0, le=5)

    @model_validator(mode="after")
    def _check(self) -> "GachaSettingsIO":
        if set(self.rarity_weights) != {"SSR", "SR", "R"}:
            raise ValueError("三種稀有度都要設定")
        if any(v < 0 for v in self.rarity_weights.values()):
            raise ValueError("機率不能是負數")
        if abs(sum(self.rarity_weights.values()) - 1) > 0.001:
            raise ValueError("稀有度機率加總必須是 1")
        if any(v <= 0 for v in self.source_weights.values()):
            raise ValueError("來源權重必須大於 0")
        return self


class SimulateOut(BaseModel):
    n: int
    rarity: dict[str, float]
    source: dict[str, float]
    pity_rate: float
