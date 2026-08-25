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

const RARE_T: CutTiming = { dark: 0.10, charge: 0.52, hold: 0.64, present: 2.22, out: 2.42 };
const RELIC_T: CutTiming = { dark: 0.26, charge: 1.05, hold: 1.25, present: 3.60, out: 3.90 };

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

// ---------------------------------------------------------------- 背景フィールド
//
// Balatro の実機フレームでは、パックを開ける間ずっと背景そのものが
// 緑→黄→橙へ変わり、マーブル模様が流れ続ける。これが「特別なことが
// 起きている」の主信号になっている。
//
// こちらはグラデーション禁止（§9.3）なので、
//   ・整数周期の正弦を足し合わせた値を 4×4 Bayer でディザして2値化し、
//   ・濃さの違う3枚のタイル（暗・中・明）に焼き、
//   ・それぞれ別々の速度でスクロールさせて重ねる
// という「描いた模様」に翻訳する。明るさは alpha ではなく
// 「何枚重ねるか」の段階で上げるので、階調オーバーレイにはならない。

/** タイルの一辺。周期を整数にすることで継ぎ目なく並ぶ。 */
const TILE = 256;

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

interface FieldStyle {
  /** 暗→明の3層。手前ほど面積が小さい */
  colors: [string, string, string];
  /** 各層のしきい値（大きいほど面積が小さい） */
  cuts: [number, number, number];
  /** 各層のスクロール速度 px/秒 */
  vel: [[number, number], [number, number], [number, number]];
}

const FIELD_STYLE: Record<'rare' | 'relic', FieldStyle> = {
  // 稀少：琥珀。暗褐色の地に金が流れる
  rare: {
    colors: ['#3a2715', '#5d3d20', '#b5862c'],
    cuts: [0.50, 0.64, 0.84],
    vel: [[5, -9], [-13, -20], [17, -31]]
  },
  // 遺物：熾火。紫黒の地に赤が脈打つ
  relic: {
    colors: ['#281a40', '#7c2418', '#c34433'],
    cuts: [0.46, 0.62, 0.80],
    vel: [[-4, 7], [11, 17], [-19, 27]]
  }
};

const fieldCache = new Map<string, HTMLCanvasElement[]>();

function fieldNoise(x: number, y: number): number {
  const k = (2 * Math.PI) / TILE;
  const n =
    Math.sin(k * x) * 1.15 +
    Math.sin(k * 2 * y + 1.7) +
    Math.sin(k * 3 * (x + y) + 0.4) * 0.8 +
    Math.sin(k * 2 * (x - y) + 2.3) * 0.9 +
    Math.sin(k * (x + 3 * y) + 1.1) * 0.7 +
    Math.sin(k * 5 * (x - 2 * y) + 0.2) * 0.45 +
    Math.sin(k * 7 * (2 * x + y) + 2.9) * 0.3;
  return (n / 5.3 + 1) / 2;
}

/** 3層のタイルを焼く（1回だけ。以降は使い回す）。 */
function fieldTiles(kind: 'rare' | 'relic'): HTMLCanvasElement[] {
  const hit = fieldCache.get(kind);
  if (hit) return hit;
  const style = FIELD_STYLE[kind];
  const out: HTMLCanvasElement[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const cctx = c.getContext('2d');
    if (!cctx) throw new Error('2d context unavailable');
    const img = cctx.createImageData(TILE, TILE);
    const hex = style.colors[layer] ?? '#000000';
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 0xff;
    const g = (v >> 8) & 0xff;
    const b = v & 0xff;
    const cut = style.cuts[layer] ?? 0.5;
    // 2×2 のドット単位。1px 単位にするとドット絵の粒より細かくなる
    for (let by = 0; by < TILE; by += 2) {
      for (let bx = 0; bx < TILE; bx += 2) {
        const dither = ((BAYER[(bx >> 1) % 4 + ((by >> 1) % 4) * 4] ?? 8) / 16 - 0.5) * 0.11;
        if (fieldNoise(bx, by) + dither <= cut) continue;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((by + dy) * TILE + bx + dx) * 4;
            img.data[i] = r;
            img.data[i + 1] = g;
            img.data[i + 2] = b;
            img.data[i + 3] = 255;
          }
        }
      }
    }
    cctx.putImageData(img, 0, 0);
    out.push(c);
  }
  fieldCache.set(kind, out);
  return out;
}

