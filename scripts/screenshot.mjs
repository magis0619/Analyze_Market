// 画面検証用スクリーンショット撮影。
// 使い方: node scripts/screenshot.mjs <outdir> [seed] [--auto] [--fast=N] [--secs=N]
// 事前に `npm run dev` などでサーバを起動しておくか、環境変数 URL を渡す。
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
const t0 = Date.now();
await page.goto(`${base}/?seed=${seed}${auto ? '&auto=1' : ''}&fast=${fast}`, { waitUntil: 'load' });
const loadMs = Date.now() - t0;
console.log(`load: ${loadMs}ms`);

async function shot(name) {
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(`shot: ${name}`);
}

if (!auto) {
  await page.waitForTimeout(600);
  await shot('01-title');
  await page.mouse.click(195, 350); // タイトルタップ
  await page.waitForTimeout(700);
  await shot('02-negotiation');
  await page.mouse.click(112, 254); // 質問2
  await page.waitForTimeout(400);
  await shot('03-question');
  // 棚から3点選ぶ（T1, T3, A2 あたりのセル位置）
  await page.mouse.click(50, 344);
  await page.mouse.click(138, 344);
  await page.mouse.click(226, 410);
  await page.waitForTimeout(300);
  await shot('04-selected');
  await page.mouse.click(294, 604); // 送り出す
  await page.waitForTimeout(1500);
  await shot('05-sendoff');
  await page.waitForTimeout(2000);
  // 観戦
  for (let i = 0; i < Math.ceil(secs / 5); i++) {
    await page.waitForTimeout(5000);
    await shot(`06-spectate-${String(i).padStart(2, '0')}`);
    const state = await page.evaluate(() => {
      const g = window.__outfitter;
      return g ? g.app.screen.constructor.name : '?';
    });
    if (state === 'ResultScreen') break;
  }
  await shot('07-result');
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
  const pct = stats.frames > 0 ? ((stats.over / stats.frames) * 100).toFixed(2) : '?';
  console.log(`frames=${stats.frames} over16.7ms=${stats.over} (${pct}%) worst=${stats.worst.toFixed(1)}ms`);
}
await browser.close();
