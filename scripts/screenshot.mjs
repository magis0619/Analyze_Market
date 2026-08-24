// 画面検証用スクリーンショット撮影。
// 使い方: node scripts/screenshot.mjs <outdir> [seed] [--auto] [--fast=N] [--secs=N]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outdir = process.argv[2] ?? 'shots';
const seed = process.argv[3] ?? 'c0ffee';
const auto = process.argv.includes('--auto');
const fastArg = process.argv.find(a => a.startsWith('--fast='));
const secsArg = process.argv.find(a => a.startsWith('--secs='));
const fast = fastArg ? fastArg.split('=')[1] : '1';
const secs = secsArg ? parseFloat(secsArg.split('=')[1]) : 90;
const base = process.env.URL ?? 'http://localhost:5173';

mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
});
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
const t0 = Date.now();
await page.goto(`${base}/?seed=${seed}${auto ? '&auto=1' : ''}&fast=${fast}`, { waitUntil: 'load' });
const loadMs = Date.now() - t0;
console.log(`load: ${loadMs}ms`);

async function shot(name) {
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(`shot: ${name}`);
}

/** 内部座標(360x640)でタップ */
async function tap(x, y) {
  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, scale: r.width / 360 };
  });
  await page.mouse.click(rect.left + x * rect.scale, rect.top + y * rect.scale);
}

async function screenName() {
  return page.evaluate(() => {
    const g = window.__outfitter;
    return g ? g.app.screen.constructor.name : '?';
  });
}

if (!auto) {
  await page.waitForTimeout(600);
  await shot('01-title');
  await tap(180, 350);
  await page.waitForTimeout(700);
  await shot('02-negotiation');
  await tap(112, 254); // 質問2
  await page.waitForTimeout(400);
  await shot('03-question');
  // 棚から3点（ランタン・縄梯子・革鎧）
  await tap(50, 470);   // T1 ランタン (3行目1列)
  await tap(226, 470);  // T3 縄梯子 (3行目3列)
  await tap(138, 404);  // A2 革鎧 (2行目2列)
  await page.waitForTimeout(300);
  await shot('04-selected');
  await tap(294, 604); // 送り出す
  await page.waitForTimeout(1500);
  await shot('05-sendoff');
  await page.waitForTimeout(2200);
  let shotIdx = 0;
  for (let i = 0; i < Math.ceil(secs / 2.5); i++) {
    await page.waitForTimeout(2500);
    const state = await screenName();
    if (state === 'SpectateScreen') {
      await shot(`06-spectate-${String(shotIdx++).padStart(2, '0')}`);
      // 選択パネルが開いていたら装備由来（金枠）優先でタップ
      const pending = await page.evaluate(() => {
        const g = window.__outfitter;
        const s = g?.app.screen;
        return s && s.panelOpen && s.pending
          ? s.pending.options.map(o => ({ n: o.sourceEquip.length, d: o.disabled }))
          : null;
      });
      if (pending) {
        let pick = pending.findIndex(o => o.n > 0 && !o.d);
        if (pick < 0) pick = pending.findIndex(o => !o.d);
        const rows = pending.length;
        const ph = 58 + rows * 40;
        const py = 640 - ph - 4;
        await shot(`06-choice-${String(shotIdx).padStart(2, '0')}`);
        await tap(180, py + 50 + pick * 40 + 18);
      }
    } else if (state === 'ResultScreen') {
      break;
    }
  }
  await page.waitForTimeout(800);
  await shot('07-result');
  const state = await screenName();
  console.log(`final screen: ${state}`);
} else {
  for (let i = 0; i < Math.ceil(secs / 5); i++) {
    await page.waitForTimeout(5000);
    await shot(`auto-${String(i).padStart(2, '0')}`);
  }
}

const stats = await page.evaluate(() => {
  const g = window.__outfitter;
  return g ? g.frameStats : null;
});
if (stats) {
  const pct = stats.frames > 0 ? ((stats.over17_5 / stats.frames) * 100).toFixed(2) : '?';
  const pct2 = stats.frames > 0 ? ((stats.over33_4 / stats.frames) * 100).toFixed(2) : '?';
  console.log(`frames=${stats.frames} over17.5ms=${stats.over17_5} (${pct}%) over33.4ms=${stats.over33_4} (${pct2}%) worst=${stats.worst.toFixed(1)}ms`);
}
await browser.close();
