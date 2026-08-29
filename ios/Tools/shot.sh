#!/bin/bash
# 画面を撮る。撮る前に必ず落ち着かせる。
set -euo pipefail
DEV="${DEV:-iPhone 17 Pro}"
OUT="${1:?出力先を指定する}"
sleep "${2:-0.9}"
mkdir -p "$(dirname "$OUT")"
xcrun simctl io "$DEV" screenshot --type=png "$OUT" >/dev/null 2>&1
echo "$OUT"
