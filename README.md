# 我們 · 情侶 App（PWA + 自架後端 + Docker）

只給兩個人用的私人 PWA。React 前端、FastAPI 後端、SQLite，全部包在 Docker Compose 裡，透過 Tailscale 私人網路連線。不付訂閱、不上架、不開任何對外 port。

```
iPhone（主畫面 PWA）──Tailscale──▶ tailscale ─▶ web (Caddy) ─┬─▶ /api ─▶ api (FastAPI) ─▶ data/db/app.sqlite3
                                    (HTTPS 憑證)   靜態檔/快取  └─▶ /media（簽章 URL）      ▲
                                                                               worker (APScheduler)
                                                                               backup (restic) ─▶ 外接硬碟
```

所有狀態都在 `data/` + `.env`：**搬家 = git clone + 複製這兩個東西 + `make up`**。

## 進度

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| P0 | monorepo、FastAPI + Alembic + SQLite、React + Vite + Tailwind + PWA、Docker Compose、CI | ✅ |
| P1 | 初始設定頁、登入 / token 輪替、願望清單 CRUD + WebSocket 即時同步、PWA 圖示 / 啟動畫面 / 更新提示 / 加入主畫面引導、每日備份 | ✅（推播與完成附照片在 P2 / P4） |
| P2 | 行事曆、邀請函、Web Push、.ics 訂閱 | ⏳ |
| P3 | 扭蛋機、AI 出題 | ⏳ |
| P4 | 相簿、正式備份演練 | ⏳ |
| P5 | 位置、打磨 | ⏳ |
| P6 | 搬到實驗室 | ⏳ |

## 第一次安裝（正式環境）

### 1. Tailscale（只做一次）

1. 到 <https://login.tailscale.com> 註冊（個人方案免費）。
2. 管理介面 → **DNS**：開啟 **MagicDNS** 和 **HTTPS Certificates**。
3. 管理介面 → **Settings → Keys** → Generate auth key（勾 *Reusable* 不需要；建議勾 *Pre-approved*）。
4. 你和她的 iPhone 都安裝 Tailscale App。她可以用「邀請使用者」加入你的 tailnet（Users → Invite），或用 Machines → 伺服器 → **Share** 只分享這台機器。
5. iPhone 的 Tailscale App 開啟 **On Demand（隨選連線）**，就不用每次手動打開。

### 2. 伺服器

需要 Docker Engine + Compose plugin（Linux），或 Docker Desktop（Mac / Windows）。

```bash
git clone <你的 repo> us-app && cd us-app
make init          # 產生 .env（自動填好隨機密鑰）和 data/
```

編輯 `.env`，填入 `TS_AUTHKEY`（Mac / Windows 若 tailscale 容器起不來，把 `TS_USERSPACE` 改成 `true`）。

> ⚠️ **把整份 `.env` 存一份到密碼管理器**。`RESTIC_PASSWORD` 忘了，備份就救不回來。

```bash
make up            # build + 啟動
make ps            # 全部應該是 running / healthy
```

網址是 `https://us-app.<你的-tailnet>.ts.net`（tailnet 名稱在管理介面 DNS 頁）。第一次開啟會進入「初始設定」頁建立兩個帳號，建完永久關閉。

### 3. 她的手機

1. 打開 Tailscale（連上）。
2. 用 **Safari** 開網址 → 畫面會教她「分享 → 加入主畫面」。
3. 從主畫面圖示打開，登入（主畫面版本和 Safari 的登入是分開的，所以要再登入一次；之後 90 天內不用再登入）。

## 開發

```bash
make dev-local     # 不用 Docker：後端 :8000（hot reload）+ Vite :5173
make dev           # 用 Docker 跑同樣的東西
make local         # 用正式映像在 http://localhost:8080 跑（不含 Tailscale）
make test          # 後端 pytest + 前端 vitest
make lint          # ruff + mypy + eslint + tsc
```

