#!/bin/bash
# 主要画面を1枚ずつ撮る。**決まった種と決まった持ち物**で撮るので、
# 直す前と後を並べて比べられる。
set -euo pipefail
cd "$(dirname "$0")/.."
DEV="${DEV:-iPhone 17 Pro}"
B=com.delvers.app
OUT="${1:-/tmp/delvers-shots}"
mkdir -p "$OUT"
# 通知の許可を先に与える。**アラートが画面を覆うと、何を撮ったのか分からなくなる**
# （実際、5画面ぶん全部がアラートの写真になった）
xcrun simctl privacy "$DEV" grant notifications $B 2>/dev/null || true

# **必ず入れ直してから撮る。** ここを省いてシミュレータに入っている物を
# そのまま撮っていたら、直した後も直す前の絵が出続けた。
# 「直したのに画素が変わらない」は、たいてい古い物を見ている。
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  xcodebuild -project Delvers.xcodeproj -scheme Delvers -sdk iphonesimulator \
    -destination "platform=iOS Simulator,name=$DEV" -derivedDataPath .build \
    build >/dev/null 2>&1
  APP=$(find .build/Build/Products -name Delvers.app -maxdepth 3 | head -1)
  [ -n "$APP" ] || { echo "Delvers.app が見つからない（ビルドに失敗している）"; exit 1; }
  xcrun simctl boot "$DEV" 2>/dev/null || true
  xcrun simctl install "$DEV" "$APP"
  echo "  入れ直した: $APP"
fi
# **真っ黒を撮ったら撮り直す。** 入れ直した直後の初回起動は遅く、
# 2.2秒では起動前を撮っていた。真っ黒でも png は出来てしまうので、
# 確かめずに次へ進むと「暗すぎ」が9画面ぶん並んだ採点表が出来上がる。
blank () { python3 -c "
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('L').resize((16,16))
px = list(im.getdata())
sys.exit(0 if sum(px)/len(px) < 6 else 1)" "$1"; }

shot () { # name, args...
  local name="$1"; shift
  for try in 1 2 3; do
    xcrun simctl terminate "$DEV" $B 2>/dev/null || true
    xcrun simctl launch "$DEV" $B "$@" >/dev/null
    # **落ち着くまで待つ。** シーンは明るさも霧も目標値へ滑らかに寄せていくので、
    # 3秒で撮ると途中の暗い絵が写る（派遣準備が「暗すぎ」と誤判定された）
    sleep $((try + 4)).0
    xcrun simctl io "$DEV" screenshot --type=png "$OUT/$name.png" >/dev/null 2>&1
    if ! blank "$OUT/$name.png"; then
      # **明滅する絵は1枚では測れない。** 炎も液面も灯りも揺れているので、
      # 1枚の写真は値ではなく標本にすぎない。実際、同じ画面の白飛びが
      # 実行ごとに 0.14% と 2.35% を行き来し、基準の 3% を跨いでいた。
      # 何枚か撮って**一番悪い瞬間**で判定する
      for k in 2 3; do
        sleep 0.45
        xcrun simctl io "$DEV" screenshot --type=png "$OUT/$name.$k.png" >/dev/null 2>&1
      done
      echo "  $name"; return 0
    fi
  done
  echo "  $name ← 真っ黒のまま。起動に失敗している"
  return 1
}
shot title      -reset -screen title
shot base       -reset -devitems 24 -pending 5 -grown -gold 5000 -screen base
shot dispatch   -reset -devitems 24 -grown -gold 5000 -screen dispatch
shot inventory  -reset -devitems 24 -gold 5000 -screen inventory
shot opening    -reset -devitems 8 -pending 6 -screen opening
shot garden     -reset -devitems 8 -grown -gold 5000 -screen garden
shot alchemy    -reset -devitems 8 -grown -gold 5000 -screen alchemy
shot compendium -reset -devitems 24 -screen compendium
shot report     -reset -devitems 24 -report -screen report
# 派遣中の拠点。D3（状態が光で伝わるか）は、留守の絵を撮らないと確かめられない
shot away       -reset -devitems 24 -grown -gold 5000 -away -screen base
echo "→ $OUT"
