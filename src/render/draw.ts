import { spr, sprSize } from './sprites';

// 汎用描画ヘルパ。整数座標のみ・スムージング無しで扱う。

export function drawSpr(
  ctx: CanvasRenderingContext2D, name: string, x: number, y: number, scale = 1
): void {
  const s = spr(name);
  ctx.drawImage(s, Math.round(x), Math.round(y), s.width * scale, s.height * scale);
}

/** 水平反転で描画（回転は禁止・反転のみ許可）。 */
export function drawSprFlipped(
  ctx: CanvasRenderingContext2D, name: string, x: number, y: number, scale = 1
): void {
  const s = spr(name);
  ctx.save();
  ctx.translate(Math.round(x) + s.width * scale, Math.round(y));
  ctx.scale(-1, 1);
  ctx.drawImage(s, 0, 0, s.width * scale, s.height * scale);
  ctx.restore();
}

/** 24×24（8pxコーナー）スプライトの9スライス描画。 */
export function drawNineSlice(
  ctx: CanvasRenderingContext2D, name: string,
  x: number, y: number, w: number, h: number
): void {
  const s = spr(name);
  const c = 8;
  const sw = s.width, sh = s.height;
  const mw = sw - c * 2, mh = sh - c * 2;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const iw = Math.max(0, w - c * 2), ih = Math.max(0, h - c * 2);
  // corners
  ctx.drawImage(s, 0, 0, c, c, x, y, c, c);
  ctx.drawImage(s, sw - c, 0, c, c, x + w - c, y, c, c);
  ctx.drawImage(s, 0, sh - c, c, c, x, y + h - c, c, c);
  ctx.drawImage(s, sw - c, sh - c, c, c, x + w - c, y + h - c, c, c);
  // edges
  if (iw > 0) {
    ctx.drawImage(s, c, 0, mw, c, x + c, y, iw, c);
    ctx.drawImage(s, c, sh - c, mw, c, x + c, y + h - c, iw, c);
  }
  if (ih > 0) {
    ctx.drawImage(s, 0, c, c, mh, x, y + c, c, ih);
    ctx.drawImage(s, sw - c, c, c, mh, x + w - c, y + c, c, ih);
  }
  if (iw > 0 && ih > 0) {
    ctx.drawImage(s, c, c, mw, mh, x + c, y + c, iw, ih);
  }
}

export function fillRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function strokeRect1(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string
): void {
  // 1px 枠（fillRect 4本で描く：strokeRect の半端座標によるにじみを避ける）
  fillRect(ctx, x, y, w, 1, color);
  fillRect(ctx, x, y + h - 1, w, 1, color);
  fillRect(ctx, x, y, 1, h, color);
  fillRect(ctx, x + w - 1, y, 1, h, color);
}

export function iconSize(name: string): { w: number; h: number } {
  return sprSize(name);
}

// スプライトの存在確認は毎フレーム try/catch すると重いのでキャッシュする。
const existCache = new Map<string, boolean>();

export function hasSpr(name: string): boolean {
  const hit = existCache.get(name);
  if (hit !== undefined) return hit;
  let ok = true;
  try { spr(name); } catch { ok = false; }
  existCache.set(name, ok);
  return ok;
}

/** name が無ければ fallback を描く。アセット差分に強くするための逃げ道。 */
export function drawSprOr(
  ctx: CanvasRenderingContext2D, name: string, fallback: string,
  x: number, y: number, scale = 1
): void {
  drawSpr(ctx, hasSpr(name) ? name : fallback, x, y, scale);
}

/**
 * 半透明の暗幕をパレット内の色だけで敷く（§9.3「32色まで」）。
 *
 * ctx.fillStyle = 'rgba(...)' で塗ると背景と混色した中間色が画面に現れ、
 * 数え上げた色数を軽く超える。代わりに 4x4 の順序ディザを敷き詰めて、
 * 「使っている色は1色のまま、見た目だけ暗くなる」ようにする。
 * パターンは (色, 濃さ) ごとに1枚だけ焼いて使い回す。
 *
 * density: 0..1。
 */
const BAYER4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

const scrimCache = new Map<string, CanvasPattern | null>();

function scrimPattern(
  ctx: CanvasRenderingContext2D, color: string, level: number
): CanvasPattern | null {
  const key = `${color}|${level}`;
  const hit = scrimCache.get(key);
  if (hit !== undefined) return hit;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const cc = c.getContext('2d');
  let pat: CanvasPattern | null = null;
  if (cc) {
    cc.fillStyle = color;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if ((BAYER4[y * 4 + x] ?? 16) < level) cc.fillRect(x, y, 1, 1);
      }
    }
    pat = ctx.createPattern(c, 'repeat');
  }
  scrimCache.set(key, pat);
  return pat;
}

export function fillScrim(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string, density: number
): void {
  const level = Math.round(Math.max(0, Math.min(1, density)) * 16);
  if (level <= 0) return;
  if (level >= 16) { fillRect(ctx, x, y, w, h, color); return; }
  const pat = scrimPattern(ctx, color, level);
  if (!pat) { fillRect(ctx, x, y, w, h, color); return; }
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}
