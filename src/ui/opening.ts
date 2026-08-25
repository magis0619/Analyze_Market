import type { GameScreen, Nav } from '../game/app';
import type { Item, Rarity } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, textWidth, wrapText } from '../render/font';
import { Effects } from '../render/effects';
import { sfx } from '../render/audio';
import { hasCutIn, sellValue } from '../sim/items';
import { uniqueDef } from '../data/uniques';
import { THEME } from './theme';
import { drawBtn, hitBtn, type Btn } from './widgets';
import {
  RARITY_COLOR, RARITY_LABEL, affixLine, drawItemDetail, drawItemRow,
  itemIconName, itemName, tierStars
} from './itemview';

// 開封（§7.4）。このゲームで最も重要な画面（§2）。
//
// 設計の骨子:
//  1. 平常時は淡々と。派手にするのは稀少・遺物のカットインだけ（§9.4）。
//  2. カットインは必ず「溜め（止まる）→ 解放（弾ける）」の順に組む。
//     いきなり出すと「跳ねた」感じにならない。
//  3. レアリティが上がるほど、止まる時間・パーティクル量・画面効果を
//     段階的に強くする。並と遺物が同じ密度で流れてはいけない。
//  4. §9.3 の禁止事項（bloom／ブラー／グラデーション／ドットの回転）は使わない。
//     使うのは 整数矩形・スプライト・パーティクル・画面揺れ・点滅・整数倍スケール のみ。

// ---------------------------------------------------------------- レイアウト

const LIST_X = 8;
const LIST_W = VW - 16;
const LIST_Y = 40;
const ROW_H = 34;
const ROW_GAP = 2;
const SUMMARY_Y = 412;

function rowY(i: number): number {
  return LIST_Y + i * (ROW_H + ROW_GAP);
}

const MAIN_BTN: Btn = { x: 80, y: 520, w: 200, h: 44, label: '一括開封', accent: true };
const BACK_BTN: Btn = { x: 80, y: 520, w: 200, h: 44, label: '拠点へ戻る', accent: true };
const SKIP_BTN: Btn = { x: 244, y: 526, w: 100, h: 32, label: 'スキップ' };

// ---------------------------------------------------------------- 演出パラメータ
//
// レアリティごとの「段階」。この表がこの画面の設計そのもの。
//  step   : 一覧に流れる間隔（秒）。並は詰まって流れ、上質で少し溜める
//  land   : 着地時のフラッシュ時間
//  parts  : 追加パーティクル数（0 は演出なし）

interface FlowTuning {
  step: number;
  land: number;
  parts: number;
}

const FLOW: Record<Rarity, FlowTuning> = {
  common: { step: 0.20, land: 0.10, parts: 0 },
  fine:   { step: 0.30, land: 0.16, parts: 6 },
  rare:   { step: 0.34, land: 0.26, parts: 0 },
  relic:  { step: 0.34, land: 0.32, parts: 0 }
};

/** カットインの時刻表（秒）。稀少と遺物で長さも中身も変える。 */
interface CutTiming {
  /** 暗転が完了するまで */
  dark: number;
  /** 溜めの終わり（ここから完全静止） */
  charge: number;
  /** 静止の終わり ＝ 解放の瞬間 */
  hold: number;
  /** 提示の終わり */
  present: number;
  /** 収束の終わり */
  out: number;
}

const RARE_T: CutTiming = { dark: 0.10, charge: 0.46, hold: 0.58, present: 1.70, out: 1.92 };
const RELIC_T: CutTiming = { dark: 0.26, charge: 1.00, hold: 1.20, present: 3.20, out: 3.50 };

const PARTICLE_CAP = 240;

// ---------------------------------------------------------------- 小物

/** 整数ステップの疑似乱数（演出のばらつき用。決定論でよい）。 */
function hashF(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 8) / 0x1000000;
}

