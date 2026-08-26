// 画像を縦20帯に割って平均色を出す。参考画像と自作画面を同じ物差しで見るため。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

export async function bandsOf(files) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
  });
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const out = [];
  for (const f of files) {
    const ext = extname(f).slice(1);
    const mime = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
    const uri = `data:${mime};base64,${readFileSync(f).toString('base64')}`;
    const res = await page.evaluate(async (u) => {
      const img = new Image(); img.src = u; await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      const x0 = Math.floor(width * 0.2), x1 = Math.floor(width * 0.8);
      const bands = [];
      for (let b = 0; b < 20; b++) {
        const y0 = Math.floor(height * b / 20), y1 = Math.floor(height * (b + 1) / 20);
        let r = 0, g = 0, bl = 0, n = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * 4;
          r += data[i]; g += data[i + 1]; bl += data[i + 2]; n++;
        }
        bands.push([Math.round(r / n), Math.round(g / n), Math.round(bl / n)]);
      }
      return bands;
    }, uri);
    out.push({ name: basename(f), bands: res });
  }
  await browser.close();
  return out;
}

export const hex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await bandsOf(process.argv.slice(2));
  for (const r of res) {
    console.log(`\n=== ${r.name} ===`);
    r.bands.forEach((b, i) => console.log(`${String(i * 5).padStart(3)}%: ${hex(b)}`));
  }
}
