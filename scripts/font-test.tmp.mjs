import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
await page.setContent('<canvas id="c" width="200" height="100" style="width:800px;height:400px;image-rendering:pixelated"></canvas>');
await page.evaluate(() => {
  const text = '縄梯子があるから選べる 鉄鎧 革鎧 傷薬 依頼:深度12';
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2138'; ctx.fillRect(0,0,200,100);
  const F = "'MS Gothic','Noto Sans CJK JP',monospace,sans-serif";
  function thresh(size, y, squish) {
    const o = document.createElement('canvas'); o.width = 400; o.height = 32;
    const octx = o.getContext('2d', { willReadFrequently: true });
    octx.font = `${size}px ${F}`; octx.textBaseline = 'top'; octx.fillStyle = '#fff';
    if (squish) { octx.save(); octx.scale(8/size, 1); octx.fillText(text, 0, 1); octx.restore(); }
    else octx.fillText(text, 0, 1);
    const img = octx.getImageData(0, 0, 400, 32);
    for (let py = 0; py < 32; py++) for (let px = 0; px < 400; px++) {
      const a = img.data[(py*400+px)*4+3];
      if (a >= 112) { ctx.fillStyle = '#f2ede4'; ctx.fillRect(px, y+py, 1, 1); }
    }
  }
  function down2(size, y) {
    const o = document.createElement('canvas'); o.width = 800; o.height = 64;
    const octx = o.getContext('2d', { willReadFrequently: true });
    octx.font = `${size*2}px ${F}`; octx.textBaseline = 'top'; octx.fillStyle = '#fff';
    octx.fillText(text, 0, 2);
    const img = octx.getImageData(0, 0, 800, 64);
    for (let py = 0; py < 32; py++) for (let px = 0; px < 400; px++) {
      let on = 0;
      for (const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]]) {
        const a = img.data[((py*2+dy)*800+(px*2+dx))*4+3];
        if (a >= 128) on++;
      }
      if (on >= 2) { ctx.fillStyle = '#f2ede4'; ctx.fillRect(px, y+py, 1, 1); }
    }
  }
  thresh(8, 4, false);
  thresh(12, 24, false);
  down2(8, 44);
  thresh(12, 64, true);
  down2(12, 80);
});
await page.screenshot({ path: process.argv[2] ?? 'font-compare.png' });
await browser.close();
