// 各画面の HTML。機能は現行のまま、見た目だけをモダンファンタジーに置き換える。
//
// 情報の階層は Balatro型UI設計書 §1 のとおり:
//   Layer 1 常時（所持金・難易度・潜行中）… 上端に固定
//   Layer 2 判断（装備・比較・ステージ・戦利品）… ガラス板のカード
//   Layer 3 詳細（ユニーク効果・内訳）… カードの中で展開
//
// 3D 側には文字を一切置かない。読ませるものは全部こちら側にある。

const topbar = ({ title, back, gold, live, meta }) => `
  <div class="topbar">
    ${back ? '<button class="back">‹</button>' : ''}
    <h1 class="display">${title}</h1>
    <div class="spacer"></div>
    ${meta ? `<span class="pill">${meta}</span>` : ''}
    ${live ? `<span class="pill live">潜行 ${live}</span>` : ''}
    ${gold !== undefined ? `<span class="stat gold"><i class="dot"></i>${gold.toLocaleString()}</span>` : ''}
  </div>`;

const panel = (label, body, cls = '') => `
  <section class="panel ${cls}">
    ${label ? `<div class="panel-h"><span>${label}</span><i class="hr"></i></div>` : ''}
    <div class="panel-b">${body}</div>
  </section>`;

// ---------------------------------------------------------------- 拠点

export const base = {
  scene: 'base',
  html: `
${topbar({ title: '拠点', gold: 12430, live: 1 })}
<div class="stack bottom">

  ${panel('探索中', `
    <div class="slot">
      <div class="av">⚔</div>
      <div class="who">
        <div class="n">剣士</div>
        <div class="s">灼熱坑 へ潜行中 ・ 深度 7 / 20</div>
      </div>
      <div class="rt">残り<br><b style="font-size:15px;color:var(--gold)">14分</b></div>
    </div>
    <div class="bar"><i style="width:38%"></i></div>
  `)}

  ${panel('待機中', `
    <div class="slot">
      <div class="av">🛡</div>
      <div class="who">
        <div class="n">重装兵</div>
        <div class="s idle">装備あり ・ いつでも出せる</div>
      </div>
      <div class="rt" style="color:var(--gold)">出発 ›</div>
    </div>
  `)}

  <div class="acts">
    <button class="act primary"><span class="k">Unopened</span>未鑑定品を開封<span class="badge">7</span></button>
    <button class="act"><span class="k">Report</span>帰還レポート<span class="badge">2</span></button>
    <button class="act"><span class="k">Dispatch</span>派遣準備</button>
    <button class="act"><span class="k">Inventory</span>インベントリ</button>
  </div>

  ${panel('', `
    <div class="figs">
      <div class="fig"><div class="l">踏破</div><div class="v">7<span style="font-size:11px;color:var(--faint)">/10</span></div></div>
      <div class="fig"><div class="l">図鑑</div><div class="v">124</div></div>
      <div class="fig"><div class="l">難易度</div><div class="v" style="color:var(--blood)">+2</div></div>
    </div>
  `)}
</div>`
};

// ---------------------------------------------------------------- 派遣準備

export const dispatch = {
  scene: 'dispatch',
  html: `
${topbar({ title: '派遣準備', back: true, gold: 12430, live: 1 })}
<div class="stack">

  ${panel('装備', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
      <div class="item rare" style="padding:10px 11px">
        <div class="ic">⚔</div>
        <div class="tx"><div class="n">炎の片手剣</div><div class="m">秒間 118</div></div>
      </div>
      <div class="item fine" style="padding:10px 11px">
        <div class="ic">🛡</div>
        <div class="tx"><div class="n">鋼の中鎧</div><div class="m">防御 94</div></div>
      </div>
    </div>
    <div style="margin-top:9px;font-size:11px;color:var(--ember);line-height:1.5">
      ⚠ 灼熱坑は炎に耐性。炎寄りの武器では火力が半減する
    </div>
  `)}

  ${panel('撤退ルール', `
    <div class="rules">
      <div class="rule" style="--rcol:var(--blood)">
        <div class="n">深追い</div>
        <div class="g"><i style="width:100%"></i></div>
        <div class="d">HPが0に<br>なるまで戦う</div>
      </div>
      <div class="rule on" style="--rcol:var(--gold)">
        <div class="n">標準</div>
        <div class="g"><i style="width:70%"></i><u style="left:30%"></u></div>
        <div class="d">HP30%を<br>切ったら帰還</div>
      </div>
      <div class="rule" style="--rcol:var(--venom)">
        <div class="n">慎重</div>
        <div class="g"><i style="width:50%"></i><u style="left:50%"></u></div>
        <div class="d">HP50%を<br>切ったら帰還</div>
      </div>
    </div>
  `)}

  ${panel('派遣先', `
    <div class="stages">
      <div class="stage"><span class="no">2</span><span class="nm">苔の回廊</span><span class="tag pois">毒</span><span class="tm">10分</span></div>
      <div class="stage on"><span class="no">3</span><span class="nm">灼熱坑</span><span class="tag fire">炎</span><span class="tm">20分</span></div>
      <div class="stage"><span class="no">4</span><span class="nm">氷結層</span><span class="tag ice">氷</span><span class="tm">40分</span></div>
      <div class="stage lock"><span class="no">5</span><span class="nm">雷鳴洞</span><span class="tag bolt">雷</span><span class="tm">🔒</span></div>
    </div>
  `)}
