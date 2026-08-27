// 島歩きの画面を撮る。批評はこの出力に対して行う。
// 使い方: node island/scripts/shots.mjs <outdir> [view=beach] [time=11.5] [weather=0]
//   dev サーバ（既定 http://localhost:5174）を先に起動しておくこと。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outdir = process.argv[2] ?? 'shots-island';
const only = process.argv[3];
const time = process.argv[4] ?? '11.5';
const weather = process.argv[5] ?? '0';
const base = process.env.URL ?? 'http://localhost:5174';

// 参考画像1枚目と同じ 3:2 で撮る（帯ごとの色を比べるため）
const VIEWPORT = { width: 1200, height: 792 };

mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log(`PAGE ERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') console.log(`CONSOLE ERROR: ${m.text()}`); });

const shots = only
  ? [{ name: only, view: only, time, weather }]
  : [
      { name: 'beach-noon', view: 'beach', time: '11.5', weather: '0' },
      { name: 'overlook-noon', view: 'overlook', time: '11.5', weather: '0' },
      { name: 'shallows-noon', view: 'shallows', time: '11.5', weather: '0' },
      { name: 'reef-noon', view: 'reef', time: '11.5', weather: '0' },
      { name: 'beach-dawn', view: 'beach', time: '5.6', weather: '0' },
      { name: 'beach-dusk', view: 'beach', time: '18.4', weather: '0' },
      { name: 'beach-night', view: 'beach', time: '1.0', weather: '0' },
      { name: 'beach-cloudy', view: 'beach', time: '11.5', weather: '0.75' },
      { name: 'overlook-dusk', view: 'overlook', time: '18.2', weather: '0' },
      // 指示書 §4-1 の植生・人工物を種ごとに見るための視点
      { name: 'rest', view: 'rest', time: '11.5', weather: '0' },
      { name: 'palms', view: 'palms', time: '11.5', weather: '0' },
      { name: 'adan', view: 'adan', time: '11.5', weather: '0' },
      { name: 'deigo', view: 'deigo', time: '11.5', weather: '0' },
      { name: 'mangrove', view: 'mangrove', time: '11.5', weather: '0' },
      { name: 'pier', view: 'pier', time: '11.5', weather: '0' },
      // 指示書 §5 の焚き火。夜は火が灯り、昼はただの薪の山になることを確認する
      { name: 'campfire-night', view: 'campfire', time: '1.0', weather: '0', arrive: '1' },
      { name: 'campfire-noon', view: 'campfire', time: '11.5', weather: '0' }
    ];

for (const s of shots) {
  const arriveQ = s.arrive !== undefined ? `&arrive=${s.arrive}` : '';
  const url = `${base}/?view=${s.view}&time=${s.time}&weather=${s.weather}&still=42&hud=0${arriveQ}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__island?.frames?.() ?? 0) > 4, null, { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outdir}/${s.name}.png` });
  console.log(`shot ${s.name.padEnd(16)} ${Date.now() - t0}ms`);
}
await browser.close();
