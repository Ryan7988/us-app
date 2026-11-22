"""照片處理與簽章 URL。

檔案結構（data/media）：
  originals/YYYY/MM/<id>.<ext>   原圖，原封不動（唯一需要備份的）
  display/YYYY/MM/<id>.jpg       最長邊 2048 的 JPEG（所有瀏覽器都能顯示，含 HEIC 轉檔）
  thumbs/YYYY/MM/<id>.jpg        最長邊 512 的縮圖（列表頁只載入這個）
"""

import hashlib
import hmac
import io
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pillow_heif
from PIL import Image, ImageOps

from app.core.config import get_settings
from app.core.time import TAIPEI, utcnow
from app.models import Photo

pillow_heif.register_heif_opener()

DISPLAY_MAX = 2048
THUMB_MAX = 512
WEEK = 7 * 86400
HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heim", b"heis"}


class UnsupportedImage(Exception):
    pass


def media_root() -> Path:
    return Path(get_settings().media_root)


def sniff(data: bytes) -> tuple[str, str]:
    """用 magic bytes 判斷格式（不信任副檔名）。回傳 (mime, ext)。"""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    if data[4:8] == b"ftyp" and data[8:12] in HEIF_BRANDS:
        return "image/heic", "heic"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    raise UnsupportedImage("只支援 HEIC / JPEG / PNG / WebP")


def _exif_taken_at(img: Image.Image) -> datetime | None:
    try:
        exif = img.getexif()
        sub = exif.get_ifd(0x8769)
        raw = sub.get(36867) or sub.get(36868) or exif.get(306)
        if not raw:
            return None
        dt = datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S")
        offset = sub.get(36881)  # OffsetTimeOriginal，例如 "+08:00"
        if offset:
            return datetime.fromisoformat(dt.isoformat() + str(offset).strip("\x00 ")).astimezone(
                UTC
            )
        return dt.replace(tzinfo=TAIPEI).astimezone(UTC)  # 沒有時區資訊就當台灣時間
    except Exception:
        return None


def _to_jpeg(img: Image.Image, max_side: int, quality: int) -> bytes:
    im = img.copy()
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    if im.mode not in ("RGB", "L"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


@dataclass
class Processed:
    mime: str
    ext: str
    width: int
    height: int
    taken_at: datetime
    display: bytes
    thumb: bytes


def process(data: bytes) -> Processed:
    mime, ext = sniff(data)
    try:
        img: Image.Image = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise UnsupportedImage("圖片無法讀取（檔案可能損壞）") from e
    taken = _exif_taken_at(img) or utcnow()
    img = ImageOps.exif_transpose(img) or img
    return Processed(
        mime=mime,
        ext=ext,
        width=img.width,
        height=img.height,
        taken_at=taken,
        display=_to_jpeg(img, DISPLAY_MAX, 85),
        thumb=_to_jpeg(img, THUMB_MAX, 78),
    )


def rel_dir(taken_at: datetime) -> str:
    t = taken_at.astimezone(TAIPEI)
    return f"{t:%Y}/{t:%m}"


def write_file(kind: str, rel: str, data: bytes) -> None:
    path = media_root() / kind / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def rebuild_derivatives(photo: Photo) -> bool:
    """還原備份後縮圖不見時，從原圖重新產生。"""
    root = media_root()
    if (root / "thumbs" / photo.thumb_path).exists() and (
        root / "display" / photo.display_path
    ).exists():
        return False
    p = process((root / "originals" / photo.original_path).read_bytes())
    write_file("display", photo.display_path, p.display)
    write_file("thumbs", photo.thumb_path, p.thumb)
    return True


# ---- 簽章 URL ----
def _sig(path: str, exp: int) -> str:
    key = get_settings().media_signing_key.encode()
    return hmac.new(key, f"{path}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def sign(path: str, now: float | None = None) -> str:
    """到期時間以「週」為單位對齊：同一週內 URL 不變，Service Worker 的縮圖快取才有用。"""
    t = int(now if now is not None else time.time())
    exp = (t // WEEK) * WEEK + 2 * WEEK
    return f"/media/{path}?exp={exp}&sig={_sig(path, exp)}"


def verify_uri(uri: str, now: float | None = None) -> bool:
    parts = urlsplit(uri)
    if not parts.path.startswith("/media/"):
        return False
    path = parts.path.removeprefix("/media/")
    if ".." in path.split("/") or path.split("/")[0] not in ("thumbs", "display", "originals"):
        return False
    q = parse_qs(parts.query)
    try:
        exp = int(q["exp"][0])
        sig = q["sig"][0]
    except (KeyError, ValueError, IndexError):
        return False
    if exp < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(sig, _sig(path, exp))


def thumb_url(p: Photo) -> str:
    return sign(f"thumbs/{p.thumb_path}")


def display_url(p: Photo) -> str:
    return sign(f"display/{p.display_path}")


def original_url(p: Photo) -> str:
    return sign(f"originals/{p.original_path}")