</div>
<div style="padding:0 var(--pad) 20px">
  <div style="text-align:center;font-size:11px;color:var(--faint);margin-bottom:9px">
    灼熱坑 ・ 標準 ・ 見込み 8分〜20分
  </div>
  <button class="cta">派遣する</button>
</div>`
};

// ---------------------------------------------------------------- 帰還レポート

export const report = {
  scene: 'report',
  html: `
${topbar({ title: '帰還レポート', gold: 12658, meta: '灼熱坑' })}
<div class="stack">

  ${panel('', `
    <div style="display:flex;align-items:baseline;gap:10px">
      <span class="display" style="font-size:19px;color:var(--gold-hi)">深度 16 で撤退</span>
      <span style="font-size:11px;color:var(--faint)">/ 20</span>
    </div>
    <div style="font-size:11.5px;color:var(--dim);margin-top:5px">ボス『炎の主』の手前で引き返した</div>
  `, 'raised')}

  ${panel('見どころ', `
    <div class="beats">
      <div class="beat key"><i class="b"></i><span>炎が効かない敵に炎武器で挑み、火力を約 27% 捨てていた</span></div>
      <div class="beat"><i class="b"></i><span>《積年の盾》が被弾のたび硬くなり、後半ほど削られにくくなった</span></div>
      <div class="beat"><i class="b"></i><span>16/20 で撤退ラインに触れた。防御の支えが無く、HPの残量だけが頼りだった</span></div>
    </div>
  `)}

  ${panel('この回の数字', `
    <div class="figs">
      <div class="fig"><div class="l">与えた</div><div class="v">6,559</div></div>
      <div class="fig"><div class="l">受けた</div><div class="v">2,104</div></div>
      <div class="fig"><div class="l">撃破</div><div class="v">49</div></div>
    </div>
  `)}

  ${panel('戦利品', `
    <div class="list">
      <div class="item relic">
        <div class="ic">◈</div>
        <div class="tx"><div class="n">静かな刃の両手剣</div><div class="m">遺物 ・ 秒間 197</div></div>
        <div class="rr" style="color:var(--venom)">▲159</div>
      </div>
      <div class="item rare">
        <div class="ic">🛡</div>
        <div class="tx"><div class="n">氷結の重鎧</div><div class="m">稀少 ・ 防御 142</div></div>
        <div class="rr" style="color:var(--venom)">▲48</div>
      </div>
      <div class="item fine">
        <div class="ic">⚔</div>
        <div class="tx"><div class="n">毒の槍</div><div class="m">上質 ・ 秒間 133</div></div>
        <div class="rr" style="color:var(--blood)">▼64</div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:var(--faint);margin-top:9px">ほか 6個</div>
  `)}
</div>
<div style="padding:0 var(--pad) 20px">
  <button class="cta">未鑑定品 9個を開封する</button>
</div>`
};

// ---------------------------------------------------------------- 開封

export const reveal = {
  scene: 'reveal',
  html: `
${topbar({ title: '開封', gold: 12658 })}
<div class="reveal">
  <div class="plate">
    <div class="tier">Relic</div>
    <div class="nm display">静かな刃</div>
    <div class="base">両手剣</div>
    <div class="sep"></div>
    <div class="st"><span class="l">秒間火力</span><span>197 <b style="color:var(--venom);font-size:11px">▲159</b></span></div>
    <div class="st"><span class="l">威力</span><span>298 <b style="color:var(--venom);font-size:11px">▲211</b></span></div>
    <div class="st"><span class="l">会心</span><span style="color:var(--faint)">—</span></div>
    <div class="sep"></div>
    <div style="text-align:left">
      <div style="font-size:11.5px;color:var(--gold-hi);margin-bottom:4px">《静かな刃》</div>
      <div style="font-size:11px;color:var(--dim);line-height:1.55">
        会心が発生しない。代わりに全攻撃の威力が常時 +25%
      </div>
    </div>
  </div>
</div>
<div class="counter">6 / 10 ・ タップで次へ</div>
<div class="float gold" style="right:20px;top:52px">+630G</div>`
};

// ---------------------------------------------------------------- 装備比較

export const compare = {
  scene: 'pedestal',
  html: `
