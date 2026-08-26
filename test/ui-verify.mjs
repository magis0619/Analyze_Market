import { chromium } from 'playwright';

// docs/UI-SPEC.md §7.1 の U1〜U10 を、**実物に対して**走らせる。
//
// 元はモック（mock/verify.mjs）向けに書いたもので、`?s=<画面名>` で
// 好きな画面へ飛べる前提だった。実物にその抜け道は無いし、作るべきでもない——
// 抜け道で作った画面は、実際に遊んで辿り着く画面と同じとは限らない。
// ここでは本物の状態機械を本物のシミュレーションで進めて、
// 通った先の画面をそのまま測る。
//
//   node test/ui-verify.mjs
//   URL=http://localhost:5173/ node test/ui-verify.mjs
//
// 前提: `npx vite build` 済み、`npx vite preview` が動いていること。

const URL = process.env.URL ?? "http://localhost:4173/";

let pass = 0, fail = 0;
const failures = [];
function check(id, screen, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(`  ${id} [${screen}] ${detail}`);
}

// ---------------------------------------------------------------- 測定本体
//
// ページの中で走る。DOM を測るだけで、キャンバスの中身は一切見ない。
// 見た目の良し悪しではなく「文字が読めるか・押せるか」だけを問う。

const PROBE = () => {
  const inter = (a, b) => !!a && !!b &&
    !(a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5);

  /**
   * 実際に見えている矩形。
   *
   * getBoundingClientRect は**祖先のクリップを見ない**。一覧の下端から
   * 半分はみ出した行も、まるごと見えているかのような矩形を返す。
   * これで重なりを測ると、隠れている行が犯人に見える——
   * 実際 U8/U11 がその偽の失敗を出していた。切り取ってから比べる。
   */
  const box = el => {
    const b = el.getBoundingClientRect();
    let l = b.left, t = b.top, r = b.right, bo = b.bottom;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflow === 'visible' && cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const ab = a.getBoundingClientRect();
      l = Math.max(l, ab.left); t = Math.max(t, ab.top);
      r = Math.min(r, ab.right); bo = Math.min(bo, ab.bottom);
    }
    l = Math.max(l, 0); t = Math.max(t, 0);
    r = Math.min(r, window.innerWidth); bo = Math.min(bo, window.innerHeight);
    if (r <= l || bo <= t) return null;
    return { x: l, y: t, w: r - l, h: bo - t, l, t, r, b: bo };
  };

  const vis = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return box(el) !== null;
  };

  // U1: 値と差分が重なっていない／パネル同士が重なっていない
  const overlaps = [];
  for (const row of document.querySelectorAll('.row')) {
    const v = row.querySelector('.v'), d = row.querySelector('.d');
    if (v && d && vis(v) && vis(d) && inter(box(v), box(d))) {
      overlaps.push(row.textContent.trim().slice(0, 24));
    }
  }
  // 板同士の重なりは**同じ層の中だけ**を見る。
  // 引き出しやシートは本文の上に重なるのが設計なので、
  // 層をまたいで比べると必ず当たる（U8/U11 で踏んだのと同じ穴）。
  const layerOf = (el) => el.closest('.drawer, .sheet, .modal, .reveal') ?? document.body;
  const byLayer = new Map();
  for (const el of document.querySelectorAll('.panel')) {
    if (!vis(el)) continue;
    const b = box(el);
    if (!b) continue;
    const k = layerOf(el);
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k).push(b);
  }
  for (const [, group] of byLayer) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (inter(group[i], group[j])) overlaps.push(`panel${i}×panel${j}`);
      }
    }
  }

  // U2: 文字が枠から溢れていない
  const overflow = [];
  for (const el of document.querySelectorAll('.n, .nm, .l, .v, h1, .toast, .btn, .tag, .cell, .tab, .seed, .hint')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) overflow.push(el.textContent.trim().slice(0, 24));
    if (el.scrollHeight > el.clientHeight + 1) overflow.push(`${el.textContent.trim().slice(0, 16)}(縦)`);
  }

  // U3: タップ対象が 44px 以上
  const small = [];
  for (const el of document.querySelectorAll('[data-tap]')) {
    if (!vis(el)) continue;
    const b = el.getBoundingClientRect();   // 当たり判定の大きさは切り取り前で見る
    if (b.width < 44 || b.height < 44) small.push(`${el.textContent.trim().slice(0, 14)} ${Math.round(b.width)}×${Math.round(b.height)}`);
  }

  // U4: 主要動線が親指到達域（画面下 1/3）にある
  const ctaEl = [...document.querySelectorAll('[data-role=cta]')].filter(vis).pop() ?? null;
  const ctaBox = ctaEl ? box(ctaEl) : null;
  const ctaMid = ctaBox ? ctaBox.t + ctaBox.h / 2 : null;

  // U5: 所持金の位置（画面をまたいで一致するか）
  const goldEl = document.querySelector('[data-role=gold]');

  // U6: 無効ボタンのラベルが読める（コントラスト比 ≥ 3:1）
  const lum = c => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrasts = [];
  for (const el of document.querySelectorAll('.btn[disabled], .action[disabled]')) {
    if (!vis(el)) continue;
    const l1 = lum(getComputedStyle(el).color), l2 = lum('rgb(8,10,17)');
    contrasts.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
  }

  // U7: レアリティ色
  const rarity = {};
  for (const t of ['common', 'fine', 'rare', 'relic']) {
    const el = document.querySelector(`.${t}`);
    if (el) rarity[t] = getComputedStyle(el).getPropertyValue('--rc').trim();
  }

  // U8: 通知が「文字を持つ要素」を覆っていない。
  //
  // 当初は結果行としか比べていなかった。拠点には結果行が無く判定が素通りし、
  // 実際には通知が「インベントリ」に被っていた。地と余白以外は覆わせない。
  const covered = [];
  for (const toast of document.querySelectorAll('[data-role=toast]')) {
    if (!vis(toast)) continue;
    const tb = box(toast);
    for (const el of document.querySelectorAll(
      '.n, .nm, .l, .v, .m, h1, .action, .btn, .beat span, .fig .v, .cell, .tab')) {
      if (!vis(el) || !el.textContent.trim()) continue;
      if (el.closest('.toasts')) continue;
      if (inter(tb, box(el))) covered.push(el.textContent.trim().slice(0, 16));
    }
  }

  // U11: 押せると見えるものが本当に押せる（暗幕に飲まれていないか）。
  //
  // 「見た目は正常なのに押せない」はスクリーンショットでは絶対に分からない。
  // 中心点を叩いたとき、その要素自身（か子孫）が返ってくることを確かめる。
  //
  // ただし「今そこにある操作」だけを問う。暗幕を出しているときは、
  // 裏の一覧が押せないのは**そういう設計**なので数えない。
  // 何が生きている層かは、出ているものから決める:
  //   モーダルがある     → モーダルの中だけ（ActionBar も意図的に暗幕の裏）
  //   シートの暗幕がある → TopBar・シート・ActionBar
  //   どちらも無い       → 全部
  const modalEl = [...document.querySelectorAll('.modal')].find(vis) ?? null;
  const scrimEl = [...document.querySelectorAll('.sheet-back')].find(vis) ?? null;
  const drawerEl = [...document.querySelectorAll('.drawer')].find(vis) ?? null;
  const live = el => {
    if (modalEl) return modalEl.contains(el);
    if (scrimEl) return !!el.closest('.topbar, .sheet, .drawer, .actionbar, .modal');
    return true;
  };
  const blocked = [];
  let liveCount = 0;
  for (const el of document.querySelectorAll('[data-tap]:not([disabled])')) {
    if (!vis(el) || !live(el)) continue;
    // 見えている部分の中心を叩く。切り取られた行は box() が
    // 見えている側の矩形を返すので、隠れた場所を叩いてしまうことはない
    const b = box(el);
    if (!b || b.h < 8) continue;
    const cx = Math.min(window.innerWidth - 1, b.l + b.w / 2);
    const cy = Math.min(window.innerHeight - 1, b.t + b.h / 2);
    liveCount++;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !el.contains(hit)) {
      blocked.push(`${el.textContent.trim().slice(0, 14)} ← ${hit?.className ?? 'なし'}`);
    }
  }

  // U12: 浮かせて置いた文字が、他の文字を踏んでいないか。
  // U8 は通知だけを見ていたので、タイトルの種表示が CTA に踏まれていたのを
  // 見逃していた。position:absolute の文字はすべて同じ目で見る。
  const floated = [];
  for (const el of document.querySelectorAll('.seed, .float, .charge-hint, .banner, .mapnode')) {
    if (!vis(el) || !el.textContent.trim()) continue;
    const fb = box(el);
    for (const other of document.querySelectorAll('.n, .nm, .l, .v, .m, h1, .btn, .action, .tab, .cell')) {
      if (!vis(other) || !other.textContent.trim() || el.contains(other) || other.contains(el)) continue;
      if (inter(fb, box(other))) {
        floated.push(`${el.textContent.trim().slice(0, 12)} × ${other.textContent.trim().slice(0, 12)}`);
      }
    }
  }

  // U13/U14: ボタンの段（§3.3）。
  //
  // 「どれを押せばいいか分からない」は目で見ても言葉にしづらいが、
  // 段の規則に落とせば表明で確かめられる。
  //   1画面に primary はたかだか1つ
  //   primary は ActionBar の中（本文に散らさない）
  //   取り消せない操作は primary にしない（確認の中は例外）
  const tiers = [...document.querySelectorAll('[data-tier]')].filter(vis);
  const primaries = tiers.filter(el => el.dataset.tier === 'primary');
  const inModal = (el) => !!el.closest('.modal');
  const primaryOutside = primaries.filter(el => !el.closest('.actionbar') && !inModal(el));
  const dangerAsPrimary = tiers.filter(el =>
    el.dataset.tier === 'primary' && !inModal(el)
    && /売却|売る|破棄|捨て/.test(el.textContent ?? ''));

  // U16: World層が白飛びしていないか。
  //
  // 「眩しすぎる」は言葉にしづらいが、飽和した画素の割合なら測れる。
  // 3D が白く飛ぶと、その上に載る文字が読めなくなるだけでなく、
  // 見せているはずの形（鎧の胴・剣の刃）も消える。実際、鎧を出したとき
  // ブルームに拾われて「形の分からない光の塊」になっていた。
  let blown = -1;
  const gl = document.getElementById('gl');
  if (gl instanceof HTMLCanvasElement) {
    try {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 260;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(gl, 0, 0, c.width, c.height);
      const px = cx.getImageData(0, 0, c.width, c.height).data;
      let hot = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 248 && px[i + 1] > 248 && px[i + 2] > 248) hot++;
      }
      blown = hot / (c.width * c.height);
    } catch { blown = -1; }
  }

  // U17: リングの円弧が、宣言した割合と実際に一致しているか（指示書 §2）。
  //
  // SVG で描くのは canvas と違って**測れる形で残るから**。
  // stroke-dasharray の実測値から割合を逆算して、data-ratio と突き合わせる。
  // 「10分の3なのに半分埋まっている」は目で見ても気づけない。
  const rings = [...document.querySelectorAll('[data-role=ring]')].filter(vis);
  const ringMismatch = [];
  for (const r of rings) {
    const arc = r.querySelector('.val');
    const want = Number(r.dataset.ratio);
    if (!arc || !Number.isFinite(want)) continue;
    const dash = getComputedStyle(arc).strokeDasharray;
    const parts = dash.split(/[ ,]+/).map(parseFloat).filter(Number.isFinite);
    if (parts.length < 2) continue;
    const total = parts[0] + parts[1];
    // 上限のない量は破線（3 5 の繰り返し）なので割合を持たない
    if (total < 20) continue;
    const got = parts[0] / total;
    if (Math.abs(got - want) > 0.02) {
      ringMismatch.push(`${r.textContent.trim().slice(0, 8)} ${got.toFixed(2)}≠${want.toFixed(2)}`);
    }
  }

  const hScroll = document.documentElement.scrollWidth > window.innerWidth + 1;

  return {
    overlaps, overflow, small, ctaMid, thumbTop: window.innerHeight * (2 / 3),
    gold: goldEl ? box(goldEl) : null, contrasts, rarity, covered, blocked, floated, hScroll,
    tapCount: [...document.querySelectorAll('[data-tap]')].filter(vis).length,
    primaryCount: primaries.length,
    primaryLabels: primaries.map(el => el.textContent.trim().slice(0, 14)),
    primaryOutside: primaryOutside.map(el => el.textContent.trim().slice(0, 14)),
    dangerAsPrimary: dangerAsPrimary.map(el => el.textContent.trim().slice(0, 14)),
    tierCount: tiers.length,
    ringCount: rings.length,
    ringMismatch,
    blown,
    liveCount,
    toastCount: [...document.querySelectorAll('[data-role=toast]')].filter(vis).length,
    modal: !!modalEl,
    screen: document.documentElement.dataset.screen,
    renderError: document.querySelector('[data-role=render-error]')?.textContent?.trim() ?? null
  };
};

