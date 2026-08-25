// 画面検証用スクリーンショット撮影。
// 使い方: node scripts/screenshot.mjs <outdir> [seed]
// dev サーバ（既定 http://localhost:5173）を先に起動しておくこと。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outdir = process.argv[2] ?? 'shots';
const seed = process.argv[3] ?? 'c0ffee';
const base = process.env.URL ?? 'http://localhost:5173';

mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
});
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
page.on('pageerror', e => console.log(`PAGE ERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') console.log(`CONSOLE ERROR: ${m.text()}`); });

const t0 = Date.now();
// timescale で実時間を圧縮し、5分ステージの完了まで待たずに検証する
await page.goto(`${base}/?seed=${seed}&reset=1&timescale=4000`, { waitUntil: 'load' });
console.log(`load: ${Date.now() - t0}ms`);

async function shot(name) {
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(`shot: ${name}`);
}
/** 内部座標(360x640)でタップ */
async function tap(x, y) {
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const b = c.getBoundingClientRect();
    return { left: b.left, top: b.top, sx: b.width / 360, sy: b.height / 640 };
  });
  await page.mouse.click(r.left + x * r.sx, r.top + y * r.sy);
  await page.waitForTimeout(180);
}
async function screenName() {
  return page.evaluate(() => window.__delvers?.app?.screen?.constructor?.name ?? '?');
}

await page.waitForTimeout(600);
await shot('01-title');
await tap(180, 320);              // タイトル → 拠点
await shot('02-base');

await tap(180, 344);              // メニュー: 派遣準備
await shot('03-dispatch');
await tap(166, 82);               // 武器枠 → 選択オーバーレイ
await shot('04-pick-weapon');
await tap(180, 100);              // 一覧の先頭を装備
await tap(290, 82);               // 防具枠
await tap(180, 100);
await shot('05-equipped');
await tap(300, 180);              // 撤退ルール「慎重」
await tap(100, 252);              // ステージ1
await shot('06-dispatch-ready');
await tap(180, 613);              // 派遣する
await shot('07-dispatched');

// timescale で 5分ステージが数秒で終わる
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__delvers?.state?.data?.inbox?.length ?? 0);
  if (st > 0) break;
}
await shot('08-returned');
await tap(180, 256);              // メニュー: 帰還レポート
await shot('09-report');
await tap(180, 613);              // 開封へ
await shot('10-opening');
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(420);
  await shot(`11-open-${String(i).padStart(2, '0')}`);
  if (await screenName() !== 'OpeningScreen') break;
  await tap(180, 542);
}
await shot('12-after-open');

// インベントリ・図鑑
for (let i = 0; i < 6 && await screenName() !== 'BaseScreen'; i++) await tap(180, 613);
await tap(180, 388);              // メニュー: インベントリ
await shot('13-inventory');
await tap(180, 300);
await shot('14-inventory-detail');
// 図鑑はデバッグAPIで直接開く（詳細シートの開閉でタップ位置が変わるため）
await page.evaluate(() => window.__delvers.app.goCompendium());
await page.waitForTimeout(300);
await shot('15-compendium');
await tap(60, 100);
await shot('16-compendium-pick');

console.log(`final: ${await screenName()}`);
const stats = await page.evaluate(() => window.__delvers?.frameStats ?? null);
if (stats) {
  const pct = n => stats.frames > 0 ? ((n / stats.frames) * 100).toFixed(2) : '?';
  console.log(`frames=${stats.frames} over17.5ms=${stats.over17_5} (${pct(stats.over17_5)}%) over33.4ms=${stats.over33_4} (${pct(stats.over33_4)}%) worst=${stats.worst.toFixed(1)}ms`);
}
await browser.close();