${topbar({ title: '武器を選ぶ', back: true, gold: 12430 })}
<div class="stack bottom">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div>
      <div style="font-size:9.5px;letter-spacing:0.18em;color:var(--faint);margin-bottom:6px">CURRENT</div>
      <div class="card fine">
        <div class="rt">Fine</div>
        <div class="nm">鋼の片手剣</div>
        <div class="row"><span class="l">秒間火力</span><span class="v">118</span></div>
        <div class="row"><span class="l">威力</span><span class="v">94</span></div>
        <div class="row"><span class="l">速度</span><span class="v">1.26</span></div>
        <div class="row"><span class="l">会心</span><span class="v">5.0%</span></div>
        <div class="fx"><div><span>攻撃力</span><span>★★☆☆☆</span></div></div>
      </div>
    </div>
    <div>
      <div style="font-size:9.5px;letter-spacing:0.18em;color:var(--gold);margin-bottom:6px">CANDIDATE</div>
      <div class="card rare">
        <div class="rt">Rare</div>
        <div class="nm">氷結の槍</div>
        <div class="row"><span class="l">秒間火力</span><span class="v">163<b class="d up">▲45</b></span></div>
        <div class="row"><span class="l">威力</span><span class="v">160<b class="d up">▲66</b></span></div>
        <div class="row"><span class="l">速度</span><span class="v">1.02<b class="d dn">▼24</b></span></div>
        <div class="row"><span class="l">会心</span><span class="v">6.2%<b class="d up">▲1.2</b></span></div>
        <div class="fx">
          <div><span>氷ダメージ追加</span><span>★★★★☆</span></div>
          <div><span>窮地の威力</span><span>★★★☆☆</span></div>
          <div><span>連撃加速</span><span>★★☆☆☆</span></div>
        </div>
      </div>
    </div>
  </div>
  <div class="verdict">この候補のほうが 45 強い ・ 氷は灼熱坑の弱点</div>
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">
    <button class="cta ghost">戻る</button>
    <button class="cta">装備する</button>
  </div>
</div>`
};

// ---------------------------------------------------------------- インベントリ

export const inventory = {
  scene: 'pedestalFrost',
  html: `
${topbar({ title: '所持品', back: true, gold: 12430, meta: '202点' })}
<div class="stack">
  ${panel('', `
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <span class="pill" style="color:var(--gold);border-color:rgba(233,190,116,0.5)">秒間火力</span>
      <span class="pill">レア</span>
      <span class="pill">種別</span>
      <span class="pill">新着</span>
    </div>
  `)}
  <div class="list" style="gap:7px">
    <div class="item relic"><div class="ic">◈</div><div class="tx"><div class="n">静かな刃の両手剣</div><div class="m">遺物 ・ 秒間197 ・ 効果3</div></div><div class="rr" style="color:var(--venom)">▲159</div></div>
    <div class="item rare"><div class="ic">⚔</div><div class="tx"><div class="n">氷結の槍</div><div class="m">稀少 ・ 秒間163 ・ 効果3</div></div><div class="rr" style="color:var(--venom)">▲45</div></div>
    <div class="item rare"><div class="ic">🛡</div><div class="tx"><div class="n">背水の鎧の重鎧</div><div class="m">稀少 ・ 防御142</div></div><div class="rr" style="color:var(--venom)">▲48</div></div>
    <div class="item fine"><div class="ic">⚔</div><div class="tx"><div class="n">毒の弓</div><div class="m">上質 ・ 秒間133</div></div><div class="rr" style="color:var(--blood)">▼30</div></div>
    <div class="item fine"><div class="ic">🛡</div><div class="tx"><div class="n">軽鎧</div><div class="m">上質 ・ 防御110</div></div><div class="rr" style="color:var(--blood)">▼32</div></div>
    <div class="item"><div class="ic">⚔</div><div class="tx"><div class="n">短剣</div><div class="m">並 ・ 秒間115</div></div><div class="rr" style="color:var(--faint)">36G</div></div>
    <div class="item"><div class="ic">🛡</div><div class="tx"><div class="n">中鎧</div><div class="m">並 ・ 防御88</div></div><div class="rr" style="color:var(--faint)">28G</div></div>
    <div class="item"><div class="ic">⚔</div><div class="tx"><div class="n">炎の杖</div><div class="m">並 ・ 秒間108</div></div><div class="rr" style="color:var(--faint)">31G</div></div>
    <div class="item fine"><div class="ic">🛡</div><div class="tx"><div class="n">鋼の重鎧</div><div class="m">上質 ・ 防御103</div></div><div class="rr" style="color:var(--blood)">▼39</div></div>
    <div class="item"><div class="ic">⚔</div><div class="tx"><div class="n">両手剣</div><div class="m">並 ・ 秒間112</div></div><div class="rr" style="color:var(--faint)">34G</div></div>
    <div class="item"><div class="ic">🛡</div><div class="tx"><div class="n">軽鎧</div><div class="m">並 ・ 防御79</div></div><div class="rr" style="color:var(--faint)">22G</div></div>
  </div>
</div>
<div style="padding:0 var(--pad) 20px">
  <button class="cta ghost">表示中の 80個を売る ・ 6,233G</button>
</div>`
};

export const SCREENS = { base, dispatch, report, reveal, compare, inventory };