const goldRects = {};
const rarityByScreen = {};

async function probe(page, name, { needsTap = true } = {}) {
  const r = await page.evaluate(PROBE);

  // 撮っている／測っている対象が本当にその画面か（§7.2）
  check('S0', name, r.screen === name, `data-screen が "${r.screen}"。別の画面を測っている`);
  check('S1', name, r.renderError === null, `描画に失敗している: ${r.renderError}`);

  check('U1', name, r.overlaps.length === 0, `重なり ${r.overlaps.length}件: ${r.overlaps.slice(0, 3).join(' / ')}`);
  check('U2', name, r.overflow.length === 0, `溢れ ${r.overflow.length}件: ${r.overflow.slice(0, 3).join(' / ')}`);
  check('U3', name, r.small.length === 0, `44px未満 ${r.small.length}件: ${r.small.slice(0, 3).join(' / ')}`);
  if (r.ctaMid !== null) {
    check('U4', name, r.ctaMid >= r.thumbTop,
      `CTA中心 y=${Math.round(r.ctaMid)} が親指到達域(y≧${Math.round(r.thumbTop)})の外`);
  }
  if (r.gold) goldRects[name] = r.gold;
  if (Object.keys(r.rarity).length) rarityByScreen[name] = r.rarity;
  check('U6', name, r.contrasts.every(c => c >= 3),
    `無効ラベルのコントラスト ${r.contrasts.map(c => c.toFixed(1)).join(',')}`);
  check('U8', name, r.covered.length === 0,
    `通知が文字を覆っている ${r.covered.length}件: ${r.covered.slice(0, 3).join(' / ')}`);
  check('U13', name, r.primaryCount <= 1,
    `primary が ${r.primaryCount} 個ある: ${r.primaryLabels.join(' / ')}`);
  check('U13b', name, r.primaryOutside.length === 0,
    `primary が ActionBar の外にある: ${r.primaryOutside.join(' / ')}`);
  check('U14', name, r.dangerAsPrimary.length === 0,
    `取り消せない操作が primary になっている: ${r.dangerAsPrimary.join(' / ')}`);
  check('U15', name, r.tierCount > 0, '段を宣言したボタンが1つも無い');
  check('U17', name, r.ringMismatch.length === 0,
    `リングの円弧が割合と合っていない: ${r.ringMismatch.slice(0, 3).join(' / ')}`);
  // 3% を超えて真っ白なら、光ではなく白飛び
  if (r.blown >= 0) {
    check('U16', name, r.blown <= 0.03,
      `3D の ${(r.blown * 100).toFixed(1)}% が白飛びしている`);
  }
  check('U12', name, r.floated.length === 0,
    `浮かせた文字が他の文字を踏んでいる ${r.floated.length}件: ${r.floated.slice(0, 3).join(' / ')}`);
  check('U11', name, r.blocked.length === 0,
    `押せない操作 ${r.blocked.length}件: ${r.blocked.slice(0, 3).join(' / ')}`);
  // 「生きている操作が0件」だと U11 は無条件に通る。素通りを防ぐ
  if (needsTap) check('U11b', name, r.liveCount > 0, '今その場で押せる操作が1つも無い');
  check('HS', name, !r.hScroll, '横スクロールが発生している');
  if (needsTap) check('U3b', name, r.tapCount > 0, 'タップ対象が1つも無い');
  return r;
}

