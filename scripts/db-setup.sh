#!/usr/bin/env bash
# ローカル開発用 PostgreSQL 16 を冪等にセットアップして起動する。
# - root で実行された場合は postgres ユーザー経由で initdb / pg_ctl を実行する
#   (PostgreSQL は root での起動を拒否するため)
# - データディレクトリ: /var/lib/postgresql/salon-area-coach-16
# - ポート: 55432 (既存の 5432 と衝突しないように)
# - 認証: 127.0.0.1 のみ listen + trust (開発専用。本番では使用しない)
# 停止するには: scripts/db-setup.sh stop
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/salon-area-coach-16}"
PGPORT="${PGPORT:-55432}"
DB="${DB:-salon_area_coach}"

cd "$(dirname "$0")/.."

# PGBIN の決定: 環境変数 > よくあるインストール先の自動検出 > PATH上のinitdb
detect_pgbin() {
  if [ -n "${PGBIN:-}" ]; then
    echo "$PGBIN"
    return
  fi
  for candidate in \
    /usr/lib/postgresql/16/bin \
    /opt/homebrew/opt/postgresql@16/bin \
    /usr/local/opt/postgresql@16/bin \
    /usr/pgsql-16/bin \
    /opt/homebrew/Cellar/postgresql@16/*/bin \
    /usr/local/Cellar/postgresql@16/*/bin; do
    if [ -x "$candidate/initdb" ]; then
      echo "$candidate"
      return
    fi
  done
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return
  fi
  echo ""
}

PGBIN="$(detect_pgbin)"

if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "error: PostgreSQL 16 の initdb が見つかりません。" >&2
  echo "  次のいずれかで対処してください:" >&2
  echo "  1. PGBIN=/path/to/postgresql/16/bin bash scripts/db-setup.sh" >&2
  echo "  2. PostgreSQL 16 をインストールする (Ubuntu: apt-get install postgresql-16 / macOS: brew install postgresql@16)" >&2
  echo "  現在地の探し方: which initdb  または  find / -maxdepth 6 -name initdb 2>/dev/null" >&2
  exit 1
fi
echo "==> using PostgreSQL binaries: $PGBIN"

# root で initdb/pg_ctl を直接実行できない環境向けに postgres ユーザーの有無を見て切り替える
as_pg() {
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

# ソケットディレクトリ: /var/run/postgresql が使えなければ PGDATA 配下にフォールバック
if [ -d /var/run/postgresql ] && [ -w /var/run/postgresql ]; then
  SOCKET_DIR=/var/run/postgresql
elif [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1 && [ -d /var/run/postgresql ]; then
  SOCKET_DIR=/var/run/postgresql
else
  SOCKET_DIR="$PGDATA"
fi

if [ "${1:-}" = "stop" ]; then
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" stop
  exit 0
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> initdb: $PGDATA"
  mkdir -p "$PGDATA"
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
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
  # BSD sed (macOS) と GNU sed (Linux) の両方に対応
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^AUTH_SECRET=$|AUTH_SECRET=$SECRET|" .env
  else
    sed -i '' "s|^AUTH_SECRET=$|AUTH_SECRET=$SECRET|" .env
  fi
fi

echo "==> applying migrations"
npx drizzle-kit migrate

echo "==> database ready: postgres://postgres@127.0.0.1:$PGPORT/$DB"
