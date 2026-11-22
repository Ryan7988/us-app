#!/bin/bash
set -euo pipefail
if [ -z "${RESTIC_PASSWORD:-}" ] || [ "${RESTIC_PASSWORD}" = "change-me" ]; then
  echo "RESTIC_PASSWORD 未設定，拒絕啟動（忘記密碼就無法還原）。請先執行 make init" >&2
  exit 1
fi
# cron 執行的工作拿不到容器的環境變數：存一份給它們載入
{
  for v in RESTIC_PASSWORD RESTIC_REPOSITORY TZ; do
    printf 'export %s=%q\n' "$v" "${!v:-}"
  done
} > /etc/backup.env
chmod 600 /etc/backup.env
# 時區（crond 依系統時區排程）
if [ -n "${TZ:-}" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
  cp "/usr/share/zoneinfo/$TZ" /etc/localtime
fi
# 第一次啟動自動初始化 repo
if ! restic cat config >/dev/null 2>&1; then
  echo "initializing restic repo at $RESTIC_REPOSITORY"
  restic init
fi
exec "$@"
