import { drawNineSlice, drawSprOr, fillRect, fillScrim, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, textWidth, type FontSize } from '../render/font';
import { THEME } from './theme';
import { BORDER, DUR, ROLE, SHADOW, SPACE, TEXT, type UiState } from './tokens';

// 共通UIコンポーネント（Balatro型UI設計書 Phase 2）。
//
// 設計書 §17 が求める Panel / Card / Button / Badge / ProgressBar / Tooltip /
// Modal / Tab / Notification を、canvas 描画として1箇所に集める。
// 調査時点では同じ意味のパネルが画面ごとに違う余白・枠幅・色で描かれていた
// （生の矩形描画170回 対 共通部品56回）。以後、画面側は原則ここだけを呼ぶ。

// ---------------------------------------------------------------- Header（§1 Layer 1）
//
// 設計書 §1 は「プレイヤーがゲーム中に頻繁に確認するものは画面上で常に見える
// 場所に固定する」と定めている。調査時点では、所持金は拠点・派遣・インベントリ
// にはあり図鑑とレポートには無い、見出しの座標も高さも画面ごとに違う、
// 戻るボタンがある画面と無い画面がある、という状態だった。
// 全画面で同じ帯を使い、常時確認する情報は必ずここに載せる。

export const HEADER_H = 26;

export interface HeaderOptions {
  title: string;
  /** 戻るボタンを出すか。出す場合は hitHeaderBack で判定する */
  back?: boolean;
  /** 常時表示する所持金 */
  gold?: number;
  /** 右端に出す補足（ステージ名・件数など）。gold と併用する場合は左に並ぶ */
  meta?: string;
  /** 難易度ティア。1 なら出さない */
  tier?: number;
  /** 派遣中の人数。0 なら出さない */
  running?: number;
}

const BACK_BTN: Button = { x: 6, y: 4, w: 56, h: 18, label: '戻る' };

export function headerBackButton(): Button {
  return { ...BACK_BTN };
}

export function hitHeaderBack(px: number, py: number): boolean {
  return hitButton(BACK_BTN, px, py);
}

/** 全画面共通の帯。使用した高さを返す。 */
export function drawHeader(
  ctx: CanvasRenderingContext2D, w: number, opts: HeaderOptions
): number {
  fillRect(ctx, 0, 0, w, HEADER_H, ROLE.surface);
  fillRect(ctx, 0, HEADER_H - 1, w, BORDER.thin, ROLE.edge);

  const titleX = opts.back ? BACK_BTN.x + BACK_BTN.w + SPACE.md : SPACE.md;
  if (opts.back) drawButton(ctx, BACK_BTN, TEXT.body);
  drawText(ctx, opts.title, titleX, 5, TEXT.title, THEME.text);

  // 右から順に積む。所持金は最も右（どの画面でも同じ位置にある約束）
  let rx = w - SPACE.md;
  if (opts.gold !== undefined) {
    const txt = `${opts.gold}`;
    drawTextRight(ctx, txt, rx, 5, TEXT.title, ROLE.gold);
    rx -= textWidth(txt, TEXT.title) + SPACE.sm;
    drawSprOr(ctx, 'coin', 'star', rx - 12, 6);
    rx -= 12 + SPACE.md;
  }
  if (opts.running !== undefined && opts.running > 0) {
    const txt = `潜行${opts.running}`;
    const bw = textWidth(txt, TEXT.body) + SPACE.md;
    drawBadge(ctx, rx - bw, 6, txt, ROLE.progress);
    rx -= bw + SPACE.md;
  }
  if (opts.tier !== undefined && opts.tier > 1) {
    const txt = `難易度+${opts.tier - 1}`;
    drawTextRight(ctx, txt, rx, 8, TEXT.body, ROLE.negative);
    rx -= textWidth(txt, TEXT.body) + SPACE.md;
  }
  if (opts.meta) {
    drawTextRight(ctx, opts.meta, rx, 8, TEXT.body, THEME.dim);
  }
  return HEADER_H;
}

// ---------------------------------------------------------------- Panel（§2）

export interface PanelOptions {
  /** 見出し。枠の上端に小さく載せる */
  title?: string;
  /** 見出しの右に出す補足（件数など） */
  meta?: string;
  /** 上端のアクセント帯。注目させたいパネルにだけ付ける */
  accent?: string;
  /** 地を敷かず枠だけにする（背景の絵を見せたいとき） */
  transparent?: boolean;
}