// ---------------------------------------------------------------- 実行

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => { fail++; failures.push(`  JS例外: ${e.message}`); });

const seed = '1a2b3c4d';
// 早送りは控えめに。4000倍だと派遣が最初の観測より先に終わってしまい、
// 派遣中の表示（進行バー・出来事の印）を一度も見られない。
// 60倍なら5分の派遣が5秒で終わり、途中も観測できる
const boot = `${URL}?reset=1&seed=${seed}&devitems=100&timescale=60&probe=1`;

// --- タイトル
await page.goto(boot, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await probe(page, 'title');

// --- 拠点
await page.click('[data-role=cta]');
await page.waitForTimeout(900);
await probe(page, 'base');

// 拠点の行き先は**物**になった（カード脱却指示書 §2）。
// 名札は 3D の位置に置くので、放っておくと重なるし画面外へも落ちる
{
  const pr = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.prop')];
    const shown = els.filter(e => getComputedStyle(e).visibility !== 'hidden');
    const boxes = shown.map(e => e.getBoundingClientRect());
    let overlap = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) {
          overlap.push(`${shown[i].textContent.trim()}×${shown[j].textContent.trim()}`);
        }
      }
    }
    const out = boxes.filter(b => b.left < 0 || b.right > window.innerWidth).length;
    return {
      total: els.length, shown: shown.length, overlap, out,
      tiles: document.querySelectorAll('.actiongrid').length
    };
  });
  check('H1', 'base', pr.total === 5, `拠点の行き先が ${pr.total} 個（5 であるべき）`);
  check('H2', 'base', pr.shown === 5, `映っている名札が ${pr.shown} 個しかない`);
  check('H3', 'base', pr.overlap.length === 0, `名札が重なっている: ${pr.overlap.join(' / ')}`);
  check('H4', 'base', pr.out === 0, `名札が ${pr.out} 個 画面からはみ出している`);
  check('H5', 'base', pr.tiles === 0, 'タイルの並びが残っている（物に置き換えるはず）');
}

// --- 派遣準備
await page.click('[data-act=dispatch]');
await page.waitForTimeout(500);
await probe(page, 'dispatch');

// --- 派遣先の地図（カード脱却指示書 §1）
//
// 10行の一覧を 3D の経路に置き換えた面。**ノードは DOM のボタン**なので、
// 44px あるか・本当に押せるかを普通に測れる（Raycaster にすると測れない）。
await page.click('[data-act=map-open]');
await page.waitForTimeout(900);
{
  const m = await probe(page, 'dispatch');
  const n = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.mapnode')];
    const shown = els.filter(e => getComputedStyle(e).visibility !== 'hidden');
    const boxes = shown.map(e => e.getBoundingClientRect());
    let overlap = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) overlap++;
      }
    }
    return { total: els.length, shown: shown.length, overlap, on: document.querySelectorAll('.mapnode.on').length };
  });
  check('M1', 'dispatch', n.total === 10, `ノードが ${n.total} 個（10 であるべき）`);
  // **全部映っていること。** 画面の外へ落ちたノードは押せない＝そのステージへ行けない
  check('M2', 'dispatch', n.shown === 10, `映っているノードが ${n.shown} 個しかない`);
  check('M3', 'dispatch', n.overlap === 0, `ノード同士が ${n.overlap} 組重なっている`);
  check('M4', 'dispatch', n.on === 1, `選択中のノードが ${n.on} 個`);
  check('M5', 'dispatch', m.ringCount >= 0 && m.renderError === null, '地図の描画に失敗している');
}
// 別のノードを押すと選択が移る
await page.click('.mapnode[data-id="2"]');
await page.waitForTimeout(700);
check('M6', 'dispatch',
  await page.evaluate(() => document.querySelector('.mapnode.on')?.dataset.id) === '2',
  'ノードを押しても選択が移らない');
