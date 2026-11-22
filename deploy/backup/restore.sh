#!/bin/bash
# 用法（由 make restore 呼叫）：restore.sh <snapshot-id|latest> ，還原到 /target（= ./data）
set -euo pipefail
SNAP_ID=${1:-latest}
[ -d /target ] || { echo "/target 未掛載" >&2; exit 1; }
TMP=$(mktemp -d)
restic restore "$SNAP_ID" --target "$TMP"

db=$(find "$TMP" -path '*/db/app.sqlite3' | head -1)
if [ -n "$db" ]; then
  mkdir -p /target/db
  rm -f /target/db/app.sqlite3-wal /target/db/app.sqlite3-shm
  cp "$db" /target/db/app.sqlite3
  echo "restored db"
fi
orig=$(find "$TMP" -type d -path '*/media/originals' | head -1)
if [ -n "$orig" ]; then
  mkdir -p /target/media
  rm -rf /target/media/originals
  cp -a "$orig" /target/media/originals
  echo "restored media/originals（縮圖之後由 api 重新產生）"
fi
chown -R 1000:1000 /target/db /target/media 2>/dev/null || true
rm -rf "$TMP"
echo "restore of $SNAP_ID done"