/** 中心から外へ伸びる光条。矩形の並びで描くのでドットの回転にならない。 */
function drawSpokes(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  count: number, inner: number, outer: number, colorA: string, colorB: string
): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    for (let r = inner; r < outer; r += 5) {
      const s = r > outer - 20 ? 2 : 3;
      ctx.fillRect(Math.round(cx + dx * r), Math.round(cy + dy * r), s, s);
    }
  }
}

/**
 * 溜め中の「？」。黒地の座布団を敷いてから 12px グリフを整数3倍で描く。
 * （フォントサイズは 8/12 の2種のまま。拡大は整数倍のみ）
 */
function drawBigQuestion(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string
): void {
  fillRect(ctx, cx - 20, cy - 22, 40, 44, THEME.outline);
  strokeRect1(ctx, cx - 20, cy - 22, 40, 44, color);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(3, 3);
  drawTextCentered(ctx, '？', 0, -6, 12, color);
  ctx.restore();
}

/** 画面外周のマーチング枠（点滅する破線）。遺物専用。 */
function drawMarchingBorder(ctx: CanvasRenderingContext2D, t: number, a: string, b: string): void {
  const off = Math.floor(t * 48) % 16;
  for (let x = -16; x < VW + 16; x += 16) {
    const c = (Math.floor((x + off) / 16) % 2 === 0) ? a : b;
    fillRect(ctx, x + off, 0, 8, 3, c);
    fillRect(ctx, VW - 8 - (x + off), VH - 3, 8, 3, c);
  }
  for (let y = -16; y < VH + 16; y += 16) {
    const c = (Math.floor((y + off) / 16) % 2 === 0) ? b : a;
    fillRect(ctx, 0, y + off, 3, 8, c);
    fillRect(ctx, VW - 3, VH - 8 - (y + off), 3, 8, c);
  }
}

// ---------------------------------------------------------------- 本体

type Phase = 'intro' | 'flow' | 'cut' | 'done';

export class OpeningScreen implements GameScreen {
  private readonly nav: Nav;
  private readonly items: Item[];

  private phase: Phase = 'intro';
  /** フェーズ内の経過時間 */
  private t = 0;
  /** 画面全体の経過時間（点滅の位相） */
  private clock = 0;

  /** 次に開ける index */
  private idx = 0;
  /** 一覧に出ている数 */
  private shown = 0;

  private readonly fx = new Effects();

  // 着地・揺れ・閃光
  private landT = 0;
  private landMax = 0.1;
  private landRarity: Rarity = 'common';
  private shakeT = 0;
  private shakeAmp = 0;
  private flashT = 0;
  private flashMax = 0.1;
  private flashColor = THEME.text;
  private spokeT = 0;
  private spokeMax = 0.35;

  // 収穫（数値が跳ねる部分）
  private goldTarget = 0;
  private goldShown = 0;
  private goldPop = 0;

  // カットイン
  private cutItem: Item | null = null;
  private burstDone = false;
  private cutTicks = 0;
  private typed = 0;

  // スキップ
  private fastFlow = false;
  private tapTimes: number[] = [];

  // 一覧から開く詳細
  private detail: Item | null = null;

  constructor(nav: Nav, items: Item[]) {
    this.nav = nav;
    this.items = items;
  }

  // -------------------------------------------------------------- 進行

  update(dt: number): void {
    this.clock += dt;
    this.fx.update(dt);
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.spokeT > 0) this.spokeT = Math.max(0, this.spokeT - dt);
    if (this.goldPop > 0) this.goldPop = Math.max(0, this.goldPop - dt);

    // 数値のカウントアップ。一気に代入せず追いかけさせる（跳ねの快感）
    if (this.goldShown < this.goldTarget) {
      const diff = this.goldTarget - this.goldShown;
      this.goldShown = Math.min(this.goldTarget, this.goldShown + Math.max(1, diff * 6 * dt));
    }

