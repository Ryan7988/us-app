#!/bin/bash
set -euo pipefail
if [ -z "${RESTIC_PASSWORD:-}" ]; then
  echo "RESTIC_PASSWORD 未設定，拒絕啟動（忘記密碼就無法還原）" >&2
  exit 1
fi
# 第一次啟動自動初始化 repo
if ! restic cat config >/dev/null 2>&1; then
  echo "initializing restic repo at $RESTIC_REPOSITORY"
  restic init
fi
exec "$@"
