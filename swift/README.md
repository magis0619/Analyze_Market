# DelversCore（Swift 移植）

DELVERS のゲームロジックを Swift へ移したもの。`src/sim/` と `src/data/` の対応物で、
**画面には一切触れない**。UIKit / SwiftUI / SceneKit を import していないことが、
そのまま層の境界の担保になっている。

```
swift/
  Package.swift
  Sources/DelversCore/
    Prng.swift            種を指定できる xorshift32（JS のビットの癖まで写してある）
    Types.swift           型と、JS と同じ丸め方（jsRound）
    Items.swift           装備生成（§5）
    Combat.swift          戦闘シミュレーション（§6）と見どころの文
    Offline.swift         オフライン進行（§7.2）
    Data/Generated.swift  データ表（**自動生成**）
    Data/Tables.swift     表の引き方
  Tests/DelversCoreTests/
    GoldenTests.swift     TypeScript 版の実測値と突き合わせる
    Resources/golden.json 正解表（自動生成）
```

## ローカルで始める

```sh
git fetch origin claude/game-creation-bcoyzz
git checkout claude/game-creation-bcoyzz

cd swift
swift test                      # Xcode なら Package.swift を開く（File > Open）
```

**通っている**（Swift 6.3.3 / macOS arm64 で 14 件すべて成功）。落ちたときの読み方:

| 落ち方 | 意味 | やること |
|---|---|---|
| `test1_Prng…` | 乱数がずれている | `Prng.step` の `Int32(bitPattern:)` を疑う。ここが落ちたら以降は全部道連れなので、まずこれだけ直す |
| `test2_難易度倍率…` | `pow` を使ってしまっている | `intPow`（繰り返し乗算）に戻す |
| `test3_装備生成…` | 乱数を引く順番か回数が違う | 「seed X/slot/stage Y の N 個目」まで名指しされる。その1件だけ TS と読み比べる |
| `test4_派遣…` の HP 推移 | どこかの遭遇で別の道に入った | `hpCurve[k]` の k が分岐点。その遭遇の条件式を読む |
| 全部が 1〜2ulp だけずれる | **正解表の読み取りを疑う**（下記） | `JSONSerialization` に戻していないか確認する |

論理がずれた場合は、**TypeScript と読み比べる前に** `npm run swift:verify` を回すこと。
Python 側（＝Swift を写したもの）が通っているなら、ずれているのは論理ではなく Swift の書き方。

## 動かす（作り直しを含む）

```sh
swift test              # 突き合わせ
swift build -c release  # ライブラリだけ
```

## この移植で確かめてあること・いないこと

移植を書いた環境（Linux のコンテナ）には Swift のツールチェーンが無く、
`download.swift.org` もプロキシに塞がれていた。つまり **この Swift は一度も
コンパイルされていない**。そこで、確かめられることと確かめられないことを分けてある。

| | 確かめ方 | 状態 |
|---|---|---|
| 書き写した**論理**が TS と同じか | `npm run swift:verify` | **7,810 件が一致** |
| **Swift として通り、TS と同じ結果を出すか** | `swift test` | **14 件すべて成功**（Swift 6.3.3 / macOS arm64） |
| 実機でアプリとして動くか | 次の段（画面層） | 未着手 |

最初のコンパイルで出た本当の欠陥は1つだけだった——`EnemyDef` / `HerbDef` / `PotionDef` の
**型宣言の書き忘れ**（表を生成に切り替えたとき、リテラルと一緒に落としていた）。
エラーは 96 件出たが、原因はこの3行。論理の側は1件もずれていなかった。

`tools/verify-port.py` は **Swift のコードを写した**もので、TypeScript を写したものではない。
TS から写したらこの検査は何も言っていないのと同じになる——確かめたいのは
「TS が正しいか」ではなく「Swift に書き写すときに間違えなかったか」なので。

照合が本当に効いていることは変異試験で確認済み:

| わざと壊したもの | 出る失敗 |
|---|---|
| `>> 17` を論理シフトにする（教科書どおりの xorshift32） | 6,493 件中 3,741 件が不一致 |
| `Math.round` ではなく言語標準の round を使う | 54 件が不一致（売値・攻撃力） |
| `forceRarity` のときも抽選を引く | 486 件が不一致（救済枠から先が全部ずれる） |

**それでも残る穴**: Python も Swift から写したものなので、両方に同じ読み違いが
あれば通ってしまう——だったが、`swift test` が実機で通ったのでこの穴は閉じた。
TS → Python → Swift の3実装が同じ値を出している。

## 移植で気をつけた点（＝素直に書くと必ずずれる場所）

1. **`x >> 17` は符号付き右シフト。** JS の元実装は `>>>` ではなく `>>` で書かれていて、
   値が 2^31 以上のとき上位に 1 が詰まる。教科書どおりの xorshift32 を書くと、
   種によって数列がまるごと別物になる。

2. **`Math.round` は `floor(x + 0.5)`。** Swift の `rounded()` は .5 を絶対値の大きい
   ほうへ送るので、負の .5 で 1 ずれる。`jsRound` を通す。

3. **`pow` を使わない。** libm ごとに最後の 1ulp が違いうる。1ulp のずれは敵の攻撃力に
   乗り、`hp <= 0` の判定を一度ひっくり返すだけで以降の乱数の使われ方が全部ずれる。
   整数乗は繰り返し乗算にしてある（V8 の `Math.pow` と bit 単位で一致することを確認済み）。

4. **順序を持つ集計。** JS のオブジェクトは挿入順で回るので、「最も効いた要因」は
   同率のとき**先に入ったほう**が勝つ。Swift の `Dictionary` は順序を持たないため、
   そのまま辞書にすると見どころの1行が実行ごとに変わる。`OrderedTally` と
   `ElementSplit` は、この順序を保つためだけに存在している。

5. **`forceRarity` のときは抽選を引かない。** JS は `find(...) ?? rollRarity(...)` で、
   見つかれば右辺を評価しない。無条件に引くと、救済枠を含む回だけ乱数が1つぶんずれる。

6. **データ表は生成する。** 一度手で写してステージ7〜9（名前・弱点・耐性・レア補正）を
   丸ごと取り違えた。`npx tsx tools/gen-swift-tables.ts` が `Data/Generated.swift` を作る。

7. **正解表を `JSONSerialization` で読まない。** あれは
   `0.015739798778668046` を `NSDecimalNumber` として読み、`.doubleValue` で
   **2ulp 落とす**（bits `…04000000` → `…03fffffe`）。落ちるのは正解表のほうなので、
   実装が正しいのにテストが落ちる。しかも「1ulp ずれ」という、いかにも移植を
   しくじったように見える落ち方をする。実際この罠に一度かかって浮動小数の
   contraction を疑った。`JSONDecoder` と `Double(String)` は正確。

### 実機で分かったこと

`pow` を避けた判断は、クラウドでは「libm ごとに違いうる」という予測だった。
実機で確かめたところ、**実際にずれた**:

| | `difficultyMul(5)` |
|---|---|
| V8（`Math.pow(2.2, 4)`） | `23.42560000000001` |
| Apple libm（`pow(2.2, 4.0)`） | `23.425600000000006` |
| 繰り返し乗算（採用） | `23.42560000000001` ✓ |

## 作り直すとき

```sh
npm run swift:tables    # データ表を TS から作り直す
npm run swift:golden    # 正解表を作り直す
npm run swift:verify    # 移植した論理を照合する
```

TypeScript 側のバランスを触ったら、必ず `swift:golden` を作り直すこと。
作り直さないと、Swift 側は**古い正解表**に対して合格し続ける。
