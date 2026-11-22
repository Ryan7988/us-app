# syntax=docker/dockerfile:1
# build context = repo 根目錄（docker-compose.yml 設定）
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./
# Docker 裡沒有 Python；型別檔已進版控，所以只跑 tsc + vite build
RUN pnpm build

FROM caddy:2.10-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
