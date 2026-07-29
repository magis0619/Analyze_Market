#!/usr/bin/env bash
# ローカル開発用 PostgreSQL 16 を冪等にセットアップして起動する。
# - root で実行された場合は postgres ユーザー経由で initdb / pg_ctl を実行する
#   (PostgreSQL は root での起動を拒否するため)
# - データディレクトリ: /var/lib/postgresql/salon-area-coach-16
# - ポート: 55432 (既存の 5432 と衝突しないように)
# - 認証: 127.0.0.1 のみ listen + trust (開発専用。本番では使用しない)
# 停止するには: scripts/db-setup.sh stop
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/lib/postgresql/salon-area-coach-16
PGPORT=55432
DB=salon_area_coach
SOCKET_DIR=/var/run/postgresql

cd "$(dirname "$0")/.."

as_pg() {
  if [ "$(id -u)" = 0 ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

if [ "${1:-}" = "stop" ]; then
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" stop
  exit 0
fi

if [ ! -x "$PGBIN/initdb" ]; then
  echo "error: PostgreSQL 16 が $PGBIN に見つかりません" >&2
  exit 1
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> initdb: $PGDATA"
  mkdir -p "$PGDATA"
  if [ "$(id -u)" = 0 ]; then
    chown postgres:postgres "$PGDATA"
  fi
  as_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --no-locale >/dev/null
fi

if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -q; then
  echo "==> starting postgres on 127.0.0.1:$PGPORT"
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" \
    -o "-p $PGPORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start >/dev/null
  for _ in $(seq 1 30); do
    if "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -q; then break; fi
    sleep 0.5
  done
  if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -q; then
    echo "error: postgres の起動に失敗しました。ログ: $PGDATA/server.log" >&2
    exit 1
  fi
fi

if ! as_pg "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  echo "==> createdb: $DB"
  as_pg "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DB"
fi

if [ ! -f .env ]; then
  echo "==> .env を生成します"
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  sed -i "s|^AUTH_SECRET=$|AUTH_SECRET=$SECRET|" .env
fi

echo "==> applying migrations"
npx drizzle-kit migrate

echo "==> database ready: postgres://postgres@127.0.0.1:$PGPORT/$DB"
