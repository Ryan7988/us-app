import io

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()


def jpeg(
    w: int = 4032,
    h: int = 3024,
    color: str = "red",
    taken: str | None = "2025:08:15 14:30:00",
    orientation: int | None = None,
) -> bytes:
    img = Image.new("RGB", (w, h), color)
    exif = Image.Exif()
    if taken:
        exif.get_ifd(0x8769)[36867] = taken
    if orientation:
        exif[274] = orientation
    b = io.BytesIO()
    img.save(b, "JPEG", exif=exif.tobytes(), quality=70)
    return b.getvalue()


def png(color: str = "blue") -> bytes:
    b = io.BytesIO()
    Image.new("RGBA", (300, 200), color).save(b, "PNG")
    return b.getvalue()


def heic(color: str = "green") -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (800, 600), color).save(b, "HEIF")
    return b.getvalue()
