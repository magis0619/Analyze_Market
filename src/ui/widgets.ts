import { drawNineSlice, fillRect, fillScrim } from '../render/draw';
import { drawTextCentered } from '../render/font';
import { THEME } from './theme';

export interface Btn {
  x: number; y: number; w: number; h: number;
  label: string;
  disabled?: boolean;
  accent?: boolean;
}

export function hitBtn(b: Btn, x: number, y: number): boolean {
  return !b.disabled && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function inRect(
  x: number, y: number, rx: number, ry: number, rw: number, rh: number
): boolean {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

export function drawBtn(
  ctx: CanvasRenderingContext2D, b: Btn, size: 8 | 12 = 12
): void {
  drawNineSlice(ctx, 'button', b.x, b.y, b.w, b.h);
  if (b.accent && !b.disabled) {
    fillRect(ctx, b.x + 2, b.y + 2, b.w - 4, 2, THEME.gold);
  }
  // faint(#6e6660) は button 地色 G(#5f6472) とのコントラスト比が約1.05:1で
  // ほぼ不可視になるため使わない。
  const color = b.disabled ? THEME.dim : THEME.text;
  drawTextCentered(ctx, b.label, b.x + Math.floor(b.w / 2), b.y + Math.floor((b.h - size) / 2), size, color);
  if (b.disabled) {
    fillScrim(ctx, b.x, b.y, b.w, b.h, THEME.bg, 0.45);
  }
}

/** 残り時間バー（右から減る）。 */
export function drawTimerBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  ratio: number, warn: boolean
): void {
  fillRect(ctx, x, y, w, h, THEME.outline);
  const iw = Math.max(0, Math.round((w - 2) * Math.max(0, Math.min(1, ratio))));
  fillRect(ctx, x + 1, y + 1, iw, h - 2, warn ? THEME.red : THEME.gold);
}
