#!/bin/bash
# ビルドして、シミュレータに入れて、立ち上げる。
#
# 「見て直す」を回すための足場。これが無いと、画面の批評は想像の話になる。
set -euo pipefail
cd "$(dirname "$0")/.."
DEV="${DEV:-iPhone 17 Pro}"
BUNDLE=com.delvers.app

xcodebuild -project Delvers.xcodeproj -scheme Delvers -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$DEV" -derivedDataPath .build \
  build 2>&1 | grep -E '^(/|error:|warning: .*(unused|never))' | grep -E 'error:' | head -20 || true

APP=.build/Build/Products/Debug-iphonesimulator/Delvers.app
[ -d "$APP" ] || { echo "ビルド失敗（$APP が無い）"; exit 1; }

xcrun simctl boot "$DEV" 2>/dev/null || true
xcrun simctl bootstatus "$DEV" -b >/dev/null 2>&1 || true
xcrun simctl terminate "$DEV" "$BUNDLE" 2>/dev/null || true
# **入れ直す。** 一度出した通知の許可ダイアログは、答えるまでシステムに残り、
# 次の起動でも画面を覆う。撮った5画面が全部アラートの写真になった
xcrun simctl uninstall "$DEV" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$DEV" "$APP"
xcrun simctl privacy "$DEV" grant notifications "$BUNDLE" 2>/dev/null || true
xcrun simctl launch "$DEV" "$BUNDLE" "$@" >/dev/null
echo "起動した"
