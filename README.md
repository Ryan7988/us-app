# 我們 · 情侶 App（PWA + 自架後端 + Docker）

只給兩個人用的私人 PWA。React 前端、FastAPI 後端、SQLite，全部包在 Docker Compose 裡，透過 Tailscale 私人網路連線。不付訂閱、不上架、不開任何對外 port。

```
iPhone（主畫面 PWA）──Tailscale──▶ tailscale ─▶ web (Caddy) ─┬─▶ /api ─▶ api (FastAPI) ─▶ data/db/app.sqlite3
                                    (HTTPS 憑證)   靜態檔/快取  └─▶ /media（簽章 URL）      ▲
                                                                               worker (APScheduler)
                                                                               backup (restic) ─▶ 外接硬碟
```

所有狀態都在 `data/` + `.env`：**搬家 = git clone + 複製這兩個東西 + `make up`**。

## 功能（v1.0.0）

| 功能 | 內容 |
| --- | --- |
| ⭐ 願望清單 | 新增 / 編輯 / 刪除、分類篩選、左滑完成、完成時附照片（自動進相簿、當封面）、對方新增會推播 |
| 📅 行事曆 | 我的 / 她的 / 共同三色、整天、每週 / 每月 / 每年重複、提醒推播、訂閱到 iPhone 內建行事曆（.ics） |
| 💌 邀請函 | 1–3 個候選時間、四種信封樣式、打開信封動畫、答應 / 婉拒 / 提議其他時間，答應後自動進共同行事曆 |
| 🎰 扭蛋機 | 每月一次、兩人都按「準備好了」才開獎、兩支手機同步動畫、SSR/SR/R、保底、上傳證明照片、連續達成、月底自動結算；做不到可以提議重抽，**雙方都同意**後回到等待開獎、兩人再各自按準備重新抽（每月 1 次，後台可調；`make gacha-reset` 可重設本月） |
| 🤖 AI 出題 | 本地 Ollama（Qwen 2.5 7B），每月 20 號自動補卡、相似題自動去重、人工審核後才進卡池 |
| 📷 相簿 | 多張上傳（HEIC / JPEG / PNG）、依拍攝時間排序、相簿分組、全螢幕檢視、下載原圖、重複上傳自動辨識 |
| 📍 位置 | 打開 App 時更新位置、報平安（推播給對方）、地圖、隨時關閉分享、只保留 30 天 |
| 🏠 首頁 | 在一起天數、今天行程、待回覆邀請、本月扭蛋、對方最後報平安 |
| 🛠️ 後台 | 服務狀態、磁碟與照片用量、備份紀錄、扭蛋機率與 10,000 次模擬、AI 模型下載與手動出題、錯誤紀錄 |
| ⚙️ 設定 | 開啟通知 / 測試推播、暱稱與代表色、改密碼、紀念日、行事曆訂閱連結、登入裝置與強制登出 |

## 第一次安裝（正式環境）

### 1. Tailscale（只做一次）

1. 到 <https://login.tailscale.com> 註冊（個人方案免費）。
2. 管理介面 → **DNS**：開啟 **MagicDNS** 和 **HTTPS Certificates**。
3. 管理介面 → **Settings → Keys** → Generate auth key（勾 *Reusable* 不需要；建議勾 *Pre-approved*）。
4. 你和她的 iPhone 都安裝 Tailscale App。她可以用「邀請使用者」加入你的 tailnet（Users → Invite），或用 Machines → 伺服器 → **Share** 只分享這台機器。
5. iPhone 的 Tailscale App 開啟 **On Demand（隨選連線）**，就不用每次手動打開。

### 2. 伺服器

需要 Docker Engine + Compose plugin（Linux），或 Docker Desktop（Mac / Windows）。

> **Windows**：`make` 和這些腳本要在 **WSL（Ubuntu）** 裡執行，不要在 cmd / PowerShell。
> 而且專案要 clone 到 WSL 自己的資料夾（`~/us-app`），**不要放在 `C:\`、`E:\`（`/mnt/e`）**：
> SQLite 放在 Windows 磁碟上透過 Docker 存取，檔案鎖不可靠，可能弄壞資料庫，速度也慢很多。
>
> 1. 系統管理員 PowerShell 執行 `wsl --install -d Ubuntu`，重開機，設定 Ubuntu 帳號密碼。
> 2. 安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/) → Settings → Resources → WSL Integration → 打開 Ubuntu；
>    Settings → General → 勾「Start Docker Desktop when you sign in」。
> 3. 開「Ubuntu」，執行 `sudo apt update && sudo apt install -y make git`，接著照下面步驟。
> 4. 這台電腦就是伺服器：Windows 設定 → 電源 → 睡眠改成「永不」。
> 5. **開機自動恢復**（Docker Desktop 可能比 Ubuntu 先啟動，服務會打不開資料庫）：在 PowerShell 執行一次
>    ```powershell
>    $s=(New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\us-app.lnk"); $s.TargetPath="wsl.exe"; $s.Arguments='-d Ubuntu -- bash -lc "~/us-app/scripts/wsl-autostart.sh"'; $s.WindowStyle=7; $s.Save()
>    ```
>    之後每次登入 Windows 都會自動執行 `make recover`。手動修復：在 Ubuntu 執行 `cd ~/us-app && make recover`。

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

**上線第一天要在 App 裡做的事**（都不用下指令）：

1. 更多 → 設定 → **開啟通知**，按「測試」確認手機有收到。
2. 更多 → 設定 → **交往紀念日**。
3. 更多 → 設定 → **加入 iPhone 行事曆**（可選）。
4. 更多 → 後台 → **下載 AI 模型**（約 5 GB，背景下載），之後按「產生 10 張新卡」→ 扭蛋 → AI 審核。
5. 扭蛋 → 卡池：先自己寫幾張卡。

### 3. 她的手機（傳給她看這段就好）

1. App Store 安裝 **Tailscale**，用他寄給你的邀請登入，打開「隨選連線（On Demand）」。
2. 用 **Safari** 打開他給你的網址 → 畫面會教你「分享 → 加入主畫面」。
3. 從主畫面的「我們」圖示打開，登入（之後 90 天內都不用再登入）。
4. 更多 → 設定 → **開啟通知**。
5. 打不開的時候：先確認 Tailscale 有連上。App 有新版本時會跳出「有新功能囉！」，按更新就好。

## 開發

```bash
make dev-local     # 不用 Docker：後端 :8000（hot reload）+ Vite :5173
make dev           # 用 Docker 跑同樣的東西
make local         # 用正式映像在 http://localhost:8080 跑（不含 Tailscale）
make test          # 後端 pytest（55 個，含 10 萬次抽卡統計）+ 前端 vitest
make lint          # ruff + mypy + eslint + tsc
```

需要的工具：[uv](https://docs.astral.sh/uv/)、Node 22 + pnpm 10（`corepack enable`）。

**改了後端 schema 之後**：

```bash
make migration m="add events table"   # 產生 Alembic migration（檢查後進版控）
make gen-api                          # 重新產生前端型別 apps/web/src/api/schema.d.ts
```

CI 會檢查兩件事：migration 和 models 一致、前端型別和後端 OpenAPI 一致。忘了就會紅燈。

全功能 E2E（兩支模擬 iPhone 走過所有功能）：見 [e2e/README.md](e2e/README.md)。

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
- 結果寫在 `data/backup-status/*.jsonl`，後台頁會顯示。
- 每天 04:30 檢查：備份失敗、超過 26 小時沒備份、磁碟剩不到 10%，都會推播到兩支手機。
- 還原後縮圖不見：後台 → 用量 →「重新產生縮圖」。

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
