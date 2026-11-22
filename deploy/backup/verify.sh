#!/bin/bash
# check：驗證 repo 完整性；restore-test：還原最新快照到暫存目錄並比對筆數
set -uo pipefail
STATUS=/status/verify.jsonl
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
record() { mkdir -p /status; printf '{"at":"%s","kind":"%s","status":"%s","message":"%s"}\n' "$(now)" "$1" "$2" "$3" >> "$STATUS"; }

case "${1:-check}" in
  check)
    if restic check >/dev/null 2>&1; then record check ok "repo ok"; else record check error "restic check failed"; exit 1; fi
    ;;
  restore-test)
    TMP=$(mktemp -d)
    restic restore latest --target "$TMP" >/dev/null 2>&1 || { record restore-test error "restore failed"; exit 1; }
    db=$(find "$TMP" -path '*/db/app.sqlite3' | head -1)
    live_users=$(sqlite3 -readonly /source/db/app.sqlite3 "select count(*) from users" 2>/dev/null || echo "?")
    bak_users=$(sqlite3 -readonly "$db" "select count(*) from users" 2>/dev/null || echo "?")
    bak_wishes=$(sqlite3 -readonly "$db" "select count(*) from wish_items" 2>/dev/null || echo "?")
    photos=$(find "$TMP" -path '*/media/originals/*' -type f | wc -l)
    rm -rf "$TMP"
    msg="users live=$live_users backup=$bak_users, wishes=$bak_wishes, photos=$photos"
    if [ "$bak_users" = "?" ]; then record restore-test error "$msg"; exit 1; fi
    record restore-test ok "$msg"; echo "$msg"
    ;;
esac
