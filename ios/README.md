# Delvers（iOS）

SwiftUI（文字と操作）+ SceneKit（光と奥行き）の2層。ロジックは `../swift` の
`DelversCore` から取る——**この層はゲームのルールを1行も持たない。**

```
ios/
  project.yml            XcodeGen の定義（.xcodeproj は生成物なので追跡しない）
  Delvers/
    Design/Tokens.swift  色・余白・文字・部品。画面側で色と数字のリテラルを書かない
    Shell/               器（骨格・遷移・起動オプション）
    Screens/             画面9つ
    World/               SceneKit。**文字を描かない。当たり判定を持たない**
  DelversUITests/        画面の検査（docs/IOS-RUBRIC.md の A・B・C）
  Tools/                 見て直すための道具
```

## 開く・動かす

```sh
brew install xcodegen        # 初回だけ
cd ios && xcodegen generate  # .xcodeproj を作る
open Delvers.xcodeproj
```

コマンドから回すなら:

```sh
./Tools/run.sh                    # ビルドしてシミュレータで起動
./Tools/shots.sh                  # 主要9画面を1枚ずつ撮る
./Tools/audit.sh                  # 画面の検査（XCUITest）
python3 Tools/pixels.py           # 白飛び・暗すぎ・画面どうしの見分け
./Tools/score.sh                  # 上を全部まとめて回す
```

## 起動オプション（見て直すための仕掛け）

web 版の `?reset=1&seed=…&devitems=…` と同じ役割。目的の画面まで毎回手で辿っていたら
批評の輪が回らない。**決まった種と決まった持ち物**で、狙った画面をそのまま出す。

```sh
xcrun simctl launch booted com.delvers.app \
  -reset -seed 42 -devitems 24 -pending 5 -grown -gold 5000 -screen garden
```

| 指定 | 効果 |
|---|---|
| `-reset` | セーブを捨てて作り直す。通知の許可も求めない（アラートが画面を覆うため） |
| `-seed N` | 種を固定する |
| `-devitems N` | 装備を N 個配り、一番強いものを装備させる |
| `-pending N` | 未鑑定品を N 個持たせる |
| `-grown` | 畑を育てきり、薬草と薬を持たせる |
| `-report` | 派遣を1回終わらせて未読レポートを作る |
| `-gold N` | 金 |
| `-screen X` | 直接その画面を開く |

遊びの近道ではない。ここから入れるのは**状態を作って画面を出す**ところまで。

## 2層の約束（web 版 docs/UI-SPEC.md §0.5 と同じ）

- **World 層（SceneKit）は文字を描かない。** 読ませるものは必ず SwiftUI 側に置く。
- **World 層は当たり判定を持たない。** 3D の物を押させたいときは、
  `hotspots` が画面座標を返し、ボタンは SwiftUI 側が置く。
  Raycaster にすると、その操作が「44pt あるか」「本当に押せるか」の検査から消える。
- **画面が 3D へ渡すのは数値だけ**（`Mood`）。文字を1つ通した瞬間に、
  3D 側が「何の画面か」を知ることになり、層を分けた意味が消える。

### 3D に置いたボタンで踏んだ穴

3D の座標から SwiftUI のボタンを置くと、放っておくと次の3つが起きる。
どれも一度実際に起きた。

1. **画面の外へ出る。** 物がカメラの画角から外れると投影が返らず、動線ごと消える。
   → 位置に留めをかけ、画角に入る場所へ物を動かす。
2. **チップ同士が重なる。** 物が近づくと投影も近づく。
   → 近すぎるものを縦にずらす（`BaseScreen.layout`）。
3. **板の下敷きになる。** ZStack で `ScrollView` より下に置くと、
   スクロールがタップを飲む。`isHittable` は要素自身の可視性しか見ないので
   「押せる」と報告されるのに実際は押せない——**スクショにも出ない壊れ方**。
   → チップは板より上に置く。空いている場所は素通しする。

## 採点

`docs/IOS-RUBRIC.md` に基準、`docs/IOS-SCORE.md` に各ラウンドの点と落ちた理由。
25項目のうち16項目は機械が測る。**自分で採点する以上、意見で点が動く項目は最小にする。**