await probe(page, 'dispatch');
// 未解放を選ぶと、下端が「送る」から「解放する」に変わる。
// 行けない場所を選んだまま送れてしまわないこと
check('M7', 'dispatch', await page.evaluate(() => {
  const b = document.querySelector('[data-role=cta]');
  return !!b && b.hasAttribute('disabled') && b.textContent.includes('解放');
}), '未解放のノードを選んでも下端が「送る」のまま');
await page.click('.mapnode[data-id="1"]');
await page.waitForTimeout(700);
await page.click('[data-role=cta]');            // 「ここへ送る」で地図を閉じる
await page.waitForTimeout(600);
check('M8', 'dispatch', (await page.$('.mapnode')) === null, '地図が閉じていない');
await probe(page, 'dispatch');

// --- 装備選択（シート）。ここは data-screen 上は dispatch のまま
await page.click('[data-act=pick-open][data-slot=weapon]').catch(() => {});
await page.waitForTimeout(400);
if (await page.$('.sheet')) {
  await probe(page, 'dispatch');
  // 升目（カード脱却指示書 §3）。文字を置かないので、
  // **絵が焼けていること**が「何を選んでいるか分かる」の全部になる
  check('P1', 'dispatch', (await page.$('.tiles .tile')) !== null, '装備の升目が出ていない');
  check('P2', 'dispatch', (await page.$('.sheet-list .item')) === null,
    '升目にしたはずの一覧に行が残っている');
  // 掴んだ要素ではなくセレクタで叩く。一覧はサムネが焼き上がるたびに
  // 描き直されるので、掴んだ参照はすぐ古くなる（実際 detached で落ちた）
  if (await page.$('.tiles .tile')) {
    await page.click('.tiles .tile');
    await page.waitForTimeout(600);
    await probe(page, 'dispatch');

    // 台座の送り（§3「台座カルーセル」）。一覧に戻らず隣と比べ続けられること
    const at = () => page.evaluate(() =>
      document.querySelector('.carousel .c')?.textContent?.trim() ?? '');
    check('P3', 'dispatch', (await at()).includes('/'), '台座に何番目かが出ていない');
    const before = await at();
    check('P4', 'dispatch',
      await page.evaluate(() => document.querySelector('[data-act=pick-prev]')?.hasAttribute('disabled')),
      '先頭なのに「前へ」が押せる');
    await page.click('[data-act=pick-next]');
    await page.waitForTimeout(600);
    const after = await at();
    check('P5', 'dispatch', after !== before && after !== '',
      `送っても番号が変わらない（${before} → ${after}）`);
    // 送った先が台座に載っていること（数字だけ動いて絵が変わらない壊れ方を防ぐ）
    check('P6', 'dispatch', await page.evaluate(() => {
      const sel = document.querySelector('.tile.on');
      const nm = document.querySelector('.sheet-compare .nm');
      return !!sel && !!nm;
    }), '送った先が升目でも台座でも選ばれていない');
    await probe(page, 'dispatch');
    // 送りが効いていなければ「前へ」は無効のまま。例外で落とすと
    // ここから先の検証が全部走らなくなるので、失敗として記録して進む
    await page.click('[data-act=pick-prev]', { timeout: 4000 })
      .catch(() => check('P7', 'dispatch', false, '送った後なのに「前へ」が押せない'));
    await page.waitForTimeout(500);
    // 実際に装備する。初期装備のままだと派遣が数秒で終わってしまい、
    // 派遣中の表示（§4）を一度も観測できない
    if (await page.$('[data-act=equip]:not([disabled])')) {
      await page.click('[data-act=equip]');
      await page.waitForTimeout(500);
    }
  }
  if (await page.$('[data-act=pick-close]')) {
    await page.click('[data-act=pick-close]');
    await page.waitForTimeout(350);
  }
}

// --- 派遣して、本物のシミュレーションが返ってくるのを待つ
await page.click('[data-role=cta]');
await page.waitForTimeout(600);

// T9: 派遣中、**進行率より先の出来事は見えてはいけない**（指示書 §4）。
//
// 結果は派遣した時点で確定しているので、うっかり全部出すことができてしまう。
// 出たら待つ意味が無くなる。印の位置がバーの伸びを追い越していないかを
// 幾何で見る——「何件見えるべきか」を数えるより、この不等式のほうが直接的。
let sawRun = false;
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.progress');
    const fill = bar?.querySelector('i');
    if (!bar || !fill) return null;
    const w = bar.getBoundingClientRect().width;
    const done = fill.getBoundingClientRect().width;
    const marks = [...bar.querySelectorAll('.mk')]
      .map(e => (e.getBoundingClientRect().left - bar.getBoundingClientRect().left));
    return { w, done, ahead: marks.filter(x => x > done + 2).length, n: marks.length,
             toasts: document.querySelectorAll('[data-role=toast]').length };
  });
  if (m && m.w > 0) {
    sawRun = true;
    check('T9', 'base', m.ahead === 0, `先の出来事が ${m.ahead} 件見えている`);
    check('T10', 'base', m.toasts <= 2, `通知が ${m.toasts} 件積み上がっている`);
  }
  if (await page.evaluate(() => window.__delvers.state.data.inbox.length > 0)) break;
}
check('T11', 'base', sawRun, '派遣中の進行バーを一度も観測できなかった');
check('SIM', '通し', await page.evaluate(() => window.__delvers.state.data.inbox.length > 0),
  '派遣した冒険者が帰ってこなかった');
await page.waitForTimeout(400);
await probe(page, 'base');

// --- 帰還レポート（通知が出ている間に測る）
await page.click('[data-act=report]');
// 通知が**出切る**まで待つ。U8 は通知が画面に無いと素通りしてしまうので、
// 「たぶん出ているはず」では測らない。
// DOM にある＝見えている、でもない——出現アニメの最初の数フレームは
// opacity:0 で、測定側はそれを（正しく）見えていないと判定する。
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(150);
  const ready = await page.evaluate(() => {
    const t = document.querySelector('[data-role=toast]');
    return !!t && parseFloat(getComputedStyle(t).opacity) > 0.9;
  });
  if (ready) break;
}
const rep = await probe(page, 'report');
check('T1', 'report', rep.toastCount > 0, '通知が出ていない。U8 が素通りしている');

