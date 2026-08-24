// ビットマップ調フォント描画。
// システムフォントを一度小さなオフスクリーンに描き、アルファを2値化して
// 完全なドット（アンチエイリアスなし）としてキャッシュする。
// 画面上のフォントサイズは 8 / 12 の2種のみ（1画面3種以上は禁止）。

export type FontSize = 8 | 12;

interface Glyph {
  canvas: HTMLCanvasElement;
  w: number;
}

const cache = new Map<string, Glyph>();

let scratch: CanvasRenderingContext2D | null = null;

function scratchCtx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    scratch = ctx;
  }
  return scratch;
}

function buildGlyph(ch: string, size: FontSize, color: string): Glyph {
  const sctx = scratchCtx();
  sctx.clearRect(0, 0, 32, 32);
  sctx.font = `${size}px 'MS Gothic', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', monospace, sans-serif`;
  sctx.textBaseline = 'top';
  sctx.fillStyle = '#ffffff';
  sctx.fillText(ch, 1, 1);
  const measured = Math.ceil(sctx.measureText(ch).width);
  const w = Math.max(1, Math.min(30, measured));
  const h = size + 3;
  const img = sctx.getImageData(0, 0, w + 2, h);
  const out = document.createElement('canvas');
  out.width = w + 2;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('2d context unavailable');
  const oimg = octx.createImageData(w + 2, h);
  // 2値化した色付きピクセルへ変換
  const rgb = hexToRgb(color);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] ?? 0;
    if (a >= 112) {
      oimg.data[i] = rgb[0];
      oimg.data[i + 1] = rgb[1];
      oimg.data[i + 2] = rgb[2];
      oimg.data[i + 3] = 255;
    }
  }
  octx.putImageData(oimg, 0, 0);
  return { canvas: out, w };
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function glyph(ch: string, size: FontSize, color: string): Glyph {
  const key = `${size}|${color}|${ch}`;
  let g = cache.get(key);
  if (!g) {
    g = buildGlyph(ch, size, color);
    cache.set(key, g);
  }
  return g;
}

export function textWidth(text: string, size: FontSize): number {
  let w = 0;
  for (const ch of text) w += glyph(ch, size, '#ffffff').w + 1;
  return Math.max(0, w - 1);
}

/** テキストを描画し、描画幅を返す。 */
export function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  size: FontSize, color: string
): number {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of text) {
    const g = glyph(ch, size, color);
    ctx.drawImage(g.canvas, cx - 1, cy - 1);
    cx += g.w + 1;
  }
  return cx - Math.round(x) - 1;
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number,
  size: FontSize, color: string
): void {
  drawText(ctx, text, cx - Math.floor(textWidth(text, size) / 2), y, size, color);
}

export function drawTextRight(
  ctx: CanvasRenderingContext2D, text: string, right: number, y: number,
  size: FontSize, color: string
): void {
  drawText(ctx, text, right - textWidth(text, size), y, size, color);
}

/** 最大幅で折り返して描画し、使用した行数を返す。 */
export function drawTextWrapped(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, size: FontSize, color: string, maxLines = 99
): number {
  let line = '';
  let lines = 0;
  const lineH = size + 3;
  for (const ch of text) {
    const trial = line + ch;
    if (textWidth(trial, size) > maxWidth && line.length > 0) {
      drawText(ctx, line, x, y + lines * lineH, size, color);
      lines++;
      if (lines >= maxLines) return lines;
      line = ch;
    } else {
      line = trial;
    }
  }
  if (line.length > 0) {
    drawText(ctx, line, x, y + lines * lineH, size, color);
    lines++;
  }
  return lines;
}
