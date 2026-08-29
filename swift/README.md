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

## 動かす

```sh
cd swift
swift test          # または Xcode で Package.swift を開く
```

## この移植で確かめてあること・いないこと

移植を書いた環境（Linux のコンテナ）には Swift のツールチェーンが無く、
`download.swift.org` もプロキシに塞がれていた。つまり **この Swift は一度も
コンパイルされていない**。そこで、確かめられることと確かめられないことを分けてある。

| | 確かめ方 | 状態 |
|---|---|---|
| 書き写した**論理**が TS と同じか | `python3 tools/verify-port.py` | **7,810 件が一致**（Swift を機械的に Python へ写して golden.json に当てた） |
| **Swift として通るか**（型・構文） | `swift test` | **未確認。** あなたの Xcode が最初の1回目 |
| 実機で動くか | 次の段（アプリ側） | 未着手 |

`tools/verify-port.py` は **Swift のコードを写した**もので、TypeScript を写したものではない。
TS から写したらこの検査は何も言っていないのと同じになる——確かめたいのは
「TS が正しいか」ではなく「Swift に書き写すときに間違えなかったか」なので。

照合が本当に効いていることは変異試験で確認済み:

| わざと壊したもの | 出る失敗 |
|---|---|
| `>> 17` を論理シフトにする（教科書どおりの xorshift32） | 6,493 件中 3,741 件が不一致 |
| `Math.round` ではなく言語標準の round を使う | 54 件が不一致（売値・攻撃力） |
| `forceRarity` のときも抽選を引く | 486 件が不一致（救済枠から先が全部ずれる） |

**それでも残る穴**: Python も私が Swift から写したものなので、両方に同じ読み違いが
あれば通ってしまう。`swift test` が最後の関門になる。

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

## 作り直すとき

```sh
npm run swift:tables    # データ表を TS から作り直す
npm run swift:golden    # 正解表を作り直す
npm run swift:verify    # 移植した論理を照合する
```

TypeScript 側のバランスを触ったら、必ず `swift:golden` を作り直すこと。
作り直さないと、Swift 側は**古い正解表**に対して合格し続ける。