// --- 巻物（カード脱却指示書 §4）
//
// 板を8枚積むのをやめて1枚に繋げた面。**紙の上で墨が読めること**が肝で、
// 地の色だけ変えて文字色を変え忘れると、白い字が薄茶の紙に消える。
{
  const sc = await page.evaluate(() => {
    const el = document.querySelector('.scroll');
    if (!el) return null;
    const lum = c => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // 紙の地は要素の背景ではなく、重ねた勾配。実測できないので
    // 「巻物の中の文字」と「巻物の外の地（body）」ではなく、
    // 文字色と、その文字が乗っている紙の代表色（下の勾配の終端）で見る
    const paper = lum('rgb(228,211,178)');
    const worst = [];
    for (const t of el.querySelectorAll('.n, .m, .l, .v, .beat span, .sc-note, .sc-lead, .fig .v, .fig .l')) {
      if (!t.textContent.trim()) continue;
      const ink = lum(getComputedStyle(t).color);
      const hi = Math.max(ink, paper) + 0.05, lo = Math.min(ink, paper) + 0.05;
      worst.push(hi / lo);
    }
    return {
      panels: document.querySelectorAll('.stack .panel').length,
      seals: el.querySelectorAll('.seal').length,
      minContrast: worst.length ? Math.min(...worst) : 0,
      samples: worst.length
    };
  });
  check('R1', 'report', sc !== null, '巻物が出ていない');
  if (sc) {
    check('R2', 'report', sc.panels === 0, `板が ${sc.panels} 枚残っている（1枚の巻物にするはず）`);
    check('R3', 'report', sc.seals >= 3, `封蝋の区切りが ${sc.seals} 個しかない`);
    check('R4', 'report', sc.samples > 10, `文字を ${sc.samples} 件しか測れていない`);
    // 4.5:1 は本文の基準。紙と墨なので余裕で超えるはずで、
    // 超えないなら「地だけ変えて文字色を変え忘れた」ということ
    check('R5', 'report', sc.minContrast >= 4.5,
      `紙の上で読めない文字がある（最小コントラスト ${sc.minContrast.toFixed(1)}）`);
  }
}

// --- 開封。稀少以上を必ず1つ混ぜて、カットインも測る
await page.evaluate(() => {
  const st = window.__delvers.state;
  const rare = st.data.inventory.find(i => i.rarity === 'rare' || i.rarity === 'relic');
  if (rare && st.data.pending.length > 0) st.data.pending[0] = { ...rare, identified: false };
});
await page.click('[data-role=cta]');
await page.waitForTimeout(500);
await probe(page, 'opening');
await page.click('[data-role=cta]');            // 1個目を開ける

// T5/T6: 提示の演出（指示書 §1）。
//
// 数値は0から実数まで上がり、フラッシュは消える。どちらも phaseT の関数なので、
// 「止まったまま」の壊れ方をしうる——特にフラッシュが消えないと画面全体が
// 白く覆われ、その下の文字が読めなくなる。時間を置いて2回見る。
{
  let rising = null, flashPeak = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(80);
    const snap = await page.evaluate(() => ({
      plate: !!document.querySelector('.plate'),
      v: document.querySelector('.plate .v')?.textContent ?? null,
      flash: parseFloat(document.querySelector('.flash')?.style.opacity ?? '0')
    }));
    if (!snap.plate) continue;
    flashPeak = Math.max(flashPeak, snap.flash);
    if (rising === null && snap.v !== null) rising = Number(snap.v);
    if (rising !== null && snap.v !== null && Number(snap.v) > rising) break;
  }
  // カウントアップが終わり、フラッシュが引き切るまで待つ（どちらも 0.55 秒以内）
  await page.waitForTimeout(1200);
  const settled = await page.evaluate(() => ({
    v: document.querySelector('.plate .v')?.textContent ?? null,
    flash: parseFloat(document.querySelector('.flash')?.style.opacity ?? '0')
  }));
  check('T5', 'opening', rising !== null && settled.v !== null && Number(settled.v) > rising,
    `数値がカウントアップしていない（${rising} → ${settled.v}）`);
  check('T6', 'opening', flashPeak > 0.05 && settled.flash < 0.05,
    `フラッシュが出ていない、または消えていない（最大 ${flashPeak} → 現在 ${settled.flash}）`);
}
await probe(page, 'opening');                   // 提示（カットイン中）
// 溜め・提示・一覧と状態が変わるので、出ている操作を順に押して開け切る
for (let i = 0; i < 12; i++) {
  if (await page.$('[data-act=skip-all]')) { await page.click('[data-act=skip-all]'); break; }
  await page.click('[data-role=cta]');
  await page.waitForTimeout(500);
  await probe(page, 'opening');
}
await page.waitForTimeout(500);
await probe(page, 'opening');

// 開けた数と一覧の行数が合っているか。
// カットインの途中で次へ進むと、その1個が一覧にも売却額にも入らず、
// 「4/4 なのに3行」という表示になっていた（戦利品自体は失われない）。
{
  const r = await page.evaluate(() => {
    const meta = document.querySelector('.topbar .pill')?.textContent?.trim() ?? '';
    const m = meta.match(/(\d+)\s*\/\s*(\d+)/);
    return {
      shown: document.querySelectorAll('.stack .list .item').length,
      opened: m ? Number(m[1]) : -1, total: m ? Number(m[2]) : -1
    };
  });
  check('T3', 'opening', r.shown === r.total,
    `開封 ${r.opened}/${r.total} と表示しながら一覧は ${r.shown}行`);
}

await page.click('[data-role=cta]');            // 拠点へ
await page.waitForTimeout(500);

// --- インベントリ（200件級）
// 所持品と図鑑は詳細ドロワーの中（§4 情報の折りたたみ）。
// ドロワー自体も画面の一つなので、開いた状態で測る
await page.click('[data-act=detail]');
await page.waitForTimeout(450);
{
  const d = await probe(page, 'base');
  check('T12', 'base', d.ringCount === 3, `リングが ${d.ringCount} 個（3個であるべき）`);
  check('T13', 'base', d.ringMismatch.length === 0,
    `リングの表示と割合が食い違っている: ${d.ringMismatch.join(' / ')}`);
}
await page.click('.drawer [data-act=inventory]');
await page.waitForTimeout(600);
const inv = await probe(page, 'inventory');
check('U9a', 'inventory', await page.evaluate(() => window.__delvers.state.data.inventory.length) >= 200,
  '200件に届いていない。U9 の測定として弱い');

