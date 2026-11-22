#!/bin/bash
# 一致性備份：SQLite 用 .backup 產生快照（不直接複製寫入中的檔案）+ 照片原圖
set -uo pipefail
STATUS=/status/backups.jsonl
SNAP=$(mktemp -d)
start=$(date -u +%Y-%m-%dT%H:%M:%SZ)

record() { # $1=ok|error $2=message
  mkdir -p /status
  printf '{"started_at":"%s","finished_at":"%s","status":"%s","message":"%s"}\n' \
    "$start" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2//\"/\'}" >> "$STATUS"
  tail -n 100 "$STATUS" > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}

fail() { record error "$1"; echo "backup failed: $1" >&2; rm -rf "$SNAP"; exit 1; }

mkdir -p "$SNAP/db"
if [ -f /source/db/app.sqlite3 ]; then
  sqlite3 /source/db/app.sqlite3 ".backup '$SNAP/db/app.sqlite3'" || fail "sqlite backup"
  sqlite3 "$SNAP/db/app.sqlite3" "PRAGMA integrity_check;" | grep -q '^ok$' || fail "integrity_check"
fi

paths=("$SNAP/db")
[ -d /source/media/originals ] && paths+=("/source/media/originals")

out=$(restic backup --host us-app --tag daily "${paths[@]}" 2>&1) || fail "restic backup: ${out: -200}"
echo "$out" | tail -n 3
restic forget --host us-app --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune >/dev/null \
  || fail "restic forget"

rm -rf "$SNAP"
summary=$(echo "$out" | grep -E '^snapshot .* saved' | head -1)
record ok "${summary:-done}"
echo "backup ok"