    if (this.phase === 'flow') {
      this.t += dt;
      if (this.t >= this.stepDur()) {
        this.t = 0;
        this.advance();
      }
    } else if (this.phase === 'cut') {
      this.t += dt;
      this.cutTick();
    }
  }

  private stepDur(): number {
    if (this.fastFlow) return 0.06;
    const it = this.items[this.idx];
    return it ? FLOW[it.rarity].step : 0.2;
  }

  private advance(): void {
    const it = this.items[this.idx];
    if (!it) {
      this.finish();
      return;
    }
    if (hasCutIn(it.rarity)) {
      this.startCut(it);
      return;
    }
    this.reveal(it);
    this.idx++;
  }

  /** 一覧に1個落とす。ここが「テンポ」の実体。 */
  private reveal(it: Item): void {
    this.shown = Math.max(this.shown, this.idx + 1);
    const tune = FLOW[it.rarity];
    this.landT = tune.land;
    this.landMax = tune.land;
    this.landRarity = it.rarity;
    this.goldTarget += sellValue(it);
    this.goldPop = 0.3;
    if (it.rarity === 'common') {
      sfx('tap');
    } else if (it.rarity === 'fine') {
      sfx('loot');
      this.emit(VW / 2, rowY(this.idx) + ROW_H / 2, tune.parts, [THEME.blue, THEME.text], 40);
    }
  }

  private finish(): void {
    this.phase = 'done';
    this.t = 0;
    sfx('confirm');
  }

  // -------------------------------------------------------------- カットイン

  private startCut(it: Item): void {
    this.phase = 'cut';
    this.t = 0;
    this.cutItem = it;
    this.burstDone = false;
    this.cutTicks = 0;
    this.typed = 0;
  }

  private cutTick(): void {
    const it = this.cutItem;
    if (!it) {
      this.phase = 'flow';
      return;
    }
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;

    // 溜めの刻み音。遺物は低い鼓動、稀少は乾いたチック。
    if (this.t < T.charge) {
      const beats = relic ? 3 : 3;
      const want = Math.floor(((this.t - T.dark) / (T.charge - T.dark)) * beats) + 1;
      if (want > this.cutTicks && this.t > T.dark) {
        this.cutTicks = want;
        sfx(relic ? 'damage' : 'tap');
      }
    }

    // 解放。音と閃光のピークをここで揃える。
    if (!this.burstDone && this.t >= T.hold) {
      this.burstDone = true;
      this.burst(it);
    }

    if (this.t >= T.out) {
      this.reveal(it);
      this.idx++;
      this.cutItem = null;
      this.phase = 'flow';
      this.t = 0;
    }
  }

  private burst(it: Item): void {
    const relic = it.rarity === 'relic';
    const cx = VW / 2;
    const cy = 300;
    // 前作資産の 0.8秒ホールド＋パーティクルをそのまま土台に使い、上に盛る（§1.1）
    this.fx.holdRare(cx, cy);
    if (relic) {
      this.emit(cx, cy, 64, [THEME.red, THEME.gold, THEME.text], 150);
      this.emit(cx, cy, 24, [THEME.red, '#7c2418'], 70);
      this.shakeAmp = 6;
      this.shakeT = 0.5;
      this.flashT = 0.1;
      this.flashMax = 0.1;
      this.flashColor = THEME.text;
      this.spokeT = 0.34;
      this.spokeMax = 0.34;
      sfx('rare');
      sfx('levelup');
    } else {
      this.emit(cx, cy, 34, [THEME.gold, THEME.text], 110);
      this.shakeAmp = 4;
      this.shakeT = 0.32;
      this.flashT = 0.07;
      this.flashMax = 0.07;
      this.flashColor = THEME.text;
      this.spokeT = 0.26;
      this.spokeMax = 0.26;
      sfx('rare');
    }
  }

  /** パーティクルは Effects の配列に載せる（描画・寿命管理を共有する）。 */
  private emit(cx: number, cy: number, n: number, colors: string[], speed: number): void {
    if (n <= 0 || colors.length === 0) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + hashF(i * 7 + this.shown) * 0.6;
      const spd = speed * (0.45 + hashF(i * 13 + 1) * 0.75);
      const color = colors[i % colors.length] ?? THEME.text;
      this.fx.particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 30,
        life: 0.6 + hashF(i * 29) * 0.5,
        maxLife: 1.1,
        color,
        size: i % 5 === 0 ? 3 : 2
      });
    }
    // 60fps を守るため上限で切る
    const over = this.fx.particles.length - PARTICLE_CAP;
    if (over > 0) this.fx.particles.splice(0, over);
  }

  // -------------------------------------------------------------- 入力

  pointerDown(x: number, y: number): void {
    if (this.detail) {
      this.detail = null;
      sfx('tap');
      return;
    }
    if (this.phase === 'intro') {
      if (hitBtn(MAIN_BTN, x, y)) {
        sfx('confirm');
        this.phase = 'flow';
        this.t = 0;
      }
      return;
    }
    if (this.phase === 'done') {
      if (hitBtn(BACK_BTN, x, y)) {
        sfx('confirm');
        this.nav.goBase();
        return;
      }
      const i = this.rowAt(x, y);
      const it = i === null ? null : this.items[i];
      if (it) {
        this.detail = it;
        sfx('tap');
      }
      return;
    }
    // 開封中：スキップ
    if (hitBtn(SKIP_BTN, x, y)) {
      this.skipAll();
      return;
    }
    this.tapTimes.push(this.clock);
    if (this.tapTimes.length > 3) this.tapTimes.shift();
    const first = this.tapTimes[0];
    if (this.tapTimes.length === 3 && first !== undefined && this.clock - first < 0.9) {
      // 連打で全部飛ばす（稀少以上も一覧には残る）
      this.skipAll();
      return;
    }
    if (this.phase === 'cut') {
      const it = this.cutItem;
      const T = it && it.rarity === 'relic' ? RELIC_T : RARE_T;
      if (this.t < T.out - 0.12) {
        if (!this.burstDone && it) {
          // 溜めの途中で飛ばしても、弾ける瞬間だけは見せる
          this.burstDone = true;
          this.burst(it);
        }
        this.t = T.out - 0.12;
      }
    } else {
      this.fastFlow = true;
      this.t = this.stepDur();
    }
  }

  private rowAt(x: number, y: number): number | null {
    if (x < LIST_X || x >= LIST_X + LIST_W) return null;
    for (let i = 0; i < this.shown; i++) {
      const ry = rowY(i);
      if (y >= ry && y < ry + ROW_H) return i;
    }
    return null;
  }

  private skipAll(): void {
    for (let i = this.idx; i < this.items.length; i++) {
      const it = this.items[i];
      if (it) this.goldTarget += sellValue(it);
    }
    this.idx = this.items.length;
    this.shown = this.items.length;
    this.cutItem = null;
    this.landT = 0;
    this.finish();
  }

  // -------------------------------------------------------------- 描画

  draw(ctx: CanvasRenderingContext2D): void {
    const shake = this.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.bg);

    this.drawHeader(ctx);
    this.drawList(ctx);
    if (this.phase === 'done') this.drawSummary(ctx);
    this.drawButtons(ctx);

    if (this.phase === 'cut') this.drawCut(ctx);

    this.fx.drawParticles(ctx);

    if (this.flashT > 0) {
      // 3段の階段状フラッシュ（グラデーションは使わない）
      const k = this.flashT / this.flashMax;
      const c = k > 0.66 ? this.flashColor : k > 0.33 ? THEME.gold : THEME.goldDark;
      fillRect(ctx, -8, -8, VW + 16, VH + 16, c);
    }

    if (this.detail) {
      ctx.fillStyle = 'rgba(15,11,20,0.82)';
      ctx.fillRect(-8, -8, VW + 16, VH + 16);
      // 高さは共有部品側の都合で変わるので、閉じる案内は固定位置に置く
      drawItemDetail(ctx, this.detail, 20, 190, VW - 40);
      drawTextCentered(ctx, 'タップで閉じる', VW / 2, 470, 8, THEME.dim);
    }
    ctx.restore();
  }

  private shakeOffset(): { x: number; y: number } {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const a = this.shakeAmp * (this.shakeT / 0.5);
    const n = Math.floor(this.clock * 60);
    return {
      x: Math.round((hashF(n) - 0.5) * 2 * a),
      y: Math.round((hashF(n + 999) - 0.5) * 2 * a)
    };
  }

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    drawText(ctx, '開封', LIST_X, 10, 12, THEME.gold);
    const total = this.items.length;
    drawText(ctx, `${this.shown} / ${total}`, LIST_X + 44, 12, 8, THEME.dim);

    // 収穫額。着地のたびに跳ねる（色の点滅＋2px の浮き）
    const pop = this.goldPop > 0;
    const gy = 10 - (pop && Math.floor(this.clock * 20) % 2 === 0 ? 2 : 0);
    const col = pop ? THEME.text : THEME.goldDark;
    drawTextRight(ctx, `${Math.round(this.goldShown)}G`, VW - LIST_X, gy, 12, col);
    fillRect(ctx, LIST_X, 30, LIST_W, 1, THEME.panelLight);
  }

  private drawList(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.items.length; i++) {
      const y = rowY(i);
      const it = this.items[i];
      if (!it) continue;
      if (i >= this.shown) {
        this.drawClosed(ctx, y);
        continue;
      }
      const landing = i === this.shown - 1 && this.landT > 0;
      const k = landing ? this.landT / this.landMax : 0;
      // 右から整数ステップで滑り込む
      const dx = landing ? Math.round(k * 20) : 0;
      drawItemRow(ctx, it, LIST_X + dx, y, LIST_W - dx, ROW_H);
      if (landing) {
        // 着地フラッシュ：レアリティ色の帯を2段で被せる
        const c = RARITY_COLOR[this.landRarity];
        if (k > 0.78) {
          fillRect(ctx, LIST_X + dx, y, LIST_W - dx, ROW_H, c);
        } else if (k > 0.35) {
          strokeRect1(ctx, LIST_X + dx, y, LIST_W - dx, ROW_H, c);
          strokeRect1(ctx, LIST_X + dx + 1, y + 1, LIST_W - dx - 2, ROW_H - 2, c);
        }
      }
      // 遺物は一覧の中でも常に自己主張する
      if (it.rarity === 'relic' && Math.floor(this.clock * 3) % 2 === 0) {
        strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, THEME.gold);
      }
    }
  }

  private drawClosed(ctx: CanvasRenderingContext2D, y: number): void {
    fillRect(ctx, LIST_X, y, LIST_W, ROW_H, THEME.panel);
    strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, THEME.outline);
    drawSprOr(ctx, 'ev_chest', 'icon_T1', LIST_X + 5, y + Math.floor((ROW_H - 16) / 2));
    drawText(ctx, '未鑑定', LIST_X + 25, y + 11, 8, THEME.dim);
    drawTextRight(ctx, '？', VW - LIST_X - 6, y + 10, 12, THEME.panelLight);
  }

  private drawSummary(ctx: CanvasRenderingContext2D): void {
    let rare = 0;
    let relic = 0;
    for (const it of this.items) {
      if (it.rarity === 'rare') rare++;
      if (it.rarity === 'relic') relic++;
    }
    fillRect(ctx, LIST_X, SUMMARY_Y, LIST_W, 1, THEME.panelLight);
    const y = SUMMARY_Y + 10;
    drawText(ctx, `稀少 ${rare}`, LIST_X, y, 12, rare > 0 ? THEME.gold : THEME.dim);
    drawText(ctx, `遺物 ${relic}`, LIST_X + 80, y, 12, relic > 0 ? THEME.red : THEME.dim);
    drawTextRight(ctx, `売却 ${this.goldTarget}G`, VW - LIST_X, y, 12, THEME.goldDark);
    drawText(ctx, 'タップで詳細', LIST_X, y + 22, 8, THEME.dim);
  }

  private drawButtons(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'intro') {
      drawTextCentered(ctx, `${this.items.length}個の未鑑定品を持ち帰った`, VW / 2, 486, 8, THEME.dim);
      drawBtn(ctx, MAIN_BTN);
    } else if (this.phase === 'done') {
      drawBtn(ctx, BACK_BTN);
    } else {
      drawBtn(ctx, SKIP_BTN, 8);
    }
  }

  // -------------------------------------------------------------- カットイン描画

  private drawCut(ctx: CanvasRenderingContext2D): void {
    const it = this.cutItem;
    if (!it) return;
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;
    const t = this.t;
    const cx = VW / 2;
    const cy = 300;

    // --- 暗転（階段状。3段で落とす）---
    if (t < T.dark) {
      const step = Math.min(2, Math.floor((t / T.dark) * 3));
      ctx.fillStyle = ['rgba(15,11,20,0.45)', 'rgba(15,11,20,0.75)', 'rgba(15,11,20,0.92)'][step] ?? 'rgba(15,11,20,0.92)';
      ctx.fillRect(-8, -8, VW + 16, VH + 16);
      return;
    }
    fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.outline);

    if (t < T.hold) {
      // --- 溜め。charge を過ぎたら値を固定して「完全に止める」---
      const p = Math.min(1, (t - T.dark) / (T.charge - T.dark));
      if (relic) this.drawChargeRelic(ctx, cx, cy, p, t < T.charge);
      else this.drawChargeRare(ctx, cx, cy, p, t < T.charge);
      return;
    }

    // --- 解放後 ---
    if (this.spokeT > 0) {
      const k = 1 - this.spokeT / this.spokeMax;
      const outer = Math.round(60 + k * 320);
      const inner = Math.max(0, outer - (relic ? 90 : 70));
      drawSpokes(ctx, cx, cy, relic ? 16 : 12, inner, outer,
        relic ? THEME.red : THEME.gold, relic ? THEME.gold : THEME.goldDark);
    }
    if (relic) drawMarchingBorder(ctx, this.clock, THEME.gold, THEME.red);

    const since = t - T.hold;
    this.drawCard(ctx, it, since, relic);

    // 収束：2フレーム点滅で消える
    if (t > T.present) {
      if (Math.floor((t - T.present) * 30) % 2 === 0) {
        fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.outline);
      }
    }
  }

  /** 稀少の溜め：中央の帯が整数ステップで開き、指示線が寄ってくる。 */
  private drawChargeRare(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean
  ): void {
    const bandH = Math.round(p * 88 / 8) * 8;
    fillRect(ctx, 0, cy - bandH / 2, VW, bandH, THEME.panel);
    fillRect(ctx, 0, cy - bandH / 2, VW, 1, THEME.goldDark);
    fillRect(ctx, 0, cy + bandH / 2 - 1, VW, 1, THEME.goldDark);

    const dist = Math.round((1 - p) * 140) + 24;
    for (let i = 0; i < 3; i++) {
      const d = dist + i * 10;
      fillRect(ctx, cx - d, cy - 3, 6, 6, THEME.gold);
      fillRect(ctx, cx + d - 6, cy - 3, 6, 6, THEME.gold);
    }
    if (p > 0.3) {
      const blink = moving ? Math.floor(this.clock * 16) % 2 === 0 : true;
      if (blink) drawBigQuestion(ctx, cx, cy, THEME.gold);
    }
  }

  /** 遺物の溜め：画面は暗転したまま。赤い柱と亀裂だけが育つ。 */
  private drawChargeRelic(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean
  ): void {
    const beat = moving ? (Math.floor(this.clock * 8) % 2 === 0 ? 2 : 0) : 2;
    const h = Math.round(p * 240 / 12) * 12;
    fillRect(ctx, cx - 2 - beat, cy - h / 2, 4 + beat * 2, h, THEME.red);
    fillRect(ctx, cx - 1, cy - h / 2, 2, h, THEME.gold);

    // 四隅から中央へ伸びる亀裂（2×2 の階段。回転ではない）
    const len = Math.round(p * 26);
    const corners: Array<[number, number, number, number]> = [
      [8, 8, 1, 1], [VW - 10, 8, -1, 1], [8, VH - 10, 1, -1], [VW - 10, VH - 10, -1, -1]
    ];
    for (const c of corners) {
      const [sx, sy, dxs, dys] = c;
      for (let i = 0; i < len; i++) {
        const jitter = hashF(i * 3 + sx) > 0.5 ? 1 : 0;
        fillRect(ctx, sx + dxs * i * 6, sy + dys * (i * 6 + jitter * 3), 3, 3,
          i % 3 === 0 ? THEME.gold : THEME.red);
      }
    }

    const scan = Math.round((1 - p) * 200);
    fillRect(ctx, 0, cy - scan, VW, 1, THEME.red);
    fillRect(ctx, 0, cy + scan, VW, 1, THEME.red);

    if (p > 0.5) {
      const blink = moving ? Math.floor(this.clock * 20) % 2 === 0 : true;
      if (blink) drawBigQuestion(ctx, cx, cy, THEME.red);
    }
  }

  /**
   * 提示。稀少＝札とアフィックス、遺物＝暗転の中にユニーク効果の1行。
   * 札は暗い地に太いレアリティ枠。黒背景の中で「一枚だけ照らされている」ようにする。
   */
  private drawCard(
    ctx: CanvasRenderingContext2D, it: Item, since: number, relic: boolean
  ): void {
    const cx = VW / 2;
    const color = RARITY_COLOR[it.rarity];
    const cardW = relic ? 304 : 288;

    // 中身の行数から高さを先に決める（打鍵中に札が伸び縮みしないように）
    const u = relic && it.unique ? uniqueDef(it.unique) : null;
    const bodyRows = u
      ? 1 + wrapText(u.text, cardW - 32, 12).length
      : it.affixes.length;
    const iconScale = relic ? 4 : 3;
    const iconPx = 16 * iconScale;
    const cardH = 14 + iconPx + 12 + 18 + bodyRows * 17 + 22;
    const cardY = 300 - Math.floor(cardH / 2);
    const cardX = Math.round(cx - cardW / 2);

    // 立ち上がりの3段スケール（整数）。ここで「弾けた」感じを出す
    if (since < 0.05) {
      fillRect(ctx, cx - 44, 300 - 14, 88, 28, THEME.text);
      return;
    }
    if (since < 0.10) {
      const w = Math.round(cardW / 2);
      const h = Math.round(cardH / 2);
      fillRect(ctx, cx - w / 2, 300 - h / 2, w, h, color);
      return;
    }

    // --- 見出し帯 ---
    const bandY = cardY - 46;
    const loud = Math.floor(this.clock * 12) % 2 === 0;
    if (relic) {
      // 遺物だけ帯を赤で塗り潰す。稀少（黒地＋金枠）と一目で別物にする
      fillRect(ctx, 0, bandY, VW, 38, THEME.red);
      fillRect(ctx, 0, bandY, VW, 2, THEME.gold);
      fillRect(ctx, 0, bandY + 36, VW, 2, THEME.gold);
    } else {
      fillRect(ctx, 0, bandY, VW, 38, THEME.outline);
      fillRect(ctx, 0, bandY, VW, 2, color);
      fillRect(ctx, 0, bandY + 36, VW, 2, color);
    }
    ctx.save();
    ctx.translate(cx, bandY + 7);
    ctx.scale(2, 2);
    drawTextCentered(ctx, RARITY_LABEL[it.rarity], 0, 0, 12,
      relic ? (loud ? THEME.text : THEME.gold) : (since < 0.35 && loud ? THEME.text : color));
    ctx.restore();

    // --- 札 ---
    fillRect(ctx, cardX, cardY, cardW, cardH, THEME.bg);
    strokeRect1(ctx, cardX, cardY, cardW, cardH, color);
    strokeRect1(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, color);
    strokeRect1(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, THEME.panelLight);

    // アイコン（整数倍スケール）
    const ix = Math.round(cx - iconPx / 2);
    const iy = cardY + 14;
    fillRect(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12, THEME.panel);
    strokeRect1(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12,
      relic && Math.floor(this.clock * 8) % 2 === 0 ? THEME.gold : THEME.outline);
    drawSprOr(ctx, itemIconName(it), 'icon_W1', ix, iy, iconScale);

    // 名前
    const nameY = iy + iconPx + 12;
    drawTextCentered(ctx, itemName(it), cx, nameY, 12, relic ? THEME.gold : color);

    let ly = nameY + 22;
    if (u) {
      drawTextCentered(ctx, `《${u.name}》`, cx, ly, 12, THEME.red);
      ly += 19;
      // ユニーク効果の1行を1文字ずつ出す（§7.4 ユニーク効果のテキスト表示）
      const chars = Math.max(0, Math.floor((since - 0.35) / 0.035));
      if (chars > this.typed) {
        if (chars % 4 === 0) sfx('tap');
        this.typed = chars;
      }
      const rows = wrapText(u.text.slice(0, chars), cardW - 32, 12);
      rows.forEach((ln, i) => {
        drawTextCentered(ctx, ln, cx, ly + i * 17, 12, THEME.text);
      });
      if (chars < u.text.length && Math.floor(this.clock * 16) % 2 === 0) {
        const li = Math.max(0, rows.length - 1);
        const last = rows[li] ?? '';
        fillRect(ctx, cx + Math.floor(textWidth(last, 12) / 2) + 2, ly + li * 17 + 1, 6, 12, THEME.gold);
      }
      ly += bodyRows > 1 ? (bodyRows - 1) * 17 : 17;
    } else {
      // アフィックスを1行ずつ、間を置いて出す
      it.affixes.forEach((a, i) => {
        if (since < 0.18 + i * 0.13) return;
        drawText(ctx, affixLine(a), cardX + 16, ly + i * 17, 12, THEME.text);
        drawTextRight(ctx, tierStars(a.tier), cardX + cardW - 16, ly + i * 17, 12,
          a.tier >= 4 ? THEME.gold : THEME.dim);
      });
      ly += it.affixes.length * 17;
    }

    // 増える売却額。数値が跳ねる瞬間を札の中にも置く
    if (since > 0.28) {
      const pop = since < 0.42 && Math.floor(this.clock * 20) % 2 === 0;
      drawTextRight(ctx, `+${sellValue(it)}G`, cardX + cardW - 16, cardY + cardH - 18, 12,
        pop ? THEME.text : THEME.goldDark);
    }

    // 札の周りを1周する光点
    const per = relic ? 0.7 : 0.9;
    const ph = (this.clock % per) / per;
    const peri = 2 * (cardW + cardH);
    const d = ph * peri;
    let px = cardX;
    let py = cardY;
    if (d < cardW) { px = cardX + d; py = cardY; }
    else if (d < cardW + cardH) { px = cardX + cardW; py = cardY + (d - cardW); }
    else if (d < cardW * 2 + cardH) { px = cardX + cardW - (d - cardW - cardH); py = cardY + cardH; }
    else { px = cardX; py = cardY + cardH - (d - cardW * 2 - cardH); }
    fillRect(ctx, px - 1, py - 1, 3, 3, relic ? THEME.gold : THEME.text);
  }
}
