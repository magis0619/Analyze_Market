#!/bin/bash
# 採点を1回で回す。docs/IOS-RUBRIC.md の機械が測れる部分すべて。
#
#   ios/Tools/score.sh
#
# **目視の項目はここには出ない。** 出ないものは docs/IOS-SCORE.md に
# 「なぜその点か」を1行で書く。
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
SHOTS="${SHOTS:-/tmp/delvers-shots}"

echo "════ E. 移植として正しいか ════"
echo "E1 コア層に UI が漏れていないか"
LEAK=$(grep -rlE '^import (SwiftUI|UIKit|SceneKit)' "$ROOT/swift/Sources/" 2>/dev/null || true)
if [ -z "$LEAK" ]; then
  echo "  ok: DelversCore は SwiftUI も UIKit も SceneKit も import していない"
else
  echo "  NG: $LEAK"
fi

echo "E2 web 版と同じ結果を出すか"
( cd "$ROOT/swift" && swift test 2>&1 | grep -E "Executed .* tests, with" | tail -2 | sed 's/^/  /' )

echo
echo "════ D. 世界が立っているか（画素）════"
./Tools/shots.sh "$SHOTS" >/dev/null 2>&1
python3 Tools/pixels.py "$SHOTS" 2>/dev/null

echo
echo "════ A・B・C. 読めるか／迷わないか／自然か（XCUITest）════"
./Tools/audit.sh 2>&1 | grep -E '^(===|  [A-Z][0-9])' || true

echo
echo "残りの目視は C3（触覚：シミュレータでは出ない）と C5（作法）だけ。"
echo "D1・D3・D4 と C2・C4 は測れる形にしてある。理由は docs/IOS-SCORE.md。"
