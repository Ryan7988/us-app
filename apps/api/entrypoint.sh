#!/bin/sh
set -e
# 只有 api 容器負責 migration；worker 透過 depends_on 等 api healthy 後才啟動
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "running alembic upgrade head"
  alembic upgrade head
fi
exec "$@"
