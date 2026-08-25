// R3批評で発覚した見落とし対策: 実機ビューポート幅で k（transform倍率）が
// 実際に1超になっているかを直接確認する。matrix(k,0,0,k,...) の k を読む。
import { chromium } from 'playwright';

const base = process.env.URL ?? 'http://localhost:5173';
const conditions = [
  { name: 'iPhone SE 375x667 DPR2', width: 375, height: 667, dpr: 2 },
  { name: 'iPhone 375x812 DPR3', width: 375, height: 812, dpr: 3 },
  { name: 'Pixel 411x731 DPR2.625', width: 411, height: 731, dpr: 2.625 },
  { name: 'Pixel7Pro 412x915 DPR3.5', width: 412, height: 915, dpr: 3.5 },
  { name: 'Galaxy 360x780 DPR3', width: 360, height: 780, dpr: 3 },
  { name: 'small 320x568 DPR2', width: 320, height: 568, dpr: 2 }
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const c of conditions) {
  const page = await browser.newPage({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dpr });
  await page.goto(`${base}/?seed=k&auto=1`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const style = getComputedStyle(canvas);
    return {
      transform: style.transform,
      cssW: style.width, cssH: style.height,
      bbW: canvas.width, bbH: canvas.height
    };
  });
  console.log(`${c.name}: transform=${info.transform} css=${info.cssW}x${info.cssH} backing=${info.bbW}x${info.bbH}`);
  await page.close();
}
await browser.close();
