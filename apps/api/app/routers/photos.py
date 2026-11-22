import hashlib
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile, status
from sqlmodel import Session, col, func, select

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import AlbumPhoto, Photo, PhotoLink
from app.schemas.media import LinkIn, PhotoOut, PhotoPage, UploadResult
from app.services import notify
from app.services.media import (
    UnsupportedImage,
    display_url,
    original_url,
    process,
    rel_dir,
    thumb_url,
    write_file,
)
from app.services.people import partner_id
from app.services.push import PushMessage

router = APIRouter(prefix="/photos", tags=["photos"])


def photo_out(p: Photo) -> PhotoOut:
    return PhotoOut(
        id=p.id,
        uploader_id=p.uploader_id,
        width=p.width,
        height=p.height,
        taken_at=p.taken_at,
        created_at=p.created_at,
        mime=p.mime,
        size_bytes=p.size_bytes,
        thumb_url=thumb_url(p),
        display_url=display_url(p),
        original_url=original_url(p),
    )


def _get(session: Session, photo_id: str) -> Photo:
    p = session.get(Photo, photo_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到照片")
    return p


def link_photo(session: Session, photo_id: str, ref_type: str, ref_id: str) -> None:
    if session.get(PhotoLink, (photo_id, ref_type, ref_id)) is None:
        session.add(PhotoLink(photo_id=photo_id, ref_type=ref_type, ref_id=ref_id))


@router.post("", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload(
    user: CurrentUser,
    session: SessionDep,
    bg: BackgroundTasks,
    files: Annotated[list[UploadFile], File()],
    album_id: Annotated[str | None, Form()] = None,
) -> UploadResult:
    """多張上傳（HEIC / JPEG / PNG），伺服器產生縮圖；sha256 相同視為重複，直接回傳既有照片。"""
    limit = get_settings().max_upload_mb * 1024 * 1024
    saved: list[Photo] = []
    errors: list[str] = []
    dup = 0
    for f in files[:50]:
        name = f.filename or "photo"
        data = await f.read(limit + 1)
        if len(data) > limit:
            errors.append(f"{name}：超過 {get_settings().max_upload_mb} MB")
            continue
        digest = hashlib.sha256(data).hexdigest()
        existing = session.exec(select(Photo).where(Photo.sha256 == digest)).first()
        if existing:
            if existing.deleted_at is not None:  # 刪掉後重新上傳 = 救回
                existing.deleted_at = None
                session.add(existing)
            dup += 1
            saved.append(existing)
            continue
        try:
            p = process(data)
        except UnsupportedImage as e:
            errors.append(f"{name}：{e}")
            continue
        photo = Photo(
            uploader_id=user.id,
            original_path="",
            display_path="",
            thumb_path="",
            mime=p.mime,
            width=p.width,
            height=p.height,
            taken_at=p.taken_at,
            sha256=digest,
            size_bytes=len(data),
        )
        d = rel_dir(p.taken_at)
        photo.original_path = f"{d}/{photo.id}.{p.ext}"  # 檔名一律用 UUID
        photo.display_path = f"{d}/{photo.id}.jpg"
        photo.thumb_path = f"{d}/{photo.id}.jpg"
        write_file("originals", photo.original_path, data)
        write_file("display", photo.display_path, p.display)
        write_file("thumbs", photo.thumb_path, p.thumb)
        session.add(photo)
        session.commit()
        saved.append(photo)

    if album_id:
        max_order = (
            session.exec(
                select(func.max(AlbumPhoto.sort_order)).where(AlbumPhoto.album_id == album_id)
            ).one()
            or 0
        )
        for i, photo in enumerate(saved):
            if session.get(AlbumPhoto, (album_id, photo.id)) is None:
                session.add(
                    AlbumPhoto(album_id=album_id, photo_id=photo.id, sort_order=max_order + i + 1)
                )
    session.commit()
    new_count = len(saved) - dup
    if new_count:
        notify.ws(bg, "photo.added", {"count": new_count, "by": user.id})
        notify.push(
            bg,
            [partner_id(session, user.id)],
            PushMessage(
                f"📷 {user.display_name} 上傳了 {new_count} 張照片", "", "/more/album", tag="photos"
            ),
        )
    for photo in saved:
        session.refresh(photo)
    return UploadResult(photos=[photo_out(x) for x in saved], duplicates=dup, errors=errors)


@router.get("", response_model=PhotoPage)
def list_photos(
    _: CurrentUser,
    session: SessionDep,
    cursor: str | None = None,
    limit: int = Query(default=60, ge=1, le=200),
    album_id: str | None = None,
    ref_type: str | None = None,
    ref_id: str | None = None,
) -> PhotoPage:
    """依拍攝時間新到舊；cursor 分頁（"<taken_at 微秒>_<id>"，URL 安全）。"""
    q = select(Photo).where(col(Photo.deleted_at).is_(None))
    if album_id:
        q = q.join(AlbumPhoto, col(AlbumPhoto.photo_id) == col(Photo.id)).where(
            AlbumPhoto.album_id == album_id
        )
    if ref_type and ref_id:
        q = q.join(PhotoLink, col(PhotoLink.photo_id) == col(Photo.id)).where(
            PhotoLink.ref_type == ref_type, PhotoLink.ref_id == ref_id
        )
    if cursor:
        try:
            ts, cid = cursor.split("_", 1)
            t = datetime.fromtimestamp(int(ts) / 1_000_000, tz=UTC)
        except (ValueError, OverflowError) as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "cursor 不正確") from e
        q = q.where(
            (col(Photo.taken_at) < t) | ((col(Photo.taken_at) == t) & (col(Photo.id) < cid))
        )
    rows = session.exec(
        q.order_by(col(Photo.taken_at).desc(), col(Photo.id).desc()).limit(limit + 1)
    ).all()
    nxt = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        nxt = f"{round(last.taken_at.timestamp() * 1_000_000)}_{last.id}"
    return PhotoPage(items=[photo_out(p) for p in rows], next_cursor=nxt)


@router.get("/{photo_id}", response_model=PhotoOut)
def get_photo(photo_id: str, _: CurrentUser, session: SessionDep) -> PhotoOut:
    return photo_out(_get(session, photo_id))


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: str, _: CurrentUser, session: SessionDep, bg: BackgroundTasks) -> None:
    """軟刪除：檔案保留，誤刪重新上傳同一張就會救回。"""
    p = _get(session, photo_id)
    p.deleted_at = utcnow()
    session.add(p)
    session.commit()
    notify.ws(bg, "photo.added", {"deleted": photo_id})


@router.post("/{photo_id}/links", status_code=status.HTTP_204_NO_CONTENT)
def add_link(photo_id: str, body: LinkIn, _: CurrentUser, session: SessionDep) -> None:
    _get(session, photo_id)
    link_photo(session, photo_id, body.ref_type, body.ref_id)
    session.commit()
