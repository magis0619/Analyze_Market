#!/usr/bin/env bash
# UI-SPEC §7.1 の検証を、ビルド済みの実物に対して走らせる。
#
# preview サーバを立て、終わったら必ず落とす。
# 既に 4173 が空いていない場合はそのまま使う（開発中の手動起動を尊重する）。
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"
URL="http://localhost:${PORT}/index2.html"
OWN=0

if ! curl -sf -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
  npx vite build >/dev/null
  npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
  OWN=$!
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://localhost:${PORT}/" 2>/dev/null && break
    sleep 0.5
  done
fi

set +e
URL="$URL" node test/ui-verify.mjs
CODE=$?
set -e

[ "$OWN" != 0 ] && kill "$OWN" 2>/dev/null
exit $CODE
