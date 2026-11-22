"""AI 出題：本地 Ollama 產生扭蛋卡 → Pydantic 驗證 → embedding 去重複 → 待審核。

只在批次時使用（每月 20 號或後台手動），不在抽卡當下呼叫，所以模型慢、只用 CPU 都沒關係。
"""

import json
import math
from typing import Any, Literal

import httpx
import structlog
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.models import GachaCard, WishItem

log = structlog.get_logger()
SIMILARITY_THRESHOLD = 0.88


class AICard(BaseModel):
    content: str = Field(min_length=4, max_length=120)
    rarity: Literal["SSR", "SR", "R"]
    reason: str = Field(default="", max_length=300)


class AIResponse(BaseModel):
    cards: list[AICard] = Field(min_length=1, max_length=30)


class AIUnavailable(Exception):
    pass


SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "rarity": {"type": "string", "enum": ["SSR", "SR", "R"]},
                    "reason": {"type": "string"},
                },
                "required": ["content", "rarity", "reason"],
            },
        }
    },
    "required": ["cards"],
}

SYSTEM_PROMPT = """你是一對台灣情侶的約會任務出題者。他們住在桃園，是研究生，預算有限但很有創意。
請產生「一個月內做得到」的情侶任務，每張卡一句話，具體、可執行、有趣、溫暖，使用繁體中文（台灣用語）。

稀有度規則：
- R：日常、免費或低成本，一個晚上就能完成（例如：一起煮一道沒做過的菜、交換寫一封手寫信）
- SR：需要安排半天或需要一些預算（例如：去一個沒去過的縣市一日遊、一起上一堂體驗課）
- SSR：需要提前規劃的大事（例如：兩天一夜的小旅行、一起完成一件作品並送給對方）

比例大約是 R 60%、SR 30%、SSR 10%。不要出危險、違法、花費過高（單次超過一萬元）或令人尷尬的題目。
不要和「已經有的題目」重複或太相似。只回傳 JSON。"""


def _client() -> httpx.Client:
    return httpx.Client(base_url=get_settings().ollama_url, timeout=httpx.Timeout(600, connect=5))


def ollama_status() -> dict[str, Any]:
    try:
        with httpx.Client(base_url=get_settings().ollama_url, timeout=3) as c:
            r = c.get("/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
    except Exception as e:
        return {"reachable": False, "models": [], "error": type(e).__name__}
    cfg = get_settings()

    def has(name):
        return any(m == name or m.startswith(name + ":") or m.split(":")[0] == name for m in models)  # noqa: E731

    return {
        "reachable": True,
        "models": models,
        "chat_model_ready": has(cfg.ollama_model),
        "embed_model_ready": has(cfg.ollama_embed_model),
    }


def pull_models() -> dict[str, str]:
    """後台按「下載 AI 模型」：呼叫 Ollama 的 pull API（不用下指令）。"""
    cfg = get_settings()
    out = {}
    with _client() as c:
        for m in (cfg.ollama_model, cfg.ollama_embed_model):
            try:
                r = c.post("/api/pull", json={"model": m, "stream": False}, timeout=3600)
                out[m] = "ok" if r.status_code == 200 else f"HTTP {r.status_code}"
            except Exception as e:
                out[m] = type(e).__name__
    return out


def _chat(prompt: str) -> str:
    cfg = get_settings()
    with _client() as c:
        r = c.post(
            "/api/chat",
            json={
                "model": cfg.ollama_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "format": SCHEMA,
                "stream": False,
                "options": {"temperature": 0.9},
            },
        )
        r.raise_for_status()
        return str(r.json()["message"]["content"])


def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    with _client() as c:
        r = c.post("/api/embed", json={"model": get_settings().ollama_embed_model, "input": texts})
        r.raise_for_status()
        return [list(map(float, v)) for v in r.json()["embeddings"]]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def build_prompt(n: int, existing: list[str], wishes: list[str]) -> str:
    parts = [f"請產生 {n} 張新的任務卡。"]
    if existing:
        parts.append("已經有的題目（不要重複）：\n" + "\n".join(f"- {t}" for t in existing[:80]))
    if wishes:
        parts.append(
            "他們願望清單裡的事（可以參考，但不要直接照抄）：\n"
            + "\n".join(f"- {t}" for t in wishes[:40])
        )
    return "\n\n".join(parts)


def request_cards(prompt: str, retries: int = 3) -> list[AICard]:
    """結構化輸出 + Pydantic 驗證，失敗自動重試最多 3 次。"""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            raw = _chat(prompt)
            return AIResponse.model_validate(json.loads(raw)).cards
        except (json.JSONDecodeError, ValidationError, KeyError) as e:
            last = e
            log.warning("ai_invalid_output", attempt=attempt + 1, error=str(e)[:200])
        except httpx.HTTPError as e:
            raise AIUnavailable(f"連不到 Ollama：{type(e).__name__}") from e
    raise AIUnavailable(f"AI 回傳格式錯誤（重試 {retries} 次）：{last}")


def generate_cards(session: Session, n: int = 10) -> list[GachaCard]:
    existing_cards = list(
        session.exec(select(GachaCard).where(GachaCard.status != "archived")).all()
    )
    archived = list(session.exec(select(GachaCard).where(GachaCard.status == "archived")).all())
    wishes = [
        w.title
        for w in session.exec(select(WishItem).where(col(WishItem.deleted_at).is_(None))).all()
    ]
    cards = request_cards(build_prompt(n, [c.content for c in existing_cards], wishes))

    # 去重複：與現有卡片（含被拒絕的）cosine similarity > 0.88 就丟棄
    compare = existing_cards + archived
    missing = [c for c in compare if not c.embedding]
    try:
        for c, emb in zip(missing, embed([c.content for c in missing]), strict=True):
            c.embedding = emb
            session.add(c)
        new_vecs = embed([c.content for c in cards])
    except httpx.HTTPError as e:
        log.warning("ai_embed_unavailable", error=type(e).__name__)
        new_vecs = []

    accepted: list[GachaCard] = []
    known: list[list[float]] = [c.embedding for c in compare if c.embedding]
    seen_text = {c.content.strip() for c in compare}
    for i, card in enumerate(cards):
        vec = new_vecs[i] if i < len(new_vecs) else None
        if card.content.strip() in seen_text:
            continue
        if vec and any(cosine(vec, k) > SIMILARITY_THRESHOLD for k in known):
            continue
        gc = GachaCard(
            content=card.content.strip(),
            rarity=card.rarity,
            reason=card.reason or None,
            source="ai",
            status="pending_review",
            embedding=vec,
        )
        session.add(gc)
        accepted.append(gc)
        seen_text.add(gc.content)
        if vec:
            known.append(vec)
    session.commit()
    log.info("ai_cards_generated", requested=n, returned=len(cards), accepted=len(accepted))
    return accepted