// U9: 並べ替え・絞り込みが1フレーム以内
for (const [label, sel] of [
  ['並べ替え(レア)', '[data-act=sort][data-i="1"]'],
  ['並べ替え(種別)', '[data-act=sort][data-i="2"]'],
  ['絞り込み(武器)', '[data-act=slotf][data-i="1"]'],
  ['絞り込み(上質以上)', '[data-act=rarf][data-i="1"]']
]) {
  const ms = await page.evaluate(s => {
    document.querySelector(s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const xs = [];
    for (let i = 0; i < 5; i++) xs.push(window.__delvers.shell.measureRedraw());
    return Math.min(...xs);
  }, sel);
  check('U9', 'inventory', ms < 16.7, `${label} に ${ms.toFixed(1)}ms（予算 16.7ms）`);
}
// T7: 一覧のサムネ（指示書 §1）。焼き上がるまで待ってから見る
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(150);
  if (await page.evaluate(() => document.querySelectorAll('.item .ic.shot').length > 5)) break;
}
{
  const t = await page.evaluate(() => ({
    shot: document.querySelectorAll('.vlist .item .ic.shot').length,
    rows: document.querySelectorAll('.vlist .item').length,
    baked: window.__delvers.thumbCount?.() ?? -1
  }));
  check('T7', 'inventory', t.rows > 0 && t.shot === t.rows,
    `サムネが焼けていない行がある（${t.shot} / ${t.rows}）`);
  // 組み合わせごとに一度だけ焼く。**上限を勘で置かない**——
  // 所持品から実際の組み合わせ数を数えて、それを超えていないかを見る
  const combos = await page.evaluate(() => {
    const set = new Set();
    for (const it of window.__delvers.state.data.inventory) {
      const el = it.slot === 'weapon'
        ? Object.entries(it.element).sort((a, b) => b[1] - a[1])[0][0]
        : 'physical';
      set.add(`${it.baseId}|${it.rarity}|${el}`);
    }
    return set.size;
  });
  check('T8', 'inventory', t.baked > 0 && t.baked <= combos,
    `焼いた枚数 ${t.baked} が、所持品の組み合わせ数 ${combos} を超えている`);
  check('T8b', 'inventory', combos < t.rows * 4,
    `組み合わせ数 ${combos} の数え方が壊れている`);
}
check('U9b', 'inventory',
  await page.evaluate(() => document.querySelectorAll('.vlist .item').length) < 60,
  '一覧の全件を DOM に置いている（仮想スクロールが効いていない）');

// 明細シート。武器と防具の両方を開く——
// 3D は面積で受ける光の量が変わるので、細い剣で足りていても
// 鎧では白く飛ぶ（実際そうなっていた）。U16 は両方で見ないと素通りする
for (const [label, slotIndex] of [['武器', '1'], ['防具', '2']]) {
  await page.click(`[data-act=slotf][data-i="${slotIndex}"]`);
  await page.waitForTimeout(350);
  const has = (await page.$('.vlist .item')) !== null;
  check('T4', 'inventory', has, `${label}が1件も無い`);
  if (!has) continue;
  await page.click('.vlist .item');
  await page.waitForTimeout(600);
  await probe(page, 'inventory');
  await page.click('[data-role=back]');
  await page.waitForTimeout(400);
}
await page.click('[data-act=slotf][data-i="0"]');
await page.waitForTimeout(350);

// 一括売却の確認（戻せない操作）。
// 所持品は「整理する画面」なので primary を持たない（§3.3 規則3）——
// data-role=cta では引けないので、行き先そのもので引く
await page.click('[data-act=bulk]');
await page.waitForTimeout(400);
const sellConfirm = await probe(page, 'inventory');
check('T2', 'inventory', sellConfirm.modal, '売却の確認が出ていない');
await page.click('.modal [data-act=cancel]');
await page.waitForTimeout(350);
await page.click('[data-role=back]');
await page.waitForTimeout(400);

// --- 図鑑
await page.click('[data-act=detail]');
await page.waitForTimeout(450);
await page.click('.drawer [data-act=compendium]');
await page.waitForTimeout(500);
await probe(page, 'compendium');
// --- ページめくり（カード脱却指示書 §5）
//
// **前のページを裏に残しているか**まで見る。出ていくページを消してから
// 入れるとフェードにしかならず、めくりに見えない。
// 演出は「見えた瞬間」を捕まえる。1回だけ覗いて判定すると、
// 描画が一瞬詰まった回に取りこぼして、実装ではなく間の悪さで落ちる
await page.waitForTimeout(500);                 // 画面が落ち着いてから
await page.click('[data-act=flip][data-d="1"]');
{
  let sawTurn = false, sawUnder = false, sawRotate = false;
  for (let i = 0; i < 14; i++) {
    const f = await page.evaluate(() => {
      const el = document.querySelector('.book .page.turn');
      const m = el ? getComputedStyle(el).transform : 'none';
      return {
        under: document.querySelectorAll('.book .page.under').length > 0,
        turn: !!el,
        rotated: m !== 'none' && m !== 'matrix(1, 0, 0, 1, 0, 0)'
      };
    });
    sawTurn ||= f.turn;
    sawUnder ||= f.under;
    sawRotate ||= f.rotated;
    if (sawTurn && sawUnder && sawRotate) break;
    await page.waitForTimeout(30);
  }
  check('B1', 'compendium', sawTurn, 'めくっているページを一度も観測できなかった');
  check('B2', 'compendium', sawUnder, '前のページが裏に残っていない（フェードになっている）');
  check('B3', 'compendium', sawRotate, 'ページが回転していない');
}
await page.waitForTimeout(600);                 // めくり終わり
check('B4', 'compendium',
  await page.evaluate(() => document.querySelectorAll('.book .page.under').length) === 0,
  'めくり終わっても前のページが残っている');
check('B5', 'compendium',
  await page.evaluate(() => document.querySelector('.pagefoot .c')?.textContent?.trim()) === '2 / 2',
  'ページ番号が進んでいない');
await probe(page, 'compendium');
await page.click('[data-act=tab][data-i="1"]');
await page.waitForTimeout(600);
await probe(page, 'compendium');
if (await page.$('.cell.found')) {
  await page.click('.cell.found');
  await page.waitForTimeout(400);
  await probe(page, 'compendium');
}

// --- 薬草園と錬金工房（新機能）
//
// 新しい画面は「押せる・読める」を一度も測らないまま出ていた。
// 拠点から実際に歩いて辿り着き、育てて・収穫して・調合するところまで通す。
// **状態は state の API で作らない**——買う・植える・作るは画面のボタンで押す。
// ボタン越しに動くことまで含めて確かめたいので、近道すると測る意味が薄れる。
// 時間だけは早送りできないので、植えた時刻を過去へずらして育ちきらせる。
for (let i = 0; i < 4; i++) {
  if (await page.evaluate(() => document.documentElement.dataset.screen) === 'base') break;
  await page.click('[data-role=back]').catch(() => {});
  await page.waitForTimeout(350);
}
await page.evaluate(() => {
  window.__delvers.state.data.gold = 99999;
  window.__delvers.shell.invalidate();
});
await page.click('[data-act=garden]');
await page.waitForTimeout(600);
await probe(page, 'garden');

