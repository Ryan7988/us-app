import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlmodel import Session

from app.core.config import get_settings
from app.core.time import utcnow
from app.models import AppSettings, GachaSettings


def get_app_settings(session: Session) -> AppSettings:
    s = session.get(AppSettings, 1)
    if s is None:
        s = AppSettings(id=1)
        session.add(s)
        session.commit()
        session.refresh(s)
    return s


def get_gacha_settings(session: Session) -> GachaSettings:
    s = session.get(GachaSettings, 1)
    if s is None:
        s = GachaSettings(id=1)
        session.add(s)
        session.commit()
        session.refresh(s)
    return s


def _generate_vapid() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    raw_pub = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode(), pem


def ensure_vapid(session: Session) -> tuple[str, str]:
    """VAPID 金鑰：.env 有設就用 .env；否則第一次啟動自動產生並存進資料庫（跟著 data/ 搬家）。"""
    cfg = get_settings()
    if cfg.vapid_public_key and cfg.vapid_private_key:
        return cfg.vapid_public_key, cfg.vapid_private_key
    s = get_app_settings(session)
    if not (s.vapid_public_key and s.vapid_private_pem):
        s.vapid_public_key, s.vapid_private_pem = _generate_vapid()
        s.updated_at = utcnow()
        session.add(s)
        session.commit()
    assert s.vapid_public_key and s.vapid_private_pem
    return s.vapid_public_key, s.vapid_private_pem


def record_job_run(session: Session, job: str, ok: bool = True, message: str = "") -> None:
    s = get_app_settings(session)
    runs = dict(s.job_runs or {})
    runs[job] = {"at": utcnow().isoformat(), "ok": ok, "message": message[:300]}
    s.job_runs = runs
    session.add(s)
    session.commit()
