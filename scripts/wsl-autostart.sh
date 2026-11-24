#!/bin/bash
# Windows 登入後自動執行（見 README「Windows：開機自動恢復」）。
# 原因：Docker Desktop 可能比 Ubuntu 先啟動，容器會掛不到 ~/us-app/data，
# 出現 "unable to open database file"、Tailscale 也讀不到登入狀態。
# 做法：等 Docker 就緒後，重新建立容器，讓它們重新掛上資料夾（資料不會受影響）。
cd "$(dirname "$0")/.." || exit 1
for _ in $(seq 1 120); do
  docker info >/dev/null 2>&1 && break
  sleep 5
done
make -s recover