// 種を買う（升目 → 詳細 → 買う。§7 のグリッド化）
await page.click('[data-act=tab][data-i="1"]');
await page.waitForTimeout(400);
await probe(page, 'garden');
check('G1', 'garden', (await page.$('.hgrid .hcell[data-id=ironleaf]')) !== null, '種の升目が出ていない');
// 押す前は詳細も購入ボタンも出ていないこと（升目に全部の説明を並べない §7）
check('G1b', 'garden', (await page.$('.hdetail')) === null, '何も選んでいないのに詳細が出ている');
await page.click('.hgrid .hcell[data-id=ironleaf]');
await page.waitForTimeout(350);
check('G1c', 'garden', (await page.$('.hdetail')) !== null, '升目を押しても詳細が出ない');
await probe(page, 'garden');
await page.click('[data-act=buy]');
await page.waitForTimeout(350);
check('G2', 'garden',
  await page.evaluate(() => (window.__delvers.state.data.garden.seeds.ironleaf ?? 0) > 0),
  '種を買っても手持ちが増えていない');

// たくわえは1行に畳まれていて、押すと開く（§7 の統合）
check('G2b', 'garden', (await page.$('.summary[data-act=stock-open]')) !== null,
  'たくわえの1行が出ていない');
await page.click('[data-act=stock-open]');
await page.waitForTimeout(450);
await probe(page, 'garden');
check('G2c', 'garden', (await page.$('.drawer')) !== null, 'たくわえを押しても中身が開かない');
await page.click('.drawer [data-act=stock-close]');
await page.waitForTimeout(400);

// 植える
await page.click('[data-act=tab][data-i="0"]');
await page.waitForTimeout(400);
check('G3', 'garden', (await page.$('.bed.empty')) !== null, '空きの畑が1枠も無い');
await page.click('.bed.empty');
await page.waitForTimeout(450);
check('G4', 'garden', (await page.$('.sheet .hcell[data-id=ironleaf]:not(.off)')) !== null,
  '種を持っているのに植えられる薬草が出ていない');
await probe(page, 'garden');                    // 植え付けシート
await page.click('.sheet .hcell[data-id=ironleaf]');
await page.waitForTimeout(300);
await probe(page, 'garden');                    // 選んだ状態
await page.click('[data-act=plant]');
await page.waitForTimeout(450);
check('G5', 'garden',
  await page.evaluate(() => window.__delvers.state.data.garden.beds.some(b => b !== null)),
  '植えたのに畑が空のまま');

// 2枠目には**別の**薬草を植える。同じものを2つ植えると、
// 「種類ごとに姿が違うか」（§6）を確かめられない
await page.click('[data-act=tab][data-i="1"]');
await page.waitForTimeout(400);
await page.click('.hgrid .hcell[data-id=embermoss]');
await page.waitForTimeout(300);
await page.click('[data-act=buy]');
await page.waitForTimeout(350);
await page.click('[data-act=tab][data-i="0"]');
await page.waitForTimeout(400);
await page.click('.bed.empty');
await page.waitForTimeout(450);
await page.click('.sheet .hcell[data-id=embermoss]');
await page.waitForTimeout(300);
await page.click('[data-act=plant]');
await page.waitForTimeout(450);
const gplant = await probe(page, 'garden');
check('G6', 'garden', gplant.ringCount > 0, '育成中の畑に進捗リングが出ていない');

// **枠の数と絵の数が合っているか**（改善指示書 §6）。
//
// 「育成 2/2」と書いてある横で3本の苗が育っていた。これは絵の好みではなく
// 数の食い違いなので、目で見るのではなく数えて確かめる。
{
  const m = await page.evaluate(() => {
    const sc = window.__delvers.shell.world.debugScene();
    if (!sc) return null;
    let beds = 0, planted = 0;
    const kinds = [];
    sc.traverse(o => {
      if (o.userData?.role !== 'bed' || !o.visible) return;
      beds++;
      if (o.userData.plantKind >= 0) { planted++; kinds.push(o.userData.plantKind); }
    });
    const st = window.__delvers.state;
    return {
      beds, planted, kinds,
      plots: st.data.garden.plots,
      growing: st.data.garden.beds.filter(b => b !== null).length
    };
  });
  check('G14', 'garden', m !== null, '3D シーンを覗けない（?probe=1 が効いていない）');
  if (m) {
    check('G15', 'garden', m.beds === m.plots,
      `畑は ${m.plots} 枠なのに温室には ${m.beds} 区画ある`);
    check('G16', 'garden', m.planted === m.growing,
      `育てているのは ${m.growing} 枠なのに苗は ${m.planted} 本立っている`);
    check('G17', 'garden', m.planted > 0 && new Set(m.kinds).size === m.kinds.length,
      `違う薬草を植えたのに同じ姿になっている（${m.kinds.join(',')}）`);
  }
}


// 育ちきらせる（実時間は待てないので、植えた時刻を過去へ）
await page.evaluate(() => {
  for (const b of window.__delvers.state.data.garden.beds) if (b) b.plantedAt -= 60 * 60 * 1000;
  window.__delvers.shell.invalidate();
});
await page.waitForTimeout(450);
check('G7', 'garden', await page.evaluate(() => window.__delvers.state.readyCount() > 0),
  '時間が経っても育ちきらない');
await probe(page, 'garden');
await page.click('[data-role=cta]');            // まとめて収穫
await page.waitForTimeout(450);
check('G8', 'garden',
  await page.evaluate(() =>
    Object.values(window.__delvers.state.data.garden.herbs).reduce((a, b) => a + b, 0) > 0),
  '収穫しても薬草が増えていない');
await probe(page, 'garden');                    // 通知が出ている状態

