// C1検査: 非整数 devicePixelRatio 実機でのドットのにじみを検出。
// 「ランの奇偶」は scale=1 の1px意匠（アウトライン等）で必然的に発生し
// 判定に使えない（過去に誤検出したため破棄）。正しい指標は
// 「基準（明確に整数倍である DPR2）のスクリーンショットに存在しない色が
// どれだけ混入しているか」。中間色の混入 = 描画パスのどこかで
// 非整数スケーリングによる補間が起きている証拠になる。
import { chromium } from 'playwright';

const base = process.env.URL ?? 'http://localhost:5173';
const conditions = [
  { name: 'DPR1 390x700', width: 390, height: 700, dpr: 1 },
  { name: 'DPR2 375x667 (基準)', width: 375, height: 667, dpr: 2, isBaseline: true },
  { name: 'DPR3 360x640', width: 360, height: 640, dpr: 3 },
  { name: 'DPR2.625 411x731 (Pixel)', width: 411, height: 731, dpr: 2.625 },
  { name: 'DPR2.75 393x786', width: 393, height: 786, dpr: 2.75 },
  { name: 'DPR3.5 412x915 (Pixel7Pro)', width: 412, height: 915, dpr: 3.5 },
  { name: 'DPR1.5 400x800', width: 400, height: 800, dpr: 1.5 },
  { name: 'DPR2.3 402x847', width: 402, height: 847, dpr: 2.3 }
];

async function capture(browser, c) {
  const page = await browser.newPage({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dpr
  });
  await page.goto(`${base}/?seed=c1check&auto=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const buf = await page.screenshot();
  const b64 = buf.toString('base64');
  const result = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { counts: Array.from(counts.entries()), w: width, h: height, total: width * height };
  }, `data:image/png;base64,${b64}`);
  await page.close();
  return result;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const baselineCond = conditions.find(c => c.isBaseline);
const baseline = await capture(browser, baselineCond);
const baseSet = new Set(baseline.counts.map(([k]) => k));
console.log(`基準 ${baselineCond.name}: ${baseSet.size}色`);

let anyFail = false;
for (const c of conditions) {
  const r = c.isBaseline ? baseline : await capture(browser, c);
  let bleedPixels = 0;
  let newColors = 0;
  for (const [key, n] of r.counts) {
    if (!baseSet.has(key)) { bleedPixels += n; newColors++; }
  }
  const bleedPct = (bleedPixels / r.total) * 100;
  // 新色が1%未満の少数ピクセルに収まっていれば許容（フォントの1文字単位の
  // 端数など）。1%を超えたら非整数スケーリングによる補間混入とみなす。
  const fail = bleedPct > 1.0;
  if (fail) anyFail = true;
  console.log(
    `${fail ? 'FAIL' : 'ok  '} ${c.name} (${r.w}x${r.h}): 新色${newColors}種 ` +
    `侵食${bleedPixels}px/${r.total}px (${bleedPct.toFixed(3)}%)`
  );
}

await browser.close();
console.log(anyFail ? '\nC1: FAIL' : '\nC1: OK');
process.exit(anyFail ? 1 : 0);
