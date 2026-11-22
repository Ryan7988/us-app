from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from dateutil.rrule import rrulestr

from app.core.time import TAIPEI
from app.models import Event

MAX_OCCURRENCES = 500


@dataclass
class Occurrence:
    event: Event
    start: datetime
    end: datetime


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def validate_rrule(rule: str) -> None:
    """不合法會丟 ValueError。"""
    rrulestr(rule, dtstart=datetime(2026, 1, 1))


def expand(events: Iterable[Event], start: datetime, end: datetime) -> list[Occurrence]:
    """把重複規則展開成 [start, end) 區間內的每一次。重複是以台北當地時間計算（每週同一時刻）。"""
    out: list[Occurrence] = []
    for ev in events:
        ev_start, ev_end = _aware(ev.start_at), _aware(ev.end_at)
        duration = ev_end - ev_start
        if not ev.rrule:
            if ev_start < end and ev_end > start:
                out.append(Occurrence(ev, ev_start, ev_end))
            continue
        local_start = ev_start.astimezone(TAIPEI).replace(tzinfo=None)
        rule = rrulestr(ev.rrule, dtstart=local_start)
        lo = (start - duration).astimezone(TAIPEI).replace(tzinfo=None)
        hi = end.astimezone(TAIPEI).replace(tzinfo=None)
        for i, occ in enumerate(rule.between(lo, hi, inc=True)):  # type: ignore[union-attr]
            if i >= MAX_OCCURRENCES:
                break
            s = occ.replace(tzinfo=TAIPEI).astimezone(UTC)
            e = s + duration
            if s < end and e > start:
                out.append(Occurrence(ev, s, e))
    out.sort(key=lambda o: (o.start, o.event.id))
    return out


# ---- 邀請函狀態機 ----
INVITATION_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"accepted", "declined", "countered", "expired"},
    "accepted": set(),
    "declined": set(),
    "countered": set(),
    "expired": set(),
}


class InvalidTransition(Exception):
    pass


def check_transition(current: str, target: str) -> None:
    if target not in INVITATION_TRANSITIONS.get(current, set()):
        raise InvalidTransition(f"邀請函無法從「{current}」變成「{target}」")


def invitation_expiry(slots: list[dict[str, str]], now: datetime) -> datetime:
    """最早的候選時間開始時就過期；最多 14 天。"""
    starts = [_aware(datetime.fromisoformat(s["start_at"])) for s in slots]
    return min([*starts, now + timedelta(days=14)])


# ---- .ics ----
def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545：每行最多 75 bytes。"""
    out, cur = [], b""
    for ch in line:
        b = ch.encode()
        if len(cur) + len(b) > 73:
            out.append(cur.decode())
            cur = b" "
        cur += b
    out.append(cur.decode())
    return "\r\n".join(out)


def _fmt_utc(dt: datetime) -> str:
    return _aware(dt).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _fmt_date(dt: datetime) -> str:
    return _aware(dt).astimezone(TAIPEI).strftime("%Y%m%d")


def build_ics(events: Iterable[Event], cal_name: str, owner_names: dict[str | None, str]) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//us-app//calendar//ZH-TW",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_ics_escape(cal_name)}",
        "X-WR-TIMEZONE:Asia/Taipei",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ]
    now = _fmt_utc(datetime.now(UTC))
    for ev in events:
        prefix = owner_names.get(ev.owner_id, "")
        lines += ["BEGIN:VEVENT", f"UID:{ev.id}@us-app", f"DTSTAMP:{now}"]
        if ev.all_day:
            lines += [
                f"DTSTART;VALUE=DATE:{_fmt_date(ev.start_at)}",
                f"DTEND;VALUE=DATE:{_fmt_date(ev.end_at)}",
            ]
        else:
            lines += [f"DTSTART:{_fmt_utc(ev.start_at)}", f"DTEND:{_fmt_utc(ev.end_at)}"]
        lines.append(f"SUMMARY:{_ics_escape(prefix + ev.title)}")
        if ev.rrule:
            lines.append(f"RRULE:{ev.rrule}")
        if ev.location:
            lines.append(f"LOCATION:{_ics_escape(ev.location)}")
        if ev.note:
            lines.append(f"DESCRIPTION:{_ics_escape(ev.note)}")
        if ev.remind_minutes is not None:
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{_ics_escape(ev.title)}",
                f"TRIGGER:-PT{ev.remind_minutes}M",
                "END:VALARM",
            ]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