/**
 * 区画。設計書 §2「画面をカードの集合として設計する」の受け皿。
 * 見出しは枠の上端に重ねるので、中身は y + SPACE.md から書き始めてよい。
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: PanelOptions = {}
): void {
  if (opts.title) {
    drawText(ctx, opts.title, x + SPACE.sm, y - 13, TEXT.body, THEME.dim);
    if (opts.meta) drawTextRight(ctx, opts.meta, x + w - SPACE.sm, y - 13, TEXT.body, THEME.faint);
  }
  if (!opts.transparent) drawNineSlice(ctx, 'frame', x, y, w, h);
  else strokeRect1(ctx, x, y, w, h, ROLE.edge);
  if (opts.accent) fillRect(ctx, x + BORDER.base, y + BORDER.base, w - BORDER.base * 2, BORDER.base, opts.accent);
}

/** パネルの中身が使える矩形（見出しと枠の内側）。 */
export function panelInner(
  x: number, y: number, w: number, h: number
): { x: number; y: number; w: number; h: number } {
  return { x: x + SPACE.md, y: y + SPACE.md, w: w - SPACE.md * 2, h: h - SPACE.md * 2 };
}

// ---------------------------------------------------------------- Button（§12）

export interface Button {
  x: number; y: number; w: number; h: number;
  label: string;
  disabled?: boolean;
  /** 主要動線。1画面に1つだけにする */
  accent?: boolean;
  /** タブや切り替えで「今これが選ばれている」 */
  selected?: boolean;
  /** 押されている間 true。pointerDown/Up で更新する */
  pressed?: boolean;
}

export function buttonState(b: Button): UiState {
  if (b.disabled) return 'disabled';
  if (b.pressed) return 'pressed';
  if (b.selected) return 'selected';
  return 'normal';
}

/**
 * ボタン。押下中は1px沈めてハードシャドウを消す（§14 §15）。
 * 無効時の暗幕は**ラベルより先**に打つ。順ディザは8pxビットマップの
 * 1px画線を市松に抜いてしまい、上から被せると字が読めなくなる。
 */
export function drawButton(
  ctx: CanvasRenderingContext2D, b: Button, size: FontSize = TEXT.title
): void {
  const st = buttonState(b);
  const dy = st === 'pressed' ? 1 : 0;

  // ハードシャドウ（ぼかし無し）。押下中は消して沈んだように見せる
  if (st !== 'pressed' && st !== 'disabled') {
    fillRect(ctx, b.x + SHADOW, b.y + b.h, b.w - SHADOW, SHADOW, ROLE.edge);
    fillRect(ctx, b.x + b.w, b.y + SHADOW, SHADOW, b.h - SHADOW, ROLE.edge);
  }

  drawNineSlice(ctx, 'button', b.x, b.y + dy, b.w, b.h);
  if (b.accent && st !== 'disabled') {
    fillRect(ctx, b.x + BORDER.base, b.y + dy + BORDER.base, b.w - BORDER.base * 2, BORDER.base, THEME.gold);
  }
  if (st === 'selected') strokeRect1(ctx, b.x, b.y + dy, b.w, b.h, THEME.gold);
  if (st === 'disabled') {
    fillScrim(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, THEME.bg, 0.55);
  }
  drawTextCentered(ctx, b.label, b.x + Math.floor(b.w / 2),
    b.y + dy + Math.floor((b.h - size) / 2), size,
    st === 'disabled' ? THEME.dim : THEME.text);
}