// 畑を広げる。専用の板ではなく温室の「＋」から開く（§7）。
// **3D の当たり判定ではなく DOM のボタン**なので、ここが測れる——
// U3（44px 以上）も U11（本当に押せるか）も probe が見ている
{
  // 再描画を挟んでから測る。判定は毎フレーム置き直しているので、
  // 「描き直した直後に置き忘れる」壊れ方をしうる（実際そうなっていた）
  await page.evaluate(() => window.__delvers.shell.invalidate());
  await page.waitForTimeout(250);
  const hs = await page.$('[data-hotspot]');
  check('G8b', 'garden', hs !== null, '畑を広げる「＋」の当たり判定が無い');
  if (hs) {
    const box = await page.evaluate(() => {
      const e = document.querySelector('[data-hotspot]');
      const r = e.getBoundingClientRect();
      // **本当に指が届くか**まで見る。3D の目印は板の裏へ回りうるので、
      // 「出ている」だけでは足りない（板の下に落とす変異はこれで落ちる）
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        w: r.width, h: r.height, y: r.y,
        shown: getComputedStyle(e).visibility !== 'hidden',
        reachable: !!hit && e.contains(hit),
        under: hit?.className ?? 'なし'
      };
    });
    check('G8c', 'garden', box.shown, '「＋」が 3D に映っているのに当たり判定が出ていない');
    check('G8c2', 'garden', box.reachable, `「＋」が押せない位置にある（手前に ${box.under}）`);
    check('G8d', 'garden', box.w >= 44 && box.h >= 44,
      `「＋」の当たり判定が ${Math.round(box.w)}×${Math.round(box.h)}`);
    const plots0 = await page.evaluate(() => window.__delvers.state.data.garden.plots);
    // 押せないときは**失敗として記録する**。例外で落とすと、
    // ここから先の検証が丸ごと走らなくなり、1件の不具合が全体を隠す
    let clicked = true;
    await page.click('[data-hotspot]', { timeout: 4000 }).catch(() => { clicked = false; });
    check('G8c3', 'garden', clicked, '「＋」を叩けなかった（手前の何かが飲んでいる）');
    await page.waitForTimeout(450);
    if (clicked) {
      const g = await probe(page, 'garden');
      check('G8e', 'garden', g.modal, '「＋」を押しても拡張の確認が出ない');
      await page.click('.modal [data-act=expand]');
      await page.waitForTimeout(450);
      check('G8f', 'garden',
        await page.evaluate(() => window.__delvers.state.data.garden.plots) === plots0 + 1,
        '広げても枠が増えていない');
    }
  }
}

// 錬金工房。材料が1回分では足りないので、畑を回した結果に足して整える
await page.evaluate(() => {
  const g = window.__delvers.state.data.garden;
  g.herbs.ironleaf = (g.herbs.ironleaf ?? 0) + 2;
  g.herbs.embermoss = (g.herbs.embermoss ?? 0) + 2;
  g.seeds.frostbloom = (g.seeds.frostbloom ?? 0) + 3;
  window.__delvers.state.save();
  window.__delvers.shell.invalidate();
});
await page.click('[data-act=tab][data-i="1"]');
await page.waitForTimeout(400);
await page.click('[data-act=alchemy]');
await page.waitForTimeout(600);
await probe(page, 'alchemy');
check('G8g', 'alchemy', (await page.$('.hgrid .hcell[data-id=ironblood]')) !== null,
  '作れる薬が升目になっていない');
check('G8h', 'alchemy', (await page.$('.cauldron-pop')) === null,
  '何も選んでいないのに大鍋の上に内訳が出ている');
await page.click('[data-act=sel][data-id=ironblood]');
await page.waitForTimeout(400);
check('G8i', 'alchemy', (await page.$('.cauldron-pop')) !== null,
  '薬を押しても大鍋の上に内訳が出ない');
await probe(page, 'alchemy');                   // 材料の内訳が開いた状態
check('G9', 'alchemy', await page.evaluate(() => window.__delvers.state.canBrew('ironblood')),
  '材料が揃っているのに作れない判定になっている');
await page.click('[data-role=cta]');
await page.waitForTimeout(2300);                // 調合の演出（1.6秒）が終わるまで
check('G10', 'alchemy',
  await page.evaluate(() => (window.__delvers.state.data.garden.potions.ironblood ?? 0) > 0),
  '調合しても薬が増えていない');
await probe(page, 'alchemy');

// --- 所持品の「種／収穫物／薬」タブ（新機能指示書「所持品」）
await page.click('[data-role=back]');           // 薬草園
await page.waitForTimeout(450);
await page.click('[data-role=back]');           // 拠点
await page.waitForTimeout(450);
await page.click('[data-act=detail]');
await page.waitForTimeout(450);
await page.click('.drawer [data-act=inventory]');
await page.waitForTimeout(600);
for (const [i, label] of [[1, '種'], [2, '収穫物'], [3, '薬']]) {
  await page.click(`[data-act=cat][data-i="${i}"]`);
  await page.waitForTimeout(450);
  await probe(page, 'inventory');
  check('G11', 'inventory',
    await page.evaluate(() => document.querySelectorAll('.stack .list .item').length) > 0,
    `${label}の面に1行も出ていない`);
  // 装備の面の操作（並べ替え・一括売却）が残っていたら、面を分けた意味が無い
  check('G12', 'inventory',
    await page.evaluate(() => document.querySelector('[data-act=bulk]') === null),
    `${label}の面に装備用の一括売却が残っている`);
}
await page.click('[data-act=cat][data-i="0"]');
await page.waitForTimeout(400);
const backToGear = await probe(page, 'inventory');
check('G13', 'inventory', backToGear.ringCount >= 0 && (await page.$('[data-act=bulk]')) !== null,
  '装備の面に戻っても一括売却が出ていない');
await page.click('[data-role=back]');
await page.waitForTimeout(450);

// --- U5: 所持金の位置が全画面で一致するか
{
  const rs = Object.entries(goldRects);
  const base = rs[0]?.[1];
  const off = rs.filter(([, g]) => base && (Math.abs(g.r - base.r) > 1 || Math.abs(g.t - base.t) > 1));
  check('U5', '全画面', off.length === 0,
    `所持金の位置がずれている画面: ${off.map(([n]) => n).join(', ')}`);
}

// --- U7: レアリティ色が全画面で同一か
{
  const names = Object.keys(rarityByScreen);
  const first = rarityByScreen[names[0]] ?? {};
  const bad = [];
  for (const n of names.slice(1)) {
    for (const k of Object.keys(rarityByScreen[n])) {
      if (first[k] && first[k] !== rarityByScreen[n][k]) bad.push(`${n}.${k}`);
    }
  }
  check('U7', '全画面', bad.length === 0, `レアリティ色が不一致: ${bad.join(', ')}`);
  check('U7b', '全画面', names.length >= 2, `レアリティ要素を見た画面が ${names.length} 件しかない`);
}

// --- U10: reduced-motion が効くか
{
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p2 = await c2.newPage();
  await p2.goto(`${URL}?reset=1&seed=${seed}`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(400);
  const d = await p2.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--d-pop').trim());
  check('U10', '全画面', d === '0ms', `--d-pop が "${d}"（0ms であるべき）`);
  await c2.close();
}

await browser.close();

console.log(`\nUI-SPEC §7.1 検証（実物）: ${pass} 件成功 / ${fail} 件失敗`);
if (failures.length) {
  console.log('\n失敗:');
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('すべて通過');
