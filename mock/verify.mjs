import { chromium } from 'playwright';

// docs/UI-SPEC.md §7.1 の U1〜U10 を実際に走らせる。
//
// この文書の主旨は「UIの正しさを目で見ずに確かめられること」なので、
// モックが仕様どおりかどうかも表明で確かめる。
// 画面は data-screen を読んで、撮れている／測っている対象を必ず確認する。

const URL = process.env.URL ?? 'http://localhost:4190';
const SCREENS = ['title', 'base', 'dispatch', 'compare', 'report', 'reveal', 'inventory', 'compendium'];

let pass = 0, fail = 0;
const failures = [];
function check(id, screen, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(`  ${id} [${screen}] ${detail}`);
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => { fail++; failures.push(`  JS例外: ${e.message}`); });

const goldRects = {};

for (const name of SCREENS) {
  await page.goto(`${URL}/?s=${name}&t=3`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);

  // 撮影／測定の対象が本当にその画面か（§7.2）
  const actual = await page.evaluate(() => document.documentElement.dataset.screen);
  check('S0', name, actual === name, `data-screen が "${actual}"。別画面を測っている`);

  const r = await page.evaluate(() => {
    const box = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom, t: b.top, l: b.left }; };
    const inter = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);

    // U1: 同じ行の中で「値」と「差分」が重なっていない
    const overlaps = [];
    for (const row of document.querySelectorAll('.row')) {
      const v = row.querySelector('.v'), d = row.querySelector('.d');
      if (v && d && inter(box(v), box(d))) overlaps.push(row.textContent.trim().slice(0, 24));
    }
    // 同一パネル内の兄弟パネル同士も見る
    const panels = [...document.querySelectorAll('.panel')].map(box);
    for (let i = 0; i < panels.length; i++)
      for (let j = i + 1; j < panels.length; j++)
        if (inter(panels[i], panels[j])) overlaps.push(`panel${i}×panel${j}`);

    // U2: 文字が枠から溢れていない
    const overflow = [];
    for (const el of document.querySelectorAll('.n, .nm, .l, .v, h1, .toast, .btn, .tag')) {
      if (el.scrollWidth > el.clientWidth + 1) overflow.push(el.textContent.trim().slice(0, 24));
    }

    // U3: タップ対象が 44px 以上
    const small = [];
    for (const el of document.querySelectorAll('[data-tap]')) {
      const b = box(el);
      if (b.w < 44 || b.h < 44) small.push(`${el.textContent.trim().slice(0, 14)} ${Math.round(b.w)}×${Math.round(b.h)}`);
    }

    // U4: 主要動線が親指到達域（画面下 1/3）にある
    const ctaEl = document.querySelector('[data-role=cta]');
    const ctaMid = ctaEl ? box(ctaEl).t + box(ctaEl).h / 2 : null;
    const thumbTop = window.innerHeight * (2 / 3);

    // U5: L1 の所持金の位置（画面をまたいで一致するか）
    const goldEl = document.querySelector('[data-role=gold]');
    const gold = goldEl ? box(goldEl) : null;

    // U6: 無効ボタンのラベルが読める（コントラスト比 ≥ 3:1）
    const lum = c => {
      const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => {
        v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrasts = [];
    for (const el of document.querySelectorAll('.btn[disabled], .action[disabled]')) {
      const cs = getComputedStyle(el);
      const l1 = lum(cs.color), l2 = lum('rgb(8,10,17)');
      contrasts.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }

    // U7: レアリティ色が全画面で一貫しているか
    const rarity = {};
    for (const t of ['common', 'fine', 'rare', 'relic']) {
      const el = document.querySelector(`.${t}`);
      if (el) rarity[t] = getComputedStyle(el).getPropertyValue('--rc').trim();
    }

    // U8: 通知が「文字を持つ要素」を覆っていない。
    //
    // 当初は結果行(headline)としか比べていなかった。拠点画面には結果行が無く、
    // **判定が素通りしていた**——実際には通知が「インベントリ」に被っていた。
    // 通知が覆ってよいのは地と余白だけなので、文字を持つ要素すべてと比べる。
    const toast = document.querySelector('[data-role=toast]');
    const covered = [];
    if (toast) {
      const tb = box(toast);
      for (const el of document.querySelectorAll('.n, .nm, .l, .v, .m, h1, .action, .btn, .beat span, .fig .v')) {
        if (!el.textContent.trim()) continue;
        if (inter(tb, box(el))) covered.push(el.textContent.trim().slice(0, 16));
      }
    }

    // 横スクロールが出ていないか（縦持ち専用なので必須）
    const hScroll = document.documentElement.scrollWidth > window.innerWidth + 1;

    return {
      overlaps, overflow, small, ctaMid, thumbTop, gold, contrasts, rarity, covered, hScroll,
      tapCount: document.querySelectorAll('[data-tap]').length
    };
  });

  check('U1', name, r.overlaps.length === 0, `重なり ${r.overlaps.length}件: ${r.overlaps.slice(0, 3).join(' / ')}`);
  check('U2', name, r.overflow.length === 0, `溢れ ${r.overflow.length}件: ${r.overflow.slice(0, 3).join(' / ')}`);
  check('U3', name, r.small.length === 0, `44px未満 ${r.small.length}件: ${r.small.slice(0, 3).join(' / ')}`);
  if (r.ctaMid !== null) {
    check('U4', name, r.ctaMid >= r.thumbTop,
      `CTA中心 y=${Math.round(r.ctaMid)} が親指到達域(y≧${Math.round(r.thumbTop)})の外`);
  }
  if (r.gold) goldRects[name] = r.gold;
  check('U6', name, r.contrasts.every(c => c >= 3),
    `無効ラベルのコントラスト ${r.contrasts.map(c => c.toFixed(1)).join(',')}`);
  check('U8', name, r.covered.length === 0,
    `通知が文字を覆っている ${r.covered.length}件: ${r.covered.slice(0, 3).join(' / ')}`);
  check('HS', name, !r.hScroll, '横スクロールが発生している');
  check('U3b', name, r.tapCount > 0 || name === 'reveal' || name === 'title',
    'タップ対象が1つも無い');
}

