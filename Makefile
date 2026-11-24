SHELL := /bin/bash
COMPOSE := docker compose
GPU := $(shell command -v nvidia-smi >/dev/null 2>&1 && echo "-f docker-compose.gpu.yml")
PROD := $(COMPOSE) -f docker-compose.yml $(GPU)
LOCAL := $(COMPOSE) -f docker-compose.yml -f docker-compose.local.yml
VERSION := $(shell git describe --tags --always 2>/dev/null || echo dev)
DEV_DB := sqlite:///../../data-dev/db/app.sqlite3
s ?= api

.PHONY: help init dirs dev dev-local up down restart recover deploy logs ps backup snapshots restore export local local-down test lint gen-api migration

help: ## 列出所有指令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

init: ## 第一次安裝：從 .env.example 產生 .env（自動填入隨機密鑰）並建立 data/
	@if [ -f .env ]; then echo ".env 已存在，不覆蓋"; else \
	  awk -v j="$$(openssl rand -hex 32)" -v m="$$(openssl rand -hex 32)" -v r="$$(openssl rand -hex 32)" \
	    '/^JWT_SECRET=/{print "JWT_SECRET=" j; next} /^MEDIA_SIGNING_KEY=/{print "MEDIA_SIGNING_KEY=" m; next} /^RESTIC_PASSWORD=/{print "RESTIC_PASSWORD=" r; next} {print}' \
	    .env.example > .env; \
	  chmod 600 .env; \
	  echo "已產生 .env —— 請填入 TS_AUTHKEY，並把整份 .env 存到密碼管理器"; fi
	@$(MAKE) -s dirs

dirs:
	@mkdir -p data/db data/media/originals data/media/thumbs data/tailscale data/caddy data/ollama data/backup-status backups
	@chmod 700 data
	@# api 容器以 UID 1000 執行
	@if [ "$$(id -u)" = "0" ]; then chown -R 1000:1000 data/db data/media data/backup-status; fi

dev: ## 開發：後端 hot reload + Vite（Docker），http://localhost:5173
	$(COMPOSE) -f docker-compose.dev.yml up --build

dev-local: ## 開發：不用 Docker（需要 uv、pnpm），http://localhost:5173
	@mkdir -p data-dev/db
	cd apps/api && DATABASE_URL=$(DEV_DB) uv run alembic upgrade head
	@trap 'kill 0' EXIT; \
	(cd apps/api && COOKIE_SECURE=false DATABASE_URL=$(DEV_DB) uv run uvicorn app.main:app --reload) & \
	(cd apps/web && pnpm dev) & wait

up: dirs ## 啟動正式環境
	APP_VERSION=$(VERSION) $(PROD) up -d --build

down: ## 停止正式環境
	$(PROD) down

recover: ## 開機後服務異常（打不開資料庫、連不上）：重新建立容器、重新掛上資料夾，不會動到資料
	@$(MAKE) -s dirs
	$(PROD) up -d --force-recreate --no-build
	@$(PROD) ps

restart: ## 重啟某個服務：make restart s=api
	$(PROD) restart $(s)

deploy: ## 更新：git pull → 先備份 → build → up → 檢查 healthz
	git pull --ff-only
	-$(MAKE) backup
	APP_VERSION=$$(git describe --tags --always) $(PROD) up -d --build
	@echo "等待 api healthy…"; for i in $$(seq 1 30); do \
	  if $(PROD) exec -T api python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/v1/healthz')" 2>/dev/null; then \
	    echo "✅ 部署完成 $$(git describe --tags --always)"; exit 0; fi; sleep 2; done; \
	  echo "❌ api 沒有回應，請看 make logs s=api"; exit 1

logs: ## 看日誌：make logs s=api
	$(PROD) logs -f --tail=200 $(s)

ps: ## 服務狀態
	$(PROD) ps

backup: ## 手動備份
	$(PROD) run --rm backup /usr/local/bin/backup.sh

snapshots: ## 列出備份快照
	$(PROD) run --rm backup restic snapshots

restore: ## 還原：make restore snapshot=<id|latest>（會先停 api/worker/web）
	@test -n "$(snapshot)" || (echo "用法：make restore snapshot=<id|latest>"; exit 1)
	$(PROD) stop api worker web
	$(PROD) run --rm -v ./data:/target backup /usr/local/bin/restore.sh $(snapshot)
	$(PROD) up -d

export: ## 搬家：停機並打包 data/（不含 ollama 模型）+ .env
	$(PROD) down
	tar --zstd -cf us-app-export.tar.zst --exclude=data/ollama data .env
	sha256sum us-app-export.tar.zst | tee us-app-export.tar.zst.sha256
	@echo "把 us-app-export.tar.zst 和 .sha256 傳到新機器，見 README「搬家」"

local: ## 不用 Tailscale，在 http://localhost:8080 跑正式映像
	@test -f .env || $(MAKE) -s init
	@$(MAKE) -s dirs
	$(LOCAL) up -d --build api worker web

local-down: ## 停止 make local
	$(LOCAL) down

test: ## 跑全部測試
	cd apps/api && uv run pytest -q
	cd apps/web && pnpm test

lint: ## lint + 型別檢查
	cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy app
	cd apps/web && pnpm lint && pnpm typecheck

gen-api: ## 後端改 schema 後，重新產生前端型別
	cd apps/web && pnpm gen:api

migration: ## 產生 migration：make migration m="add events"
	@mkdir -p data-dev/db
	cd apps/api && DATABASE_URL=$(DEV_DB) uv run alembic upgrade head && \
	  DATABASE_URL=$(DEV_DB) uv run alembic revision --autogenerate -m "$(m)"
