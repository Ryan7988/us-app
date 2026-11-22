from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlmodel import col, delete, func, select

from app.core.deps import CurrentUser, SessionDep
from app.core.time import utcnow
from app.models import Album, AlbumPhoto, Photo
from app.schemas.media import AlbumIn, AlbumOut, AlbumPatch, AlbumPhotosIn
from app.services import notify
from app.services.media import thumb_url

router = APIRouter(prefix="/albums", tags=["albums"])


def _out(session: SessionDep, a: Album) -> AlbumOut:
    count = session.exec(
        select(func.count())
        .select_from(AlbumPhoto)
        .join(Photo, col(Photo.id) == col(AlbumPhoto.photo_id))
        .where(AlbumPhoto.album_id == a.id, col(Photo.deleted_at).is_(None))
    ).one()
    cover = session.get(Photo, a.cover_photo_id) if a.cover_photo_id else None
    if cover is None or cover.deleted_at is not None:
        cover = session.exec(
            select(Photo)
            .join(AlbumPhoto, col(AlbumPhoto.photo_id) == col(Photo.id))
            .where(AlbumPhoto.album_id == a.id, col(Photo.deleted_at).is_(None))
            .order_by(col(Photo.taken_at))
        ).first()
    return AlbumOut(
        id=a.id,
        title=a.title,
        start_date=a.start_date,
        end_date=a.end_date,
        cover_photo_id=a.cover_photo_id,
        cover_url=thumb_url(cover) if cover else None,
        photo_count=count,
        created_at=a.created_at,
    )


def _get(session: SessionDep, album_id: str) -> Album:
    a = session.get(Album, album_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到相簿")
    return a


@router.get("", response_model=list[AlbumOut])
def list_albums(_: CurrentUser, session: SessionDep):
    albums = session.exec(select(Album).order_by(col(Album.created_at).desc())).all()
    return [_out(session, a) for a in albums]


@router.post("", response_model=AlbumOut, status_code=status.HTTP_201_CREATED)
def create_album(body: AlbumIn, user: CurrentUser, session: SessionDep, bg: BackgroundTasks):
    a = Album(**body.model_dump(), created_by=user.id)
    session.add(a)
    session.commit()
    session.refresh(a)
    notify.ws(bg, "photo.added", {"album": a.id})
    return _out(session, a)


@router.patch("/{album_id}", response_model=AlbumOut)
def update_album(album_id: str, body: AlbumPatch, _: CurrentUser, session: SessionDep):
    a = _get(session, album_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    a.updated_at = utcnow()
    session.add(a)
    session.commit()
    session.refresh(a)
    return _out(session, a)


@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(album_id: str, _: CurrentUser, session: SessionDep) -> None:
    """只刪相簿分組，照片本身留著。"""
    a = _get(session, album_id)
    session.exec(delete(AlbumPhoto).where(col(AlbumPhoto.album_id) == album_id))  # type: ignore[call-overload]
    session.delete(a)
    session.commit()


@router.put("/{album_id}/photos", response_model=AlbumOut)
def set_photos(
    album_id: str, body: AlbumPhotosIn, _: CurrentUser, session: SessionDep, bg: BackgroundTasks
):
    a = _get(session, album_id)
    session.exec(delete(AlbumPhoto).where(col(AlbumPhoto.album_id) == album_id))  # type: ignore[call-overload]
    for i, pid in enumerate(dict.fromkeys(body.photo_ids)):
        if session.get(Photo, pid):
            session.add(AlbumPhoto(album_id=album_id, photo_id=pid, sort_order=i))
    session.commit()
    notify.ws(bg, "photo.added", {"album": album_id})
    return _out(session, a)


@router.post("/{album_id}/photos/add", response_model=AlbumOut)
def add_photos(
    album_id: str, body: AlbumPhotosIn, _: CurrentUser, session: SessionDep, bg: BackgroundTasks
):
    a = _get(session, album_id)
    max_order = (
        session.exec(
            select(func.max(AlbumPhoto.sort_order)).where(AlbumPhoto.album_id == album_id)
        ).one()
        or 0
    )
    for i, pid in enumerate(dict.fromkeys(body.photo_ids)):
        if session.get(Photo, pid) and session.get(AlbumPhoto, (album_id, pid)) is None:
            session.add(AlbumPhoto(album_id=album_id, photo_id=pid, sort_order=max_order + i + 1))
    session.commit()
    notify.ws(bg, "photo.added", {"album": album_id})
    return _out(session, a)
