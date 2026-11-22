from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from app.services.media import media_root, verify_uri

router = APIRouter(tags=["media"])


@router.get("/media/verify", include_in_schema=False)
def verify(request: Request) -> Response:
    """Caddy forward_auth：檢查照片 URL 的簽章是否有效（<img> 無法帶 Authorization header）。"""
    uri = request.headers.get("x-forwarded-uri", "")
    if verify_uri(uri):
        return Response(status_code=200)
    return Response(status_code=403)


@router.get("/media/{kind}/{path:path}", include_in_schema=False)
def serve(kind: str, path: str, request: Request) -> FileResponse:
    """開發模式用（正式環境由 Caddy 直接提供檔案，不會走到這裡）。"""
    if not verify_uri(f"/media/{kind}/{path}?{request.url.query}"):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    file = (media_root() / kind / path).resolve()
    if not file.is_relative_to(Path(media_root()).resolve()) or not file.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return FileResponse(file, headers={"Cache-Control": "private, max-age=604800"})
