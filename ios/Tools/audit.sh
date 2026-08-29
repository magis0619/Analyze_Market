#!/bin/bash
# 画面の検査。docs/IOS-RUBRIC.md の A・B・C のうち、機械が測れるもの。
set -uo pipefail
cd "$(dirname "$0")/.."
DEV="${DEV:-iPhone 17 Pro}"
xcodebuild test -project Delvers.xcodeproj -scheme Delvers -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$DEV" -derivedDataPath .build \
  2>&1 | grep -E '^(===|  [A-Z][0-9]|失敗:|Test Suite .All tests. (passed|failed))' | head -60
