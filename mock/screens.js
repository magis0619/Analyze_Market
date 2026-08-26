// docs/UI-SPEC.md §2「画面の全指定」をそのまま組んだもの。
//
// 検証（§7.1）のために、要素には data 属性を付ける:
//   data-screen … 今どの画面が出ているか（撮影事故の防止。§7.2）
//   data-role   … headline / cta / gold / toast など、表明で名指しするもの
//   data-tap    … 触れるもの。44px 以上であることを機械的に確かめる
//
// 3D 側には文字も数値も置かない。ここにあるものが画面の全情報である。

const topbar = ({ title, back, gold, live, meta, tier }) => `
  <header class="topbar" data-role="topbar">
    ${back ? '<button class="back" data-tap data-role="back">‹</button>' : ''}
    <h1>${title}</h1>
    <div class="spacer"></div>
    ${meta ? `<span class="pill">${meta}</span>` : ''}
    ${tier && tier > 1 ? `<span class="pill warn">難易度+${tier - 1}</span>` : ''}
    ${live ? `<span class="pill live">潜行 ${live}</span>` : ''}
    ${gold !== undefined ? `<span class="stat gold" data-role="gold"><i class="dot"></i>${gold.toLocaleString()}</span>` : ''}
  </header>`;

const panel = (label, body, cls = '') => `
  <section class="panel ${cls}">
    ${label ? `<header><span class="micro">${label}</span><i class="hr"></i></header>` : ''}
    <div class="body">${body}</div>
  </section>`;

const actionbar = (inner, hint) => `
  <footer class="actionbar" data-role="actionbar">
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    ${inner}
  </footer>`;

const cta = (label) => `<button class="btn primary block" data-tap data-role="cta">${label}</button>`;

/** 主要数値の1行。差分は必ず別要素にする（U1 で重なりを表明できるように）。 */
const stat = (label, value, delta, tone) => `
  <div class="row">
    <span class="l">${label}</span>
    <span class="r">
      <span class="v" style="color:var(--${tone ?? 'text'})">${value}</span>
      ${delta ? `<b class="d ${delta.startsWith('▲') ? 'up' : 'dn'}">${delta}</b>` : ''}
    </span>
  </div>`;

// ---------------------------------------------------------------- タイトル

export const title = {
  scene: 'base',
  html: `
${topbar({ title: '' })}
<div class="title-wrap">
  <div>
    <div class="logo en">DELVERS</div>
    <div class="sub">潜る者たち</div>
  </div>
</div>
${actionbar(cta('つづきから'))}
<div class="seed">seed: 7f3a2c</div>`
};

// ---------------------------------------------------------------- 拠点

