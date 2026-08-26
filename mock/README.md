# three.js モック（UI-SPEC 適用版）

`docs/UI-SPEC.md` をそのまま実装したもの。`src/` の本体にはまだ手を入れていない。

## 見かた

```
cd mock && npx vite --port 4190
# http://localhost:4190/?s=base
```

`?s=` で画面を切り替える:
`title` / `base` / `dispatch` / `compare` / `report` / `reveal` / `inventory` / `compendium`
`?t=6` で時間を固定（スクリーンショット用）。

## 検証

```
node mock/verify.mjs
```

`docs/UI-SPEC.md` §7.1 の U1〜U10 を実際に走らせる。**73件の表明。**
UIの正しさをスクリーンショットではなくここで確かめる、というのが移行の主旨。

| ファイル | 役割 |
|---|---|
| `scenes.js` | three.js の World層。**文字・数値・当たり判定を一切置かない** |
| `screens.js` | DOM の Interface層。読ませるもの・触らせるものは全部こちら |
| `style.css` | UI-SPEC §4 のトークンと部品。名前は仕様書と一対一 |
| `verify.mjs` | U1〜U10 の表明 |

## この版で検証が捕まえた不具合

目視では気づけなかったものを2件、テストが先に見つけた。

1. **U4** — 開封画面の CTA が y=105 にあった。札が `position:absolute` で縦の場所を
   取らないため ActionBar が見出しの直下へ繰り上がり、親指の届かない位置に主要動線が来ていた
2. **U8** — 通知が「インベントリ」の文字に被っていた。しかも当初の U8 は結果行としか
   比べておらず、結果行の無い拠点画面では**判定が素通りしていた**。
   文字を持つ要素すべてと比べるよう表明を強くして初めて検出できた
