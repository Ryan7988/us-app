import io
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.services.media import sign, verify_uri
from tests.conftest import auth, login, me_id
from tests.images import heic, jpeg, png


def upload(
    client: TestClient, token: str, files: list[tuple[str, bytes]], album_id: str | None = None
) -> dict:
    r = client.post(
        "/api/v1/photos",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
        data={"album_id": album_id} if album_id else None,
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def fetch(client: TestClient, url: str) -> bytes:
    """開發模式由 api 提供檔案（正式環境由 Caddy + forward_auth）。"""
    r = client.get("/api/v1" + url)
    assert r.status_code == 200, (url, r.status_code)
    return r.content


def test_upload_formats_thumbs_and_exif(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    res = upload(client, t, [("IMG_0001.JPG", jpeg()), ("a.png", png()), ("IMG_0002.HEIC", heic())])
    assert res["errors"] == [] and res["duplicates"] == 0 and len(res["photos"]) == 3
    j, p, h = res["photos"]
    assert j["taken_at"] == "2025-08-15T06:30:00Z"  # EXIF 台北 14:30
    assert (j["width"], j["height"]) == (4032, 3024)
    assert h["mime"] == "image/heic"
    thumb = Image.open(io.BytesIO(fetch(client, j["thumb_url"])))
    assert max(thumb.size) == 512 and thumb.format == "JPEG"
    disp = Image.open(io.BytesIO(fetch(client, h["display_url"])))
    assert disp.format == "JPEG"  # HEIC 轉成所有瀏覽器都能顯示的 JPEG
    root = Path(get_settings().media_root)
    assert (root / "originals" / "2025" / "08").is_dir()
    assert len(fetch(client, j["original_url"])) == len(jpeg())  # 原圖原封不動


def test_twenty_iphone_photos(client: TestClient, setup_done: None) -> None:
    """驗收：上傳 20 張 iPhone 原圖全部成功；列表只回縮圖網址。"""
    t = login(client, 0)
    colors = [f"#{i * 10:02x}{255 - i * 10:02x}64" for i in range(20)]
    files = [
        (f"IMG_{i:04}.JPG", jpeg(1200, 900, c, f"2025:09:{i + 1:02} 10:00:00"))
        for i, c in enumerate(colors)
    ]
    res = upload(client, t, files)
    assert len(res["photos"]) == 20 and res["errors"] == []
    page1 = client.get("/api/v1/photos?limit=12", headers=auth(t)).json()
    assert len(page1["items"]) == 12 and page1["next_cursor"]
    assert page1["items"][0]["taken_at"] > page1["items"][-1]["taken_at"]  # 新到舊
    assert all("/media/thumbs/" in x["thumb_url"] for x in page1["items"])
    page2 = client.get(
        f"/api/v1/photos?limit=12&cursor={page1['next_cursor']}", headers=auth(t)
    ).json()
    assert len(page2["items"]) == 8 and page2["next_cursor"] is None
    ids = {x["id"] for x in page1["items"]} | {x["id"] for x in page2["items"]}
    assert len(ids) == 20


def test_duplicates_bad_files_and_delete(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    data = jpeg(400, 300)
    first = upload(client, t, [("a.jpg", data)])["photos"][0]
    again = upload(
        client, t, [("copy.jpg", data), ("evil.jpg", b"<?php echo 1; ?>"), ("x.gif", b"GIF89a....")]
    )
    assert again["duplicates"] == 1 and again["photos"][0]["id"] == first["id"]
    assert len(again["errors"]) == 2
    assert client.delete(f"/api/v1/photos/{first['id']}", headers=auth(t)).status_code == 204
    assert client.get("/api/v1/photos", headers=auth(t)).json()["items"] == []
    revived = upload(client, t, [("a.jpg", data)])  # 刪掉後重新上傳 = 救回
    assert revived["photos"][0]["id"] == first["id"]
    assert len(client.get("/api/v1/photos", headers=auth(t)).json()["items"]) == 1


def test_signed_urls(client: TestClient, setup_done: None) -> None:
    url = sign("thumbs/2025/08/x.jpg")
    assert verify_uri(url)
    assert not verify_uri(url.replace("x.jpg", "y.jpg"))
    assert not verify_uri(url.replace("sig=", "sig=0"))
    assert not verify_uri("/media/thumbs/2025/08/x.jpg")
    assert not verify_uri(sign("thumbs/../../etc/passwd"))
    assert not verify_uri(url, now=time.time() + 30 * 86400)  # 過期
    assert sign("thumbs/a.jpg") == sign("thumbs/a.jpg")  # 同一週內 URL 不變（快取有效）
    # Caddy forward_auth
    assert client.get("/api/v1/media/verify", headers={"X-Forwarded-Uri": url}).status_code == 200
    assert (
        client.get(
            "/api/v1/media/verify", headers={"X-Forwarded-Uri": "/media/thumbs/x.jpg"}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/media/thumbs/2025/08/x.jpg").status_code == 403


def test_albums(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    album = client.post(
        "/api/v1/albums",
        json={"title": "2026 天准旅行", "start_date": "2026-07-01"},
        headers=auth(t),
    ).json()
    assert album["photo_count"] == 0 and album["cover_url"] is None
    res = upload(
        client,
        t,
        [("a.jpg", jpeg(300, 200, "red")), ("b.jpg", jpeg(300, 200, "blue"))],
        album["id"],
    )
    albums = client.get("/api/v1/albums", headers=auth(t)).json()
    assert albums[0]["photo_count"] == 2 and albums[0]["cover_url"]
    in_album = client.get(f"/api/v1/photos?album_id={album['id']}", headers=auth(t)).json()["items"]
    assert len(in_album) == 2
    other = upload(client, t, [("c.jpg", jpeg(300, 200, "green"))])["photos"][0]
    r = client.post(
        f"/api/v1/albums/{album['id']}/photos/add",
        json={"photo_ids": [other["id"]]},
        headers=auth(t),
    )
    assert r.json()["photo_count"] == 3
    r = client.put(
        f"/api/v1/albums/{album['id']}/photos",
        json={"photo_ids": [res["photos"][0]["id"]]},
        headers=auth(t),
    )
    assert r.json()["photo_count"] == 1
    r = client.patch(f"/api/v1/albums/{album['id']}", json={"title": "改名"}, headers=auth(t))
    assert r.json()["title"] == "改名"
    assert client.delete(f"/api/v1/albums/{album['id']}", headers=auth(t)).status_code == 204
    assert len(client.get("/api/v1/photos", headers=auth(t)).json()["items"]) == 3  # 照片還在


def test_wish_complete_with_photo(client: TestClient, setup_done: None) -> None:
    t = login(client, 0)
    wish = client.post("/api/v1/wishes", json={"title": "去看海"}, headers=auth(t)).json()
    photo = upload(client, t, [("sea.jpg", jpeg(300, 200, "navy"))])["photos"][0]
    r = client.post(
        f"/api/v1/wishes/{wish['id']}/complete",
        json={"done": True, "photo_ids": [photo["id"]]},
        headers=auth(t),
    )
    assert r.json()["cover_photo_id"] == photo["id"] and r.json()["cover_thumb_url"]
    linked = client.get(
        f"/api/v1/photos?ref_type=wish&ref_id={wish['id']}", headers=auth(t)
    ).json()["items"]
    assert [x["id"] for x in linked] == [photo["id"]]


def test_gacha_complete_with_photo(
    client: TestClient, setup_done: None, pushes: list[dict]
) -> None:
    ta, tb = login(client, 0), login(client, 1)
    client.post(
        "/api/v1/gacha/cards", json={"content": "一起爬山", "rarity": "R"}, headers=auth(ta)
    )
    client.post("/api/v1/gacha/current/ready", headers=auth(ta))
    client.post("/api/v1/gacha/current/ready", headers=auth(tb))
    photo = upload(client, tb, [("proof.jpg", jpeg(300, 200, "olive"))])["photos"][0]
    r = client.post(
        "/api/v1/gacha/current/complete", json={"photo_id": photo["id"]}, headers=auth(tb)
    )
    assert r.status_code == 200 and r.json()["status"] == "done" and r.json()["proof_thumb_url"]
    cur = client.get("/api/v1/gacha/current", headers=auth(ta)).json()
    assert cur["streak"] == 1
    assert (
        client.post(
            "/api/v1/gacha/current/complete", json={"photo_id": photo["id"]}, headers=auth(tb)
        ).status_code
        == 409
    )
    assert me_id(client, ta)