export const base = {
  scene: 'base',
  html: `
${topbar({ title: '拠点', gold: 12430, live: 1, tier: 3 })}
<div class="stack anchor-bottom">

  ${panel('探索中', `
    <div class="slot">
      <div class="av">⚔</div>
      <div class="who">
        <div class="n">剣士</div>
        <div class="s">灼熱坑 へ潜行中 ・ 深度 7 / 20</div>
      </div>
      <div class="rt">残り<b>14分</b></div>
    </div>
    <div class="progress"><i style="width:38%"></i></div>
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

  <div class="actiongrid">
    <button class="action primary" data-tap>
      <span class="micro">Unopened</span>未鑑定品を開封<span class="badge">7</span>
    </button>
    <button class="action" data-tap>
      <span class="micro">Report</span>帰還レポート<span class="badge">2</span>
    </button>
    <button class="action" data-tap><span class="micro">Dispatch</span>派遣準備</button>
    <button class="action" data-tap><span class="micro">Inventory</span>インベントリ</button>
  </div>

  ${panel('', `
    <div class="figs">
      <div class="fig"><div class="micro">踏破</div><div class="v">7<span style="font-size:var(--fs-label);color:var(--faint)">/10</span></div></div>
      <div class="fig"><div class="micro">図鑑</div><div class="v">124</div></div>
      <div class="fig"><div class="micro">次の枠</div><div class="v" style="color:var(--gold)">2400</div></div>
    </div>
  `)}
</div>
<div class="toasts"><div class="toast gold" data-role="toast">冒険者が帰還した</div></div>
<div class="float gold" style="right:20px;top:60px">+630</div>`
};

// ---------------------------------------------------------------- 派遣準備

export const dispatch = {
  scene: 'dispatch',
  html: `
${topbar({ title: '派遣準備', back: true, gold: 12430, live: 1 })}
<div class="stack">

  ${panel('装備', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
      <button class="item rare" data-tap>
        <div class="ic">⚔</div>
        <div class="tx"><div class="n">炎の片手剣</div><div class="m">秒間 118</div></div>
      </button>
      <button class="item fine" data-tap>
        <div class="ic">🛡</div>
        <div class="tx"><div class="n">鋼の中鎧</div><div class="m">防御 94</div></div>
      </button>
    </div>
    <div style="margin-top:var(--sp-2);font-size:var(--fs-label);color:var(--ember);line-height:1.5">
      ⚠ 灼熱坑は炎に耐性。炎寄りの武器では火力が半減する
    </div>
  `)}

  ${panel('撤退ルール', `
    <div class="rules">
      <div class="rule" style="--rcol:var(--down)" data-tap>
        <div class="n">深追い</div>
        <div class="g"><i style="width:100%"></i></div>
        <div class="d2">HPが0に<br>なるまで戦う</div>
      </div>
      <div class="rule on" style="--rcol:var(--gold)" data-tap>
        <div class="n">標準</div>
        <div class="g"><i style="width:70%"></i><u style="left:30%"></u></div>
        <div class="d2">HP30%を<br>切ったら帰還</div>
      </div>
      <div class="rule" style="--rcol:var(--up)" data-tap>
        <div class="n">慎重</div>
        <div class="g"><i style="width:50%"></i><u style="left:50%"></u></div>
        <div class="d2">HP50%を<br>切ったら帰還</div>
      </div>
    </div>
  `)}

  ${panel('派遣先', `
    <div class="stages">
      <div class="stage" data-tap><span class="no">2</span><span class="nm">苔の回廊</span><span class="tag pois">毒</span><span class="tm">10分</span></div>
      <div class="stage on" data-tap><span class="no">3</span><span class="nm">灼熱坑</span><span class="tag fire">炎</span><span class="tm">20分</span></div>
      <div class="stage" data-tap><span class="no">4</span><span class="nm">氷結層</span><span class="tag ice">氷</span><span class="tm">40分</span></div>
      <div class="stage lock" data-tap><span class="no">5</span><span class="nm">雷鳴洞</span><span class="tag bolt">雷</span><span class="tm">1,200G</span></div>
    </div>
  `)}

  ${panel('灼熱坑', `
    <div class="row"><span class="l">敵の属性</span><span class="tag fire">炎</span></div>
    <div class="row"><span class="l">弱点</span><span class="tag ice">氷</span></div>
    <div class="row"><span class="l">効きにくい</span><span class="v" style="color:var(--ember)">炎</span></div>
    <div class="row"><span class="l">出る敵</span><span class="v" style="font-size:var(--fs-label)">灼熱のコウモリ / 燃える石像</span></div>
    <div class="row"><span class="l">ボス</span><span class="v" style="color:var(--down);font-size:var(--fs-label)">炎の主</span></div>
  `)}
</div>
${actionbar(cta('派遣する'), '灼熱坑 ・ 標準 ・ 見込み 8分〜20分')}`
};

// ---------------------------------------------------------------- 装備比較

export const compare = {
  scene: 'pedestal',
  html: `
${topbar({ title: '武器を選ぶ', back: true, gold: 12430 })}
<div class="stack anchor-bottom">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
    <div>
      <div class="micro" style="margin-bottom:var(--sp-1)">Current</div>
      <div class="card fine">
        <div class="micro tier">Fine</div>
        <div class="nm">鋼の片手剣</div>
        ${stat('秒間火力', '118', null, 'atk')}
        ${stat('威力', '94')}
        ${stat('速度', '1.26', null, 'spd')}
        ${stat('会心', '5.0%', null, 'crit')}
        <div class="fx"><div><span>攻撃力</span><span>★★☆☆☆</span></div></div>
      </div>
    </div>
    <div>
      <div class="micro" style="margin-bottom:var(--sp-1);color:var(--gold)">Candidate</div>
      <div class="card rare">
        <div class="micro tier">Rare</div>
        <div class="nm">氷結の槍</div>
        ${stat('秒間火力', '163', '▲45', 'atk')}
        ${stat('威力', '160', '▲66')}
        ${stat('速度', '1.02', '▼24', 'spd')}
        ${stat('会心', '6.2%', '▲1.2', 'crit')}
        <div class="fx">
          <div><span>氷ダメージ追加</span><span>★★★★☆</span></div>
          <div><span>窮地の威力</span><span>★★★☆☆</span></div>
          <div><span>連撃加速</span><span>★★☆☆☆</span></div>
        </div>
      </div>
    </div>
  </div>
  <div class="verdict" data-role="verdict">この候補のほうが 45 強い ・ 氷は灼熱坑の弱点</div>
  <div class="list">
    <div class="item relic" data-tap><div class="ic">◈</div><div class="tx"><div class="n">静かな刃の両手剣</div><div class="m">遺物 ・ 秒間197</div></div><div class="rr" style="color:var(--up)">▲79</div></div>
    <div class="item rare on" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">氷結の槍</div><div class="m">稀少 ・ 秒間163</div></div><div class="rr" style="color:var(--up)">▲45</div></div>
    <div class="item fine" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">毒の弓</div><div class="m">上質 ・ 秒間133</div></div><div class="rr" style="color:var(--up)">▲15</div></div>
  </div>
</div>
${actionbar(`<div class="pair">
  <button class="btn" data-tap>戻る</button>
  ${cta('装備する')}
</div>`, '別の行を叩けば比べ直せる')}`
};

// ---------------------------------------------------------------- 帰還レポート

export const report = {
  scene: 'report',
  html: `
${topbar({ title: '帰還レポート', gold: 12658, meta: '灼熱坑' })}
<div class="stack">

  ${panel('', `
    <div data-role="headline" style="display:flex;align-items:baseline;gap:var(--sp-2)">
      <span class="en" style="font-size:var(--fs-display);color:var(--gold-hi)">深度 16 で撤退</span>
      <span style="font-size:var(--fs-label);color:var(--faint)">/ 20</span>
    </div>
    <div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-1)">ボス『炎の主』の手前で引き返した</div>
  `, 'raised')}

  ${panel('見どころ', `
    <div class="beats">
      <div class="beat key"><i></i><span>炎が効かない敵に炎武器で挑み、火力を約 27% 捨てていた</span></div>
      <div class="beat"><i></i><span>《積年の盾》が被弾のたび硬くなり、後半ほど削られにくくなった</span></div>
      <div class="beat"><i></i><span>16/20 で撤退ラインに触れた。防御の支えが無く、HPの残量だけが頼りだった</span></div>
    </div>
  `)}

  ${panel('この回の数字', `
    <div class="figs">
      <div class="fig"><div class="micro">与えた</div><div class="v">6,559</div></div>
      <div class="fig"><div class="micro">受けた</div><div class="v">2,104</div></div>
      <div class="fig"><div class="micro">撃破</div><div class="v">49</div></div>
    </div>
  `)}

  ${panel('次の一手', `
    <div class="beats">
      <div class="beat"><i style="background:var(--up)"></i><span>灼熱坑の弱点は氷。氷寄りの武器なら火力が1.5倍になる</span></div>
      <div class="beat"><i style="background:var(--up)"></i><span>敵は炎で攻めてくる。炎耐性の付いた防具を探すと生存が伸びる</span></div>
    </div>
  `)}

  ${panel('戦利品', `
    <div class="list">
      <div class="item relic"><div class="ic">◈</div><div class="tx"><div class="n">静かな刃の両手剣</div><div class="m">遺物 ・ 秒間197</div></div><div class="rr" style="color:var(--up)">▲159</div></div>
      <div class="item rare"><div class="ic">🛡</div><div class="tx"><div class="n">氷結の重鎧</div><div class="m">稀少 ・ 防御142</div></div><div class="rr" style="color:var(--up)">▲48</div></div>
      <div class="item fine"><div class="ic">⚔</div><div class="tx"><div class="n">毒の槍</div><div class="m">上質 ・ 秒間133</div></div><div class="rr" style="color:var(--down)">▼64</div></div>
    </div>
    <div style="text-align:center;font-size:var(--fs-label);color:var(--faint);margin-top:var(--sp-2)">ほか 6個</div>
  `)}
</div>
${actionbar(cta('未鑑定品 9個を開封する'))}
<div class="toasts"><div class="toast gold" data-role="toast">未鑑定品 9個</div></div>
<div class="float gold" style="right:20px;top:60px">+228</div>`
};

// ---------------------------------------------------------------- 開封

export const reveal = {
  scene: 'reveal',
  html: `
${topbar({ title: '開封', gold: 12658 })}
<!-- 札は absolute なので縦の場所を取らない。空の伸び代を1つ挟まないと
     ActionBar が見出しの直下まで繰り上がり、CTA が親指の届かない位置へ行く
     （U4 が検出した）。 -->
<div class="stack" aria-hidden="true"></div>
<div class="reveal">
  <div class="plate">
    <div class="micro" style="color:var(--r-relic);letter-spacing:0.42em">Relic</div>
    <div class="nm en">静かな刃</div>
    <div style="font-size:var(--fs-label);color:var(--faint)">両手剣</div>
    <div class="sep"></div>
    ${stat('秒間火力', '197', '▲159', 'atk')}
    ${stat('威力', '298', '▲211')}
    ${stat('会心', '—')}
    <div class="sep"></div>
    <div style="text-align:left">
      <div style="font-size:var(--fs-label);color:var(--gold-hi);margin-bottom:var(--sp-1)">《静かな刃》</div>
      <div style="font-size:var(--fs-label);color:var(--dim);line-height:1.55">
        会心が発生しない。代わりに全攻撃の威力が常時 +25%
      </div>
      <div style="margin-top:var(--sp-2);padding-top:var(--sp-2);border-top:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-label);color:var(--dim);padding:2px 0"><span>攻撃力</span><span>★★★★☆</span></div>
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-label);color:var(--dim);padding:2px 0"><span>窮地の威力</span><span>★★★☆☆</span></div>
      </div>
    </div>
  </div>
</div>
${actionbar(cta('次へ'), '6 / 10')}`
};

// ---------------------------------------------------------------- インベントリ

export const inventory = {
  scene: 'vault',
  html: `
${topbar({ title: '所持品', back: true, gold: 12430, meta: '202点' })}
<div class="stack">
  ${panel('', `
    <div class="tabs">
      <div class="tab on" data-tap>秒間火力</div>
      <div class="tab" data-tap>レア</div>
      <div class="tab" data-tap>種別</div>
      <div class="tab" data-tap>新着</div>
    </div>
  `)}
  <div class="list">
    <div class="item relic" data-tap><div class="ic">◈</div><div class="tx"><div class="n">静かな刃の両手剣</div><div class="m">遺物 ・ 秒間197 ・ 効果3</div></div><div class="rr" style="color:var(--up)">▲159</div></div>
    <div class="item rare" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">氷結の槍</div><div class="m">稀少 ・ 秒間163 ・ 効果3</div></div><div class="rr" style="color:var(--up)">▲45</div></div>
    <div class="item rare" data-tap><div class="ic">🛡</div><div class="tx"><div class="n">背水の鎧の重鎧</div><div class="m">稀少 ・ 防御142</div></div><div class="rr" style="color:var(--up)">▲48</div></div>
    <div class="item fine" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">毒の弓</div><div class="m">上質 ・ 秒間133</div></div><div class="rr" style="color:var(--down)">▼30</div></div>
    <div class="item fine" data-tap><div class="ic">🛡</div><div class="tx"><div class="n">軽鎧</div><div class="m">上質 ・ 防御110</div></div><div class="rr" style="color:var(--down)">▼32</div></div>
    <div class="item common" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">短剣</div><div class="m">並 ・ 秒間115</div></div><div class="rr" style="color:var(--faint)">36G</div></div>
    <div class="item common" data-tap><div class="ic">🛡</div><div class="tx"><div class="n">中鎧</div><div class="m">並 ・ 防御88</div></div><div class="rr" style="color:var(--faint)">28G</div></div>
    <div class="item common" data-tap><div class="ic">⚔</div><div class="tx"><div class="n">炎の杖</div><div class="m">並 ・ 秒間108</div></div><div class="rr" style="color:var(--faint)">31G</div></div>
    <div class="item common" data-tap><div class="ic">🛡</div><div class="tx"><div class="n">軽鎧</div><div class="m">並 ・ 防御79</div></div><div class="rr" style="color:var(--faint)">22G</div></div>
  </div>
</div>
${actionbar(`<button class="btn block" data-tap data-role="cta">表示中の 80個を売る ・ 6,233G</button>`)}`
};

// ---------------------------------------------------------------- 図鑑

const cellHtml = (i) => {
  const tiers = ['common', 'fine', 'rare', 'relic'];
  const t = tiers[i % 4];
  const found = (i * 7) % 10 < 6;
  return found
    ? `<div class="cell found ${t}">${i % 2 ? '⚔' : '🛡'}</div>`
    : '<div class="cell miss">?</div>';
};

export const compendium = {
  scene: 'vault',
  html: `
${topbar({ title: '図鑑', back: true, gold: 12430, meta: '124 / 200' })}
<div class="stack">
  ${panel('', `
    <div class="tabs">
      <div class="tab on" data-tap>装備</div>
      <div class="tab" data-tap>ユニーク効果</div>
    </div>
  `)}
  ${panel('装備', `<div class="grid">${Array.from({ length: 36 }, (_, i) => cellHtml(i)).join('')}</div>`)}
  ${panel('氷結の槍', `
    <div class="row"><span class="l">初出</span><span class="v" style="font-size:var(--fs-label)">氷結層</span></div>
    <div class="row"><span class="l">入手</span><span class="v">×12</span></div>
    <div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-2);line-height:1.5">
      アフィックスを3〜4枠持つ。稀少以上は開封でカットインが入る
    </div>
  `)}
</div>`
};

export const SCREENS = { title, base, dispatch, compare, report, reveal, inventory, compendium };