// U5: 所持金の位置が全画面で一致するか
{
  const rs = Object.entries(goldRects);
  const base = rs[0]?.[1];
  const off = rs.filter(([, g]) => base && (Math.abs(g.r - base.r) > 1 || Math.abs(g.t - base.t) > 1));
  check('U5', '全画面', off.length === 0,
    `所持金の位置がずれている画面: ${off.map(([n]) => n).join(', ')}`);
}

// U7: レアリティ色が全画面で同一か
{
  const seen = {};
  await page.goto(`${URL}/?s=inventory&t=1`, { waitUntil: 'networkidle' });
  const a = await page.evaluate(() => {
    const o = {};
    for (const t of ['common', 'fine', 'rare', 'relic']) {
      const el = document.querySelector(`.${t}`);
      if (el) o[t] = getComputedStyle(el).getPropertyValue('--rc').trim();
    }
    return o;
  });
  await page.goto(`${URL}/?s=report&t=1`, { waitUntil: 'networkidle' });
  const b = await page.evaluate(() => {
    const o = {};
    for (const t of ['common', 'fine', 'rare', 'relic']) {
      const el = document.querySelector(`.${t}`);
      if (el) o[t] = getComputedStyle(el).getPropertyValue('--rc').trim();
    }
    return o;
  });
  Object.assign(seen, a);
  const mismatch = Object.keys(b).filter(k => a[k] && a[k] !== b[k]);
  check('U7', '全画面', mismatch.length === 0, `レアリティ色が不一致: ${mismatch.join(', ')}`);
}

// U10: reduced-motion が効くか
{
  const c2 = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce'
  });
  const p2 = await c2.newPage();
  await p2.goto(`${URL}/?s=base&t=1`, { waitUntil: 'networkidle' });
  const d = await p2.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--d-pop').trim());
  check('U10', '全画面', d === '0ms', `--d-pop が "${d}"（0ms であるべき）`);
  await c2.close();
}

await browser.close();

console.log(`\nUI-SPEC §7.1 検証: ${pass} 件成功 / ${fail} 件失敗`);
if (failures.length) {
  console.log('\n失敗:');
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('すべて通過');