/**
 * 背景フィールドを描く。steps は 1〜3（重ねる層の数）＝明るさの段階。
 * 座標は必ず整数に丸める（非整数スケーリング・にじみを出さない）。
 */
function drawField(
  ctx: CanvasRenderingContext2D, kind: 'rare' | 'relic', t: number, steps: number
): void {
  fillRect(ctx, -8, -8, VW + 16, VH + 16, kind === 'relic' ? THEME.outline : '#1a1420');
  const tiles = fieldTiles(kind);
  const style = FIELD_STYLE[kind];
  const n = Math.max(0, Math.min(3, steps));
  for (let layer = 0; layer < n; layer++) {
    const tile = tiles[layer];
    const vel = style.vel[layer];
    if (!tile || !vel) continue;
    const ox = ((Math.round(t * vel[0]) % TILE) + TILE) % TILE;
    const oy = ((Math.round(t * vel[1]) % TILE) + TILE) % TILE;
    for (let y = -TILE + oy; y < VH; y += TILE) {
      for (let x = -TILE + ox; x < VW; x += TILE) {
        ctx.drawImage(tile, x, y);
      }
    }
  }
}

// ---------------------------------------------------------------- 紙片
//
// 実機の破裂は「白い矩形の紙片」が大量に飛ぶ。点のパーティクルでは細かすぎるので、
// 6〜16px の矩形を別系統で持つ。回転は禁止なので、縦横を入れ替えて“ひらひら”を作る。

interface Shard {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number;
  life: number; max: number;
  color: string;
  /** 縦横入れ替えの周期 */
  flip: number;
}

const SHARD_CAP = 80;