需要的工具：[uv](https://docs.astral.sh/uv/)、Node 22 + pnpm 10（`corepack enable`）。

**改了後端 schema 之後**：

```bash
make migration m="add events table"   # 產生 Alembic migration（檢查後進版控）
make gen-api                          # 重新產生前端型別 apps/web/src/api/schema.d.ts
```

CI 會檢查兩件事：migration 和 models 一致、前端型別和後端 OpenAPI 一致。忘了就會紅燈。

### 專案結構

```
apps/api/      FastAPI：app/{core,models,schemas,routers,realtime}，alembic/，tests/
apps/web/      React PWA：src/{api,features,components,lib}，src/sw.ts（Service Worker）
deploy/        tailscale/serve.json、backup/（restic + supercronic）
data/          ← 不進 Git：db、media、tailscale 狀態、caddy、備份紀錄
```

### 規範

- `main` 永遠可部署；功能在 `feat/*` 分支開發，用 PR 合併。
- Conventional Commits：`feat(gacha): add pity counter`。
- 每次部署打 tag（`v0.2.0`），App「更多 → 關於」會顯示前後端版本。
- 安裝 pre-commit：`uv tool install pre-commit && pre-commit install`。

## 維運

| 指令 | 動作 |
| --- | --- |
| `make deploy` | `git pull` → 先備份 → build → 重啟 → 檢查 healthz |
| `make logs s=api` | 看日誌（api / worker / web / backup / tailscale） |
| `make backup` | 手動備份 |
| `make snapshots` | 列出備份快照 |
| `make restore snapshot=latest` | 從備份還原（會先停服務） |
| `make export` | 停機並打包搬家檔 |

### 更新流程

1. 自己電腦 `make dev-local` 開發 → push → CI 全綠 → 合併 `main` → 打 tag。
2. Tailscale SSH 連到伺服器 → `make deploy`。
3. 她下次打開 App 會看到「有新功能囉！」→ 按更新。

更新能被看到的關鍵是 Caddy 的快取標頭：`index.html`、`sw.js` 一律 `no-cache`，`/assets/*`（檔名帶 hash）快取一年。

Migration 必須向下相容（先加欄位，下一版才刪），出問題就用部署前的備份還原。

### 備份

- 每天 03:30：SQLite 用 `.backup` 產生一致快照 + `data/media/originals`，restic 加密增量備份到 `BACKUP_TARGET`（外接硬碟）。
- 保留：7 日 / 4 週 / 12 月。每週日 `restic check`；**每月 1 號自動還原到暫存目錄並比對筆數**。
- 結果寫在 `data/backup-status/*.jsonl`（之後後台頁會顯示，失敗會推播）。

## 搬家（到實驗室電腦）

**事前**：取得實驗室同意；機器 24 小時開機、BIOS 設 AC Power Recovery = On；裝好 Docker；`data/` 只有你能讀（`make init` 已設 `chmod 700`，敏感的話再用 gocryptfs / LUKS 加密）。

1. 新機器：`git clone`，`docker compose build`（先 build，縮短停機時間）。
2. 通知她 30 分鐘內不要上傳照片。
3. 舊機器：`make backup`，確認成功。
4. 舊機器：`make export`（會先停機，產生 `us-app-export.tar.zst` 和 `.sha256`）。
5. 傳到新機器（`tailscale file cp`、`scp` 或隨身碟），`sha256sum -c us-app-export.tar.zst.sha256` 驗證。
6. 在 repo 根目錄解壓：`tar --zstd -xf us-app-export.tar.zst`，修改 `.env` 的 `BACKUP_TARGET`。
7. **確認舊機器的 tailscale 容器已停止**（同一份節點狀態兩台同時上線會互搶），新機器 `make up`。
8. 用手機驗證：網址可開、不用重新登入、資料都在。
9. 重開機一次，確認所有容器自動回來。舊機器資料保留 2 週。

**回滾**：新機器 `make down` → 舊機器 `make up`，網址會自動指回舊機器。

## 安全設計

- 不開任何對外 port；只有 tailnet 內的裝置連得到（建議再用 Tailscale ACL 限制只有你們的手機能連 443）。
- argon2id 密碼雜湊；access token 15 分鐘只放記憶體；refresh token 90 天、每次使用就輪替，放 HttpOnly + Secure + SameSite=Strict cookie；登入每 IP 每分鐘 5 次。
- 所有 API 預設需要登入，只有 `/healthz`、`/setup/status`、`/setup`（建完即關閉）例外。
- CSP、`X-Frame-Options`、禁用 `dangerouslySetInnerHTML`（ESLint 擋）。
- 容器以非 root 執行、映像版本固定。