export function hitButton(b: Button, x: number, y: number): boolean {
  return !b.disabled && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function inRect(
  x: number, y: number, rx: number, ry: number, rw: number, rh: number
): boolean {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

// ---------------------------------------------------------------- Badge

/** 件数バッジ。0のときは呼び出し側で出さないこと。 */
export function drawBadge(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  text: string, color: string = THEME.red
): number {
  const w = textWidth(text, TEXT.body) + SPACE.md;
  fillRect(ctx, x, y, w, 14, color);
  strokeRect1(ctx, x, y, w, 14, ROLE.edge);
  drawText(ctx, text, x + SPACE.sm, y + 1, TEXT.body, THEME.text);
  return w;
}

/** 属性・種別などの札。枠色で意味を示し、地は暗いまま。 */
export function drawTag(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  text: string, color: string
): number {
  const w = textWidth(text, TEXT.body) + SPACE.md;
  fillRect(ctx, x, y, w, 13, ROLE.edge);
  strokeRect1(ctx, x, y, w, 13, color);
  drawText(ctx, text, x + SPACE.sm, y + 1, TEXT.body, color);
  return w;
}

// ---------------------------------------------------------------- ProgressBar

/**
 * 進捗・HP。track を必ず暗く敷いてから fill を乗せる。
 * threshold を渡すと、その位置に白い目盛りを立てる（撤退ラインなど）。
 */
export function drawProgress(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, color: string, threshold?: number
): void {
  const r = Math.max(0, Math.min(1, ratio));
  fillRect(ctx, x, y, w, h, ROLE.progressTrack);
  fillRect(ctx, x + 1, y + 1, Math.round((w - 2) * r), h - 2, color);
  if (threshold !== undefined && threshold > 0 && threshold < 1) {
    const tx = x + Math.round(w * threshold);
    fillRect(ctx, tx, y - 2, 1, h + 4, THEME.text);
  }
}

// ---------------------------------------------------------------- Tab

/** 横並びのタブ。選択中は地を持ち上げて金の下線を引く。 */
export function drawTabs(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  labels: readonly string[], selected: number
): void {
  const tw = Math.floor(w / Math.max(1, labels.length));
  labels.forEach((label, i) => {
    const tx = x + i * tw;
    const on = i === selected;
    fillRect(ctx, tx, y, tw - BORDER.thin, h, on ? ROLE.surfaceRaised : ROLE.surface);
    if (on) fillRect(ctx, tx, y + h - BORDER.base, tw - BORDER.thin, BORDER.base, THEME.gold);
    drawTextCentered(ctx, label, tx + tw / 2, y + Math.floor((h - TEXT.body) / 2) - 1,
      TEXT.body, on ? THEME.gold : THEME.dim);
  });
}

export function hitTab(
  x: number, y: number, w: number, h: number, count: number,
  px: number, py: number
): number {
  if (py < y || py >= y + h || px < x || px >= x + w) return -1;
  const tw = Math.floor(w / Math.max(1, count));
  const i = Math.floor((px - x) / tw);
  return i >= 0 && i < count ? i : -1;
}

// ---------------------------------------------------------------- Modal（§6）

/**
 * 背後をベタで隠してから枠を描く。
 * ディザで半分透かすと、背後の文字が市松のノイズとして残って
 * 「読めないが目に入る」最悪の状態になる。隠すなら完全に隠す。
 */
export function drawModalBackdrop(
  ctx: CanvasRenderingContext2D, w: number, h: number
): void {
  fillRect(ctx, 0, 0, w, h, ROLE.edge);
}

// ---------------------------------------------------------------- 数値の変化（§8）

interface FloatText {
  x: number; y: number;
  text: string;
  color: string;
  life: number;
}

interface Toast {
  text: string;
  color: string;
  life: number;
}

/**
 * 「数値変化をイベントとして扱う」（§8）。
 *
 * ATK 38 → 46 と黙って書き換えるのではなく、`+8` を短く浮かせる。
 * 取得・売却・撃破など、プレイヤーが原因を作った変化にだけ付ける。
 * 常時動くものは作らない（§15「常時点滅は悪い例」）。
 */
export class Feedback {
  private floats: FloatText[] = [];
  private toasts: Toast[] = [];

  /** 増減値をその場に浮かせる。 */
  float(x: number, y: number, delta: number, unit = ''): void {
    if (delta === 0) return;
    this.floats.push({
      x, y,
      text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}${unit}`,
      color: delta > 0 ? ROLE.positive : ROLE.negative,
      life: DUR.float
    });
  }

  /** 任意の文字列を浮かせる（「会心！」など）。 */
  floatText(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, life: DUR.float });
  }

  /** 画面上端の通知。重要イベントだけに使う（§10「ログはメインUIにしない」）。 */
  notify(text: string, color: string = THEME.gold): void {
    this.toasts.push({ text, color, life: DUR.toast });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  update(dt: number): void {
    for (const f of this.floats) f.life -= dt;
    for (const t of this.toasts) t.life -= dt;
    this.floats = this.floats.filter(f => f.life > 0);
    this.toasts = this.toasts.filter(t => t.life > 0);
  }

  get busy(): boolean {
    return this.floats.length > 0 || this.toasts.length > 0;
  }

  /**
   * screenH を渡すと通知を下端から積む。
   * 上端に出すと、画面のいちばん重要な1行（レポートの結果行など）に
   * かぶさってしまう。通知は補助情報なので、主役を隠さない場所に置く（§10）。
   */
  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH = 640): void {
    for (const f of this.floats) {
      const t = 1 - f.life / DUR.float;
      const dy = Math.round(t * 14);
      // 消え際は1フレームおきに間引いて、じわっと消えるように見せる
      if (t > 0.7 && Math.floor(f.life * 24) % 2 === 0) continue;
      drawText(ctx, f.text, Math.round(f.x), Math.round(f.y) - dy, TEXT.body, ROLE.edge);
      drawText(ctx, f.text, Math.round(f.x), Math.round(f.y) - dy - 1, TEXT.body, f.color);
    }
    this.toasts.forEach((t, i) => {
      const y = screenH - 96 - i * 18;
      const w = textWidth(t.text, TEXT.body) + SPACE.lg * 2;
      const x = Math.floor((screenW - w) / 2);
      fillRect(ctx, x, y, w, 16, ROLE.edge);
      strokeRect1(ctx, x, y, w, 16, t.color);
      drawText(ctx, t.text, x + SPACE.lg, y + 2, TEXT.body, t.color);
    });
  }
}

/**
 * 跳ね（§15「Item dropped → カードが少し跳ねる → 通常サイズへ戻る」）。
 * 経過時間から縦のずれを返すだけ。拡大縮小はドットが崩れるので使わない。
 */
export function popOffset(elapsed: number): number {
  if (elapsed < 0 || elapsed > DUR.pop) return 0;
  const t = elapsed / DUR.pop;
  return -Math.round(Math.sin(t * Math.PI) * 3);
}
