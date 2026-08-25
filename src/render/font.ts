import { ATLASES, type GlyphAtlas } from './fontdata';

// ビットマップフォント描画（仕様書 §9.2）。
//
// 以前はシステムフォントを実行時に描いてアルファを2値化し、さらに横 8/12 に
// 圧縮していた。圧縮のせいで漢字のストロークが潰れて判読できなくなっていたため、
// 圧縮を廃止し、点データを自前で持つ方式に変えた（scripts/gen-font.mjs が生成）。
// これで端末に何のフォントが入っていても同じドットで出る。
//
// サイズは2種のみ（§9.3「1画面に3種類以上のフォントサイズ」禁止）。
//   'sm' = 12px セル（全角12×12 / 半角6×12）
//   'lg' = 16px セル（全角16×16 / 半角8×16）
// 呼び出し側は歴史的な経緯で 8 / 12 という数値で指定する。これはピクセル数
// ではなく段階の名前であり、それぞれ上の 12px / 16px に対応する。

export type FontSize = 8 | 12;

const PX: Record<FontSize, number> = { 8: 12, 12: 16 };

interface Glyph {
  w: number;
  h: number;
  bits: Uint8Array;
}

const atlasBySize = new Map<number, GlyphAtlas>();
const glyphCache = new Map<number, Map<string, Glyph>>();
/** 色付きで焼いたグリフのキャッシュ（描画のたびに塗り直さない） */
const tintCache = new Map<string, HTMLCanvasElement>();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function atlasFor(px: number): GlyphAtlas | null {
  const hit = atlasBySize.get(px);
  if (hit) return hit;
  const found = ATLASES.find(a => a.size === px);
  if (found) {
    atlasBySize.set(px, found);
    // 文字 → 添字の索引を張る
    const map = new Map<string, Glyph>();
    let i = 0;
    for (const ch of found.chars) {
      const w = found.widths[i] ?? px;
      const raw = found.data[i];
      if (raw !== undefined) {
        map.set(ch, { w, h: found.size, bits: b64ToBytes(raw) });
      }
      i++;
    }
    glyphCache.set(px, map);
    return found;
  }
  return null;
}

function glyphOf(ch: string, px: number): Glyph | null {
  atlasFor(px);
  return glyphCache.get(px)?.get(ch) ?? null;
}

/** グリフを指定色で焼いたキャンバスを返す。 */
function tinted(ch: string, px: number, color: string): HTMLCanvasElement | null {
  const key = `${px}|${color}|${ch}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const g = glyphOf(ch, px);
  if (!g) return null;
  const c = document.createElement('canvas');
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(g.w, g.h);
  const rgb = hexToRgb(color);
  for (let i = 0; i < g.w * g.h; i++) {
    const on = (g.bits[i >> 3] ?? 0) & (0x80 >> (i & 7));
    if (on) {
      const o = i * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** 字間（px）。 */
const TRACKING = 1;

/** 行送り。 */
export function lineHeight(size: FontSize): number {
  return PX[size] + 3;
}

export function charWidth(ch: string, size: FontSize): number {
  const px = PX[size];
  const g = glyphOf(ch, px);
  if (g) return g.w;
  // アトラスに無い文字は全角扱いで箱を描く
  return ch.codePointAt(0)! > 0xff ? px : Math.floor(px / 2);
}

export function textWidth(text: string, size: FontSize): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, size) + TRACKING;
  return Math.max(0, w - TRACKING);
}

/** テキストを描画し、描画幅を返す。 */
export function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  size: FontSize, color: string
): number {
  const px = PX[size];
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of text) {
    if (ch === ' ' || ch === '　') {
      cx += charWidth(ch, size) + TRACKING;
      continue;
    }
    const g = tinted(ch, px, color);
    if (g) {
      ctx.drawImage(g, cx, cy);
      cx += g.width + TRACKING;
    } else {
      // 未収録の文字は枠で示す（黙って消えるより気づける）
      const w = charWidth(ch, size);
      ctx.fillStyle = color;
      ctx.fillRect(cx, cy + 1, w, 1);
      ctx.fillRect(cx, cy + px - 2, w, 1);
      ctx.fillRect(cx, cy + 1, 1, px - 2);
      ctx.fillRect(cx + w - 1, cy + 1, 1, px - 2);
      cx += w + TRACKING;
    }
  }
  return cx - Math.round(x) - TRACKING;
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

/** 行頭に置けない文字（禁則処理）。 */
const KINSOKU = new Set([
  ...'」』）〉】。、！？ーぁぃぅぇぉっゃゅょ・…ん％',
  ...')]},.!?'
]);

/** 最大幅で折り返して行配列にする（行頭禁則つき）。 */
export function wrapText(text: string, maxWidth: number, size: FontSize, maxLines = 99): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      if (lines.length >= maxLines) return lines;
      line = '';
      continue;
    }
    const trial = line + ch;
    if (textWidth(trial, size) > maxWidth && line.length > 0 && !KINSOKU.has(ch)) {
      lines.push(line);
      if (lines.length >= maxLines) return lines;
      line = ch;
    } else {
      line = trial;
    }
  }
  if (line.length > 0 && lines.length < maxLines) lines.push(line);
  return lines;
}

/** 最大幅で折り返して描画し、使用した行数を返す。 */
export function drawTextWrapped(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, size: FontSize, color: string, maxLines = 99
): number {
  const lh = lineHeight(size);
  const lines = wrapText(text, maxWidth, size, maxLines);
  lines.forEach((ln, i) => drawText(ctx, ln, x, y + i * lh, size, color));
  return lines.length;
}