/** 封の箱。ドット絵の小物を矩形だけで組む（スプライト追加はしない）。 */
function drawSealBox(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  accent: string, crack: number, jitter: number
): void {
  const S = 2;                       // 整数倍スケール
  const bw = 26;
  const bh = 34;
  const x = Math.round(cx - (bw * S) / 2) + jitter;
  const y = Math.round(cy - (bh * S) / 2);
  const r = (px: number, py: number, pw: number, ph: number, color: string): void => {
    fillRect(ctx, x + px * S, y + py * S, pw * S, ph * S, color);
  };
  r(-1, -1, bw + 2, bh + 2, '#1a1420');          // アウトライン
  r(0, 0, bw, bh, '#5d3d20');                    // 本体
  r(0, 0, bw, 9, '#8a5f33');                     // 蓋
  r(0, 9, bw, 1, '#3a2715');                     // 蓋の合わせ目
  r(0, 0, bw, 1, '#b98a52');                     // 上面のハイライト
  r(1, 1, 1, 7, '#b98a52');
  r(bw / 2 - 2, 0, 4, bh, accent);               // 縦の帯
  r(0, bh / 2 - 2, bw, 4, accent);               // 横の帯
  r(bw / 2 - 4, bh / 2 - 4, 8, 8, '#7c2418');    // 封蝋
  r(bw / 2 - 3, bh / 2 - 3, 2, 2, '#c34433');
  // 割れ目。溜めの終盤に3本まで走る
  const cracks: Array<[number, number, number, number]> = [
    [6, 3, 1, 8], [bw - 8, 12, 1, 9], [10, bh - 10, 7, 1]
  ];
  for (let i = 0; i < cracks.length; i++) {
    if (crack <= i / cracks.length) continue;
    const c = cracks[i];
    if (c) r(c[0], c[1], c[2], c[3], '#f4f2ec');
  }
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
  /** 破裂した容れ物の紙片（実機の白い矩形に相当） */
  private shards: Shard[] = [];

  // スキップ
  private fastFlow = false;
  private tapTimes: number[] = [];

  // 一覧から開く詳細
  private detail: Item | null = null;

  /** 獲得の確定（openAll）を済ませたか。演出の経路に関わらず必ず一度だけ呼ぶ */
  private claimed = false;

  constructor(nav: Nav, items: Item[]) {
    this.nav = nav;
    this.items = items;
  }

  // -------------------------------------------------------------- 獲得の確定

  /**
   * 未鑑定品をインベントリと図鑑へ確定させる（§7.4）。
   *
   * 演出は「見せ方」でしかなく、獲得はここで確定する。スキップしても、
   * 途中で拠点へ戻っても、必ず一度だけ呼ばれること（取りこぼすと戦利品が消える）。
   * GameState.openAll() は pending を空にしてから返すので、二度呼んでも
   * 二重登録にはならないが、念のためフラグでも守る。
   */
  private claim(): void {
    if (this.claimed) return;
    this.claimed = true;
    const opened = this.nav.state.openAll();
    // 開封済み（identified: true）の実体に差し替えて、以降の表示を一致させる
    if (opened.length === this.items.length) {
      for (let i = 0; i < opened.length; i++) {
        const o = opened[i];
        if (o) this.items[i] = o;
      }
    }
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
    this.updateShards(dt);

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
    this.claim();
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
      // 容れ物が割れて中身が出る。紙片＝割れた箱そのもの
      this.spawnShards(cx, cy, 60, THEME.red);
      this.emit(cx, cy, 64, [THEME.red, THEME.gold, THEME.text], 150);
      this.emit(cx, cy, 24, [THEME.red, '#7c2418'], 70);
      this.shakeAmp = 6;
      this.shakeT = 0.5;
      this.flashT = 0.1;
      this.flashMax = 0.1;
      this.flashColor = THEME.text;
      this.spokeT = 0.50;
      this.spokeMax = 0.50;
      sfx('rare');
      sfx('levelup');
    } else {
      this.spawnShards(cx, cy, 40, THEME.gold);
      this.emit(cx, cy, 34, [THEME.gold, THEME.text], 110);
      this.shakeAmp = 4;
      this.shakeT = 0.32;
      this.flashT = 0.07;
      this.flashMax = 0.07;
      this.flashColor = THEME.text;
      this.spokeT = 0.40;
      this.spokeMax = 0.40;
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

  /**
   * 容れ物が割れて飛ぶ紙片。実機は白い矩形が画面のかなりの面積を占めるので、
   * 点のパーティクルとは別系統で「大きい破片」として持つ（6〜16px）。
   */
  private spawnShards(cx: number, cy: number, n: number, accent: string): void {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + hashF(i * 17 + this.idx) * 0.9;
      // 実機は2フレームで画面幅の3割まで広がる。初速を高くして強く減速させる
      const spd = 260 + hashF(i * 5 + 3) * 430;
      const big = i % 5 === 0;
      const w = big ? 12 + Math.floor(hashF(i * 11) * 7) : 5 + Math.floor(hashF(i * 23) * 7);
      const h = big ? 10 + Math.floor(hashF(i * 31) * 8) : 4 + Math.floor(hashF(i * 41) * 7);
      const roll = hashF(i * 53);
      this.shards.push({
        // 箱の面から生まれる（1点から出ると噴水に見える）
        x: cx + (hashF(i * 83) - 0.5) * 46,
        y: cy + (hashF(i * 97) - 0.5) * 54,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 90,
        w, h,
        life: 0.42 + hashF(i * 61) * 0.42,
        max: 0.84,
        color: roll < 0.70 ? '#f4f2ec' : roll < 0.88 ? '#c9c9d4' : accent,
        flip: 7 + Math.floor(hashF(i * 71) * 9)
      });
    }
    const over = this.shards.length - SHARD_CAP;
    if (over > 0) this.shards.splice(0, over);
  }

  private updateShards(dt: number): void {
    if (this.shards.length === 0) return;
    for (const sh of this.shards) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      // 飛散 → 減速 → 落下
      const drag = Math.min(1, 4.2 * dt);
      sh.vx -= sh.vx * drag;
      sh.vy -= sh.vy * drag;
      sh.vy += 520 * dt;
      sh.life -= dt;
    }
    this.shards = this.shards.filter(sh => sh.life > 0 && sh.y < VH + 40);
  }

  private drawShards(ctx: CanvasRenderingContext2D): void {
    for (const sh of this.shards) {
      // 消え際は点滅で抜く（アルファのフェードはドット絵に合わない）
      if (sh.life < 0.22 && Math.floor(sh.life * 24) % 2 === 0) continue;
      // 回転は禁止なので、縦横を入れ替えて“ひらひら”に見せる
      const flip = Math.floor(sh.life * sh.flip) % 2 === 0;
      const w = flip ? sh.w : sh.h;
      const h = flip ? sh.h : sh.w;
      fillRect(ctx, Math.round(sh.x - w / 2), Math.round(sh.y - h / 2), w, h, sh.color);
    }
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
        // 演出を始める前に獲得を確定させる（以降どの経路を通っても取りこぼさない）
        this.claim();
        this.phase = 'flow';
        this.t = 0;
      }
      return;
    }
    if (this.phase === 'done') {
      if (hitBtn(BACK_BTN, x, y)) {
        sfx('confirm');
        this.claim();
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
    this.claim();
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

    // 1) 地。カットイン中は背景そのものがレアリティ色の流動場に変わる
    const cut = this.phase === 'cut' ? this.cutItem : null;
    if (cut) {
      drawField(ctx, cut.rarity === 'relic' ? 'relic' : 'rare', this.clock, this.fieldSteps());
    } else {
      fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.bg);
    }

    // 2) 一覧。カットイン中は左右へ退場する（実機ではUIパネルが引っ込む）
    this.drawList(ctx);
    if (this.phase === 'done') this.drawSummary(ctx);

    // 3) 箱・破裂・札
    if (cut) this.drawCut(ctx, cut);

    this.fx.drawParticles(ctx);
    this.drawShards(ctx);

    if (this.flashT > 0) {
      // 3段の階段状フラッシュ（グラデーションは使わない）
      const k = this.flashT / this.flashMax;
      const c = k > 0.66 ? this.flashColor : k > 0.33 ? THEME.gold : THEME.goldDark;
      fillRect(ctx, -8, -8, VW + 16, VH + 16, c);
    }

    // 4) HUD。実機でも開封中ずっと残るので、閃光より上に置く
    this.drawHeader(ctx);
    this.drawButtons(ctx);

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

  /**
   * 一覧の退場量（0=定位置、1=画面外）。
   *
   * 実機では、パックを開けると通常のUIパネルが画面外へ引っ込み、
   * パックと背景だけの場面になる。稀少以上はその1個だけの場面にする。
   */
  private exitProgress(): number {
    if (this.phase !== 'cut' || !this.cutItem) return 0;
    const T = this.cutItem.rarity === 'relic' ? RELIC_T : RARE_T;
    if (this.t >= T.present) {
      // 収束と一緒に戻ってくる
      return Math.max(0, 1 - (this.t - T.present) / Math.max(0.01, T.out - T.present));
    }
    return Math.min(1, this.t / 0.20);
  }

  private drawList(ctx: CanvasRenderingContext2D): void {
    const ex = this.exitProgress();
    if (ex >= 1) return;
    // 加速しながら左右交互に掃ける
    const slide = Math.round(ex * ex * (VW + 40));
    for (let i = 0; i < this.items.length; i++) {
      const y = rowY(i);
      const it = this.items[i];
      if (!it) continue;
      const ox = slide === 0 ? 0 : (i % 2 === 0 ? -slide : slide);
      if (ox !== 0) {
        ctx.save();
        ctx.translate(ox, 0);
      }
      if (i >= this.shown) {
        this.drawClosed(ctx, y);
        if (ox !== 0) ctx.restore();
        continue;
      }
      const landing = i === this.shown - 1 && this.landT > 0;
      const k = landing ? this.landT / this.landMax : 0;
      // 右から整数ステップで滑り込む（幅は変えない。欠けて見えないように平行移動）
      const dx = landing ? Math.round(k * 20) : 0;
      if (dx !== 0) ctx.translate(dx, 0);
      drawItemRow(ctx, it, LIST_X, y, LIST_W, ROW_H);
      if (landing) {
        // 着地フラッシュ：レアリティ色の帯を2段で被せる
        const c = RARITY_COLOR[this.landRarity];
        if (k > 0.78) {
          fillRect(ctx, LIST_X, y, LIST_W, ROW_H, c);
        } else if (k > 0.35) {
          strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, c);
          strokeRect1(ctx, LIST_X + 1, y + 1, LIST_W - 2, ROW_H - 2, c);
        }
      }
      if (dx !== 0) ctx.translate(-dx, 0);
      // 遺物は一覧の中でも常に自己主張する
      if (it.rarity === 'relic' && Math.floor(this.clock * 3) % 2 === 0) {
        strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, THEME.gold);
      }
      if (ox !== 0) ctx.restore();
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

  /**
   * 背景フィールドの明るさ段階（1〜3）。
   * 実機の「緑→黄→橙」の色ランプを、重ねる層の数に翻訳したもの。
   * 遺物は溜めの間ずっと最低段階＝ほぼ暗転を保つ（§7.4「画面暗転」）。
   */
  private fieldSteps(): number {
    const it = this.cutItem;
    if (!it) return 1;
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;
    if (this.t >= T.hold) return 3;
    const p = Math.min(1, Math.max(0, (this.t - T.dark) / (T.charge - T.dark)));
    if (relic) return p > 0.80 ? 2 : 1;
    return p > 0.75 ? 3 : p > 0.35 ? 2 : 1;
  }

  private drawCut(ctx: CanvasRenderingContext2D, it: Item): void {
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;
    const t = this.t;
    const cx = VW / 2;
    const cy = 300;

    if (t < T.hold) {
      // --- 溜め。charge を過ぎたら値を固定して「完全に止める」---
      const p = Math.min(1, Math.max(0, (t - T.dark) / (T.charge - T.dark)));
      const moving = t < T.charge;
      if (relic) this.drawChargeRelic(ctx, cx, cy, p, moving);
      else this.drawChargeRare(ctx, cx, cy, p, moving);

      // 封をした小箱。溜めが進むほど激しく鳴り、割れ目が走る
      const amp = p < 0.25 ? 0 : Math.round(1 + p * 3);
      const jitter = amp === 0 ? 0
        : Math.round((hashF(Math.floor(this.clock * (moving ? 30 : 0)) * 7) - 0.5) * 2 * amp);
      drawSealBox(ctx, cx, cy, relic ? THEME.red : THEME.gold,
        p < 0.55 ? 0 : (p - 0.55) / 0.45, jitter);
      this.drawPlaque(ctx, it);
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
    this.drawPlaque(ctx, it);

    // 収束：2フレーム点滅で消える
    if (t > T.present) {
      if (Math.floor((t - T.present) * 30) % 2 === 0) {
        fillRect(ctx, cx - 160, cy - 150, 320, 300, THEME.outline);
      }
    }
  }

  /**
   * 下部の名札。実機は開封中ずっと「パック名／スキップ」が出ている。
   * こちらは「レアリティ／何個目か」を出し、スキップボタンの相方にする。
   */
  private drawPlaque(ctx: CanvasRenderingContext2D, it: Item): void {
    const x = LIST_X;
    const y = SKIP_BTN.y;
    const w = SKIP_BTN.x - LIST_X - 8;
    fillRect(ctx, x, y, w, SKIP_BTN.h, THEME.outline);
    strokeRect1(ctx, x, y, w, SKIP_BTN.h, RARITY_COLOR[it.rarity]);
    drawText(ctx, RARITY_LABEL[it.rarity], x + 8, y + 10, 12, RARITY_COLOR[it.rarity]);
    drawTextRight(ctx, `${this.idx + 1} / ${this.items.length}`, x + w - 8, y + 12, 8, THEME.dim);
  }

  /** 稀少の溜め：中央の帯が整数ステップで開き、指示線が箱へ寄ってくる。 */
  private drawChargeRare(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean
  ): void {
    const bandH = Math.round(p * 88 / 8) * 8;
    fillRect(ctx, 0, cy - bandH / 2, VW, bandH, 'rgba(15,11,20,0.55)');
    fillRect(ctx, 0, cy - bandH / 2, VW, 1, THEME.goldDark);
    fillRect(ctx, 0, cy + bandH / 2 - 1, VW, 1, THEME.goldDark);

    const dist = Math.round((1 - p) * 140) + 34;
    const blink = moving ? Math.floor(this.clock * 16) % 2 === 0 : true;
    for (let i = 0; i < 3; i++) {
      const d = dist + i * 10;
      const c = i === 0 && blink ? THEME.text : THEME.gold;
      fillRect(ctx, cx - d, cy - 3, 6, 6, c);
      fillRect(ctx, cx + d - 6, cy - 3, 6, 6, c);
    }
  }

  /** 遺物の溜め：ほぼ暗転のまま。赤い柱と亀裂だけが育つ。 */
  private drawChargeRelic(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean
  ): void {
    const beat = moving ? (Math.floor(this.clock * 8) % 2 === 0 ? 2 : 0) : 2;
    const h = Math.round(p * 240 / 12) * 12;
    fillRect(ctx, cx - 2 - beat, cy - h / 2, 4 + beat * 2, h, THEME.red);
    fillRect(ctx, cx - 1, cy - h / 2, 2, h, THEME.gold);

    // 四隅から中央へ伸びる亀裂（3×3 の階段。回転ではない）
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

    // 立ち上がり。実機は「紙片が散る → 白紙のカードが立つ → 絵柄が入る」の順で、
    // 中身が入るまでに1テンポある。そこを3段に分けて再現する。
    // 破裂直後は紙片だけ。中身はまだ現れない（実機もここは紙吹雪だけの2〜3フレーム）
    if (since < 0.18) return;
    if (since < 0.34) {
      // 白紙。まだレアリティの色すら分からない
      const k = since < 0.26 ? 0.62 : 1;
      const w = Math.round(cardW * k);
      const h = Math.round(cardH * k);
      const bx = Math.round(cx - w / 2);
      const by = Math.round(300 - h / 2);
      // 紙片も白いので、白紙の輪郭は暗色で締める（実機のカードも縁が暗い）
      fillRect(ctx, bx - 2, by - 2, w + 4, h + 4, THEME.outline);
      fillRect(ctx, bx, by, w, h, THEME.text);
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
      relic ? (loud ? THEME.text : THEME.gold) : (since < 0.5 && loud ? THEME.text : color));
    ctx.restore();

    // --- 札 ---
    fillRect(ctx, cardX, cardY, cardW, cardH, THEME.bg);
    strokeRect1(ctx, cardX, cardY, cardW, cardH, color);
    strokeRect1(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, color);
    strokeRect1(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, THEME.panelLight);

    // アイコン（整数倍スケール）。枠だけ先に出て、1テンポ置いて中身が入る
    const ix = Math.round(cx - iconPx / 2);
    const iy = cardY + 14;
    fillRect(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12, THEME.panel);
    strokeRect1(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12,
      relic && Math.floor(this.clock * 8) % 2 === 0 ? THEME.gold : THEME.outline);
    if (since >= 0.42) {
      if (since < 0.46) {
        // 絵柄が入る瞬間の1フレーム白
        fillRect(ctx, ix, iy, iconPx, iconPx, THEME.text);
      } else {
        drawSprOr(ctx, itemIconName(it), 'icon_W1', ix, iy, iconScale);
      }
    }

    // 名前
    const nameY = iy + iconPx + 12;
    if (since >= 0.50) {
      drawTextCentered(ctx, itemName(it), cx, nameY, 12, relic ? THEME.gold : color);
    }

    let ly = nameY + 22;
    if (u) {
      if (since >= 0.58) drawTextCentered(ctx, `《${u.name}》`, cx, ly, 12, THEME.red);
      ly += 19;
      // ユニーク効果の1行を1文字ずつ出す（§7.4 ユニーク効果のテキスト表示）
      const chars = Math.max(0, Math.floor((since - 0.66) / 0.032));
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
        if (since < 0.58 + i * 0.11) return;
        drawText(ctx, affixLine(a), cardX + 16, ly + i * 17, 12, THEME.text);
        drawTextRight(ctx, tierStars(a.tier), cardX + cardW - 16, ly + i * 17, 12,
          a.tier >= 4 ? THEME.gold : THEME.dim);
      });
      ly += it.affixes.length * 17;
    }

    // 増える売却額。数値が跳ねる瞬間を札の中にも置く
    if (since > 0.56) {
      const pop = since < 0.72 && Math.floor(this.clock * 20) % 2 === 0;
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
