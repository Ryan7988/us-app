from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


# API 輸出統一為 UTC ISO 8601，結尾 Z
UTCDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]
