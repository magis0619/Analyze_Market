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
  const panels = [...document.querySelectorAll('.panel')].filter(vis).map(box).filter(Boolean);
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      if (inter(panels[i], panels[j])) overlaps.push(`panel${i}×panel${j}`);
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
  const live = el => {
    if (modalEl) return modalEl.contains(el);
    if (scrimEl) return !!el.closest('.topbar, .sheet, .actionbar, .modal');
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
  for (const el of document.querySelectorAll('.seed, .float, .charge-hint, .banner')) {
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
const boot = `${URL}?reset=1&seed=${seed}&devitems=100&timescale=4000&probe=1`;

// --- タイトル
await page.goto(boot, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await probe(page, 'title');

// --- 拠点
await page.click('[data-role=cta]');
await page.waitForTimeout(500);
await probe(page, 'base');

// --- 派遣準備
await page.click('[data-act=dispatch]');
await page.waitForTimeout(500);
await probe(page, 'dispatch');

// --- 装備選択（シート）。ここは data-screen 上は dispatch のまま
await page.click('[data-act=pick-open][data-slot=weapon]').catch(() => {});
await page.waitForTimeout(400);
if (await page.$('.sheet')) {
  await probe(page, 'dispatch');
  // 掴んだ要素ではなくセレクタで叩く。一覧はサムネが焼き上がるたびに
  // 描き直されるので、掴んだ参照はすぐ古くなる（実際 detached で落ちた）
  if (await page.$('.sheet-list .item')) {
    await page.click('.sheet-list .item');
    await page.waitForTimeout(600);
    await probe(page, 'dispatch');
  }
  await page.click('[data-act=pick-close]');
  await page.waitForTimeout(350);
}

// --- 派遣して、本物のシミュレーションが返ってくるのを待つ
await page.click('[data-role=cta]');
await page.waitForTimeout(600);
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(250);
  if (await page.evaluate(() => window.__delvers.state.data.inbox.length > 0)) break;
}
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
await page.click('[data-act=inventory]');
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
  // 組み合わせごとに一度だけ焼く。行数ぶん焼いていたら仕組みが効いていない
  check('T8', 'inventory', t.baked > 0 && t.baked <= 60,
    `焼いた枚数が ${t.baked}。組み合わせ単位のキャッシュが効いていない`);
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
await page.click('[data-act=compendium]');
await page.waitForTimeout(500);
await probe(page, 'compendium');
await page.click('[data-act=tab][data-i="1"]');
await page.waitForTimeout(350);
await probe(page, 'compendium');
if (await page.$('.cell.found')) {
  await page.click('.cell.found');
  await page.waitForTimeout(400);
  await probe(page, 'compendium');
}

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
