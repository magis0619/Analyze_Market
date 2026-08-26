// 参考画像との突き合わせ。
//
// 「見た目が近い気がする」で止めないために、画面を縦20帯に割って
// 帯ごとの平均色を参考画像の実測値と比べる。参考画像そのものは
// リポジトリに置かない（他人の写真なので）ため、実測した色だけを定数で持つ。
//
// 使い方: node island/scripts/critique.mjs [view] [time] [weather]
//   dev サーバ（既定 http://localhost:5174）を先に起動しておくこと。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { bandsOf, hex } from './bands.mjs';

/**
 * 参考画像1枚目（沖縄の砂浜／空・海・砂浜が一望できる構図）を
 * 縦20帯・横中央60%で平均した色。上から下へ 5% 刻み。
 */
const REFERENCE = [
  '#025cd3', '#0b65d6', '#136ad8', '#1771db', '#1574dc',
  '#227bde', '#5a8dde', '#6992dc', '#7290d7', '#587ac1',
  '#077faa', '#0a8eac', '#29a7b5', '#6bb5b4', '#b9c4b5',
  '#e3cfbf', '#f3d9ca', '#f6e0d4', '#f6e2d8', '#f6e3da'
];

/** 帯の区分。空・海・砂浜のどこがずれているかを分けて見るため */
const ZONES = [
  { name: '空    ', from: 0, to: 9 },
  { name: '海    ', from: 9, to: 15 },
  { name: '砂浜  ', from: 15, to: 20 }
];

const view = process.argv[2] ?? 'beach';
const time = process.argv[3] ?? '11.5';
const weather = process.argv[4] ?? '0';
const base = process.env.URL ?? 'http://localhost:5174';
const out = '.critique';

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
// 参考画像1枚目と同じ 3:2
const page = await browser.newPage({ viewport: { width: 1200, height: 792 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log(`PAGE ERROR: ${e.message}`));
await page.goto(`${base}/?view=${view}&time=${time}&weather=${weather}&still=42&hud=0`, { waitUntil: 'load' });
await page.waitForFunction(() => (window.__island?.frames?.() ?? 0) > 4, null, { timeout: 180000 });
await page.waitForTimeout(400);
const shot = `${out}/${view}.png`;
await page.screenshot({ path: shot });
await browser.close();

const [mine] = await bandsOf([shot]);
const ref = REFERENCE.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));

console.log('帯      自作       参考       差 (R, G, B)');
const diffs = [];
for (let i = 0; i < 20; i++) {
  const a = mine.bands[i], b = ref[i];
  const d = [0, 1, 2].map(k => a[k] - b[k]);
  diffs.push(Math.hypot(...d));
  console.log(`${String(i * 5).padStart(3)}%  ${hex(a)}  ${hex(b)}  ${d.map(v => String(v).padStart(5)).join('')}`);
}
console.log('');
for (const z of ZONES) {
  const s = diffs.slice(z.from, z.to);
  const avg = s.reduce((p, c) => p + c, 0) / s.length;
  console.log(`${z.name} 平均色差 ${avg.toFixed(1).padStart(6)}  ${avg < 20 ? '一致' : avg < 45 ? 'おおむね一致' : '要修正'}`);
}
const all = diffs.reduce((p, c) => p + c, 0) / diffs.length;
console.log(`全体   平均色差 ${all.toFixed(1).padStart(6)}`);
console.log(`\n撮影: ${shot}`);
