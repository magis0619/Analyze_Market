import type { GameScreen, Nav } from '../game/app';
import type { Item, Rarity } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawSprOr, fillRect, fillScrim, strokeRect1 } from '../render/draw';
import {
  drawText, drawTextCentered, drawTextRight, lineHeight, textWidth, wrapText
} from '../render/font';
import { COLORS } from '../render/palette';
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
//  3. レアリティが上がるほど、止まる時間・紙片の量・効果音を段階的に強くする。
//     **色では強度差を付けない。** 色は RARITY_COLOR（itemview）だけが決める。
//  4. §9.3 の禁止事項（bloom／ブラー／グラデーション／ドットの回転）は使わない。
//     使うのは 整数矩形・スプライト・パーティクル・画面揺れ・点滅・整数倍スケール のみ。
//  5. 半透明は ctx の rgba を使わず fillScrim（順序ディザ）で打つ。
//     rgba の混色は画面上の色数を増やして §9.3 の32色制限を壊すため。

// ---------------------------------------------------------------- レイアウト

const LIST_X = 8;
const LIST_W = VW - 16;
const LIST_Y = 40;
// 行は縦を使い切る高さにする。開封後の一覧はこのゲームの主役画面なのに、
// 34px×10行では画面の3分の1が空白のまま残っていた。
const ROW_H = 44;
const ROW_GAP = 2;
const SUMMARY_Y = 506;

/** 本文の行送り（フォントは 8 / 12 の2段階のみ。§9.3） */
const LH = lineHeight(12);

/** ユニーク効果とアフィックス枠を隔てる余白（区切り線ぶん） */
const SEP_GAP = 10;

function rowY(i: number): number {
  return LIST_Y + i * (ROW_H + ROW_GAP);
}

const MAIN_BTN: Btn = { x: 80, y: 570, w: 200, h: 44, label: '一括開封', accent: true };
const BACK_BTN: Btn = { x: 80, y: 570, w: 200, h: 44, label: '拠点へ戻る', accent: true };
const SKIP_BTN: Btn = { x: 244, y: 526, w: 100, h: 32, label: 'スキップ' };

// ---------------------------------------------------------------- レアリティ配色
//
// レアリティ → 色は itemview.ts の RARITY_COLOR が唯一の出所。この画面では
// 一切ハードコードしない（稀少＝紫／遺物＝金 の入れ替えが1箇所で効くように）。
// 演出には主色のほかに「暗い相方」と「もっと暗い地」が要るので、
// レアリティではなく **色の値** から引く表で導出する。RARITY_COLOR を
// 差し替えても配色が破綻しない。

const SHADE_OF: Record<string, string> = {
  [THEME.text]: THEME.dim,
  [THEME.dim]: THEME.faint,
  [THEME.gold]: THEME.goldDark,
  [THEME.orange]: THEME.redDark,
  [THEME.red]: THEME.redDark,
  [THEME.green]: THEME.greenDark,
  [THEME.blue]: THEME.blueDark,
  [THEME.purple]: THEME.purpleDark,
  [THEME.teal]: THEME.blueDark
};

/** 主色の暗い相方。 */
function shadeOf(c: string): string {
  return SHADE_OF[c] ?? THEME.panelLight;
}

/**
 * 背景の流動場に使う3層（暗→明）。主色から引く表なので、RARITY_COLOR を
 * 差し替えれば背景の色味もそのまま追随する（稀少が紫なら紫系、遺物が金なら金／橙系）。
 */
const FIELD_LAYERS: Record<string, [string, string, string]> = {
  [THEME.gold]:   [THEME.redDark, THEME.orange, THEME.gold],
  [THEME.orange]: [THEME.redDark, THEME.goldDark, THEME.orange],
  [THEME.red]:    [THEME.outline, THEME.redDark, THEME.red],
  [THEME.purple]: [THEME.panel, THEME.purpleDark, THEME.purple],
  [THEME.blue]:   [THEME.panel, THEME.blueDark, THEME.blue],
  [THEME.green]:  [THEME.panel, THEME.greenDark, THEME.green],
  [THEME.teal]:   [THEME.panel, THEME.blueDark, THEME.teal],
  [THEME.dim]:    [THEME.panel, THEME.faint, THEME.dim]
};

/** 紙片・光条に使う2〜3色。すべてレアリティ帯の中から取る。 */
function burstColors(r: Rarity): [string, string, string] {
  const main = RARITY_COLOR[r];
  return [main, shadeOf(main), THEME.text];
}

// ---------------------------------------------------------------- 演出パラメータ
//
// レアリティごとの「段階」。この表がこの画面の設計そのもの。
//  step   : 一覧に流れる間隔（秒）。並は詰まって流れ、上質で少し溜める
//  land   : 着地時のフラッシュ時間
//  parts  : 着地時に散らす紙片の数（0 は演出なし）

interface FlowTuning {
  step: number;
  land: number;
  parts: number;
}

const FLOW: Record<Rarity, FlowTuning> = {
  common: { step: 0.20, land: 0.10, parts: 0 },
  fine:   { step: 0.30, land: 0.16, parts: 10 },
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
const RELIC_T: CutTiming = { dark: 0.26, charge: 1.05, hold: 1.25, present: 4.25, out: 4.55 };

/** 破裂の中心。箱・札・閃光の芯をここに揃える。 */
const BURST_CY = 300;

/** 破裂で飛ばす紙片の数。強度差は色ではなく「量」で付ける（§9.4）。 */
const BURST_SHARDS: Record<Rarity, number> = {
  common: 0, fine: 10, rare: 120, relic: 160
};

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
// Balatro の実機フレームでは、パックを開ける間ずっと背景そのものが変色し、
// マーブル模様が流れ続ける。これが「特別なことが起きている」の主信号になっている。
//
// こちらはグラデーション禁止（§9.3）なので、
//   ・整数周期の正弦を足し合わせた値を 4×4 Bayer でディザして2値化し、
//   ・濃さの違う3枚のタイル（暗・中・明）に焼き、
//   ・それぞれ別々の速度でスクロールさせて重ねる
// という「描いた模様」に翻訳する。明るさは alpha ではなく
// 「何枚重ねるか」の段階で上げるので、階調オーバーレイにはならない。
//
// 層の色は RARITY_COLOR から導出する。稀少が紫なら紫系、遺物が金なら金／橙系に
// 自動で揃う。

/** タイルの一辺。周期を整数にすることで継ぎ目なく並ぶ。 */
const TILE = 256;

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

interface FieldMotion {
  /** 各層のしきい値（大きいほど面積が小さい） */
  cuts: [number, number, number];
  /** 各層のスクロール速度 px/秒 */
  vel: [[number, number], [number, number], [number, number]];
}

const FIELD_MOTION: Record<'rare' | 'relic', FieldMotion> = {
  // しきい値は高め＝面積は小さめ、速度は遅め。背景が主役になってはいけない。
  rare: {
    cuts: [0.560, 0.660, 0.745],
    vel: [[3, -5], [-7, -11], [9, -17]]
  },
  relic: {
    // 遺物は地の面積をさらに絞る。溜めの間は「ほぼ暗転」を保ちたいため（§7.4）
    cuts: [0.600, 0.690, 0.770],
    vel: [[-2, 4], [6, 9], [-10, 15]]
  }
};

/**
 * 背景全体に敷く減光。塊の見た目そのままに、輝度だけ落とす。
 * 混色を作らないよう rgba ではなく順序ディザで打つ（§9.3）。
 * 紙片と札が主役で、背景はその下、という重み付けをここで決めている。
 */
const FIELD_DIM = 0.36;

/** 暗→明の3層。手前ほど面積が小さい。 */
function fieldColors(r: Rarity): [string, string, string] {
  const main = RARITY_COLOR[r];
  return FIELD_LAYERS[main] ?? [THEME.panel, shadeOf(main), main];
}

const fieldCache = new Map<string, HTMLCanvasElement[]>();

/**
 * 模様のもと。周期はすべて TILE の整数分の1なので継ぎ目なく並ぶ。
 *
 * 以前は長い周期が強すぎて、画面いっぱいの不定形な塊（カビのような模様）に
 * 見えていた。もとの周期を短くして塊を細かく砕き、見た目の重さを紙片より
 * 確実に軽くする。
 */
function fieldNoise(x: number, y: number): number {
  const k = (2 * Math.PI) / TILE;
  // 倍数は互いに素なものを選ぶ。偶数倍ばかりだと格子が揃って
  // 壁紙のような反復模様になる。
  const n =
    Math.sin(k * 3 * x) * 1.15 +
    Math.sin(k * 5 * y + 1.7) +
    Math.sin(k * 7 * (x + y) + 0.4) * 0.8 +
    Math.sin(k * 5 * (x - y) + 2.3) * 0.9 +
    Math.sin(k * 2 * (x + 3 * y) + 1.1) * 0.7 +
    Math.sin(k * 11 * (x - 2 * y) + 0.2) * 0.45 +
    Math.sin(k * 17 * (2 * x + y) + 2.9) * 0.3;
  return (n / 5.3 + 1) / 2;
}

/** 3層のタイルを焼く（1回だけ。以降は使い回す）。 */
function fieldTiles(kind: 'rare' | 'relic', colors: [string, string, string]): HTMLCanvasElement[] {
  const key = `${kind}|${colors.join(',')}`;
  const hit = fieldCache.get(key);
  if (hit) return hit;
  const motion = FIELD_MOTION[kind];
  const out: HTMLCanvasElement[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const cctx = c.getContext('2d');
    if (!cctx) throw new Error('2d context unavailable');
    const img = cctx.createImageData(TILE, TILE);
    const hex = colors[layer] ?? THEME.outline;
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 0xff;
    const g = (v >> 8) & 0xff;
    const b = v & 0xff;
    const cut = motion.cuts[layer] ?? 0.5;
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
  fieldCache.set(key, out);
  return out;
}

/**
 * 背景フィールドを描く。steps は 1〜3（重ねる層の数）＝明るさの段階。
 * 座標は必ず整数に丸める（非整数スケーリング・にじみを出さない）。
 */
function drawField(
  ctx: CanvasRenderingContext2D, rarity: Rarity, t: number, steps: number
): void {
  const kind: 'rare' | 'relic' = rarity === 'relic' ? 'relic' : 'rare';
  // 地は最暗色で一定。模様との明度差をここで確保する（§7.4「画面暗転」）。
  // 以前は稀少だけ THEME.bg を敷いていたが、いちばん面積の広い層と
  // ほぼ同じ明るさで、模様が消えてしまっていた。
  fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.outline);
  const colors = fieldColors(rarity);
  const tiles = fieldTiles(kind, colors);
  const motion = FIELD_MOTION[kind];
  const n = Math.max(0, Math.min(3, steps));
  for (let layer = 0; layer < n; layer++) {
    const tile = tiles[layer];
    const vel = motion.vel[layer];
    if (!tile || !vel) continue;
    const ox = ((Math.round(t * vel[0]) % TILE) + TILE) % TILE;
    const oy = ((Math.round(t * vel[1]) % TILE) + TILE) % TILE;
    for (let y = -TILE + oy; y < VH; y += TILE) {
      for (let x = -TILE + ox; x < VW; x += TILE) {
        ctx.drawImage(tile, x, y);
      }
    }
  }
  // 最後に減光を1枚。ここから上（箱・紙片・札）は減光の外側に描かれるので、
  // 背景だけが確実に一段沈む。
  fillScrim(ctx, -8, -8, VW + 16, VH + 16, THEME.outline, FIELD_DIM);
}

// ---------------------------------------------------------------- 紙片
//
// 破裂は「白い矩形を1枚フラッシュさせる」のではなく、独立して飛ぶ紙片を
// 100枚以上ばら撒くことで作る（Balatro のパック開封と同じ作り方）。
// 各片は 2〜7px の小さな矩形で、速度・重力・寿命・色を個別に持つ。
// 回転は禁止（§9.3）なので、向きは一切変えない。
//
// 配列は起動時に確保して使い回す。毎フレーム new / filter すると 60fps が落ちる
// （§12 の受け入れ条件）。

interface Shard {
  live: boolean;
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number;
  life: number;
  grav: number;
  drag: number;
  color: string;
}

const SHARD_CAP = 200;

function makeShard(): Shard {
  return {
    live: false, x: 0, y: 0, vx: 0, vy: 0, w: 2, h: 2,
    life: 0, grav: 0, drag: 0, color: THEME.text
  };
}

/** 封の箱。ドット絵の小物を矩形だけで組む（スプライト追加はしない）。 */
function drawSealBox(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  accent: string, shade: string, crack: number, jitter: number
): void {
  const S = 2;                       // 整数倍スケール
  const bw = 26;
  const bh = 34;
  const x = Math.round(cx - (bw * S) / 2) + jitter;
  const y = Math.round(cy - (bh * S) / 2);
  const r = (px: number, py: number, pw: number, ph: number, color: string): void => {
    fillRect(ctx, x + px * S, y + py * S, pw * S, ph * S, color);
  };
  r(-1, -1, bw + 2, bh + 2, THEME.outline);      // アウトライン
  r(0, 0, bw, bh, COLORS.woodDark);              // 本体
  r(0, 0, bw, 9, COLORS.woodMid);                // 蓋
  r(0, 9, bw, 1, THEME.outline);                 // 蓋の合わせ目
  r(0, 0, bw, 1, COLORS.wood);                   // 上面のハイライト
  r(1, 1, 1, 7, COLORS.wood);
  r(bw / 2 - 2, 0, 4, bh, accent);               // 縦の帯
  r(0, bh / 2 - 2, bw, 4, accent);               // 横の帯
  r(bw / 2 - 4, bh / 2 - 4, 8, 8, shade);        // 封蝋
  r(bw / 2 - 3, bh / 2 - 3, 2, 2, accent);
  // 割れ目。溜めの終盤に3本まで走る
  const cracks: Array<[number, number, number, number]> = [
    [6, 3, 1, 8], [bw - 8, 12, 1, 9], [10, bh - 10, 7, 1]
  ];
  for (let i = 0; i < cracks.length; i++) {
    if (crack <= i / cracks.length) continue;
    const c = cracks[i];
    if (c) r(c[0], c[1], c[2], c[3], THEME.text);
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

  // 着地・揺れ・閃光
  private landT = 0;
  private landMax = 0.1;
  private landRarity: Rarity = 'common';
  private shakeT = 0;
  private shakeAmp = 0;
  private flashT = 0;
  private flashMax = 0.1;
  private flashRarity: Rarity = 'rare';
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
  /** ユニーク効果の折り返し済み行（font.ts の wrapText が行頭禁則ごと決める） */
  private cutLines: string[] = [];
  private cutW = 288;

  /** 破裂した容れ物の紙片。プールを使い回す（毎フレーム確保しない） */
  private readonly shards: Shard[] = [];
  private shardSeed = 0;

  // スキップ
  private fastFlow = false;
  private tapTimes: number[] = [];

  // 一覧から開く詳細
  private detail: Item | null = null;

  /** 獲得の確定（openAll）を済ませたか。演出の経路に関わらず必ず一度だけ呼ぶ */
  private claimed = false;

  /** 一覧の ▲▼ を出すための「今の装備」。1回だけ引いて使い回す */
  private baseline: { weapon: Item | null; armor: Item | null } | null = null;

  constructor(nav: Nav, items: Item[]) {
    this.nav = nav;
    this.items = items;
    for (let i = 0; i < SHARD_CAP; i++) this.shards.push(makeShard());
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
      this.spawnShards(VW / 2, rowY(this.idx) + ROW_H / 2, tune.parts, it.rarity, 90);
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
    this.cutW = it.rarity === 'relic' ? 304 : 288;
    // 折り返しは font.ts に一任する（行頭禁則つき）。ここで自前に切らない。
    const u = it.rarity === 'relic' && it.unique ? uniqueDef(it.unique) : null;
    this.cutLines = u ? wrapText(u.text, this.cutW - 32, 12) : [];
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
      const beats = 3;
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
      this.cutLines = [];
      this.phase = 'flow';
      this.t = 0;
    }
  }

  /**
   * 箱が割れる瞬間。
   *
   * ここで白い矩形をフラッシュさせてはいけない（それでは「割れた」に見えない）。
   * 100枚以上の紙片が四方に飛び、そのあとで中身が立ち上がる、という順にする。
   * 稀少と遺物の差は **色ではなく量と長さと音** で付ける（配色は RARITY_COLOR）。
   */
  private burst(it: Item): void {
    const relic = it.rarity === 'relic';
    const cx = VW / 2;
    const cy = BURST_CY;
    // 前作資産の「0.8秒ホールド＋パーティクル」を土台に使い、上に盛る（§1.1）。
    // ホールドは上の時刻表（charge → hold）が担い、パーティクルはこの紙片に置き換える。
    // 共有 Effects の粒は色が固定で、レアリティ帯の外に出てしまうため使わない。
    this.spawnShards(cx, cy, BURST_SHARDS[it.rarity], it.rarity, relic ? 780 : 640);
    this.flashRarity = it.rarity;
    if (relic) {
      this.shakeAmp = 6;
      this.shakeT = 0.5;
      this.flashT = 0.07;
      this.flashMax = 0.07;
      this.spokeT = 0.50;
      this.spokeMax = 0.50;
      sfx('rare');
      sfx('levelup');
    } else {
      this.shakeAmp = 4;
      this.shakeT = 0.32;
      this.flashT = 0.05;
      this.flashMax = 0.05;
      this.spokeT = 0.40;
      this.spokeMax = 0.40;
      sfx('rare');
    }
  }

  /**
   * 紙片を n 枚出す。プールの空き枠を埋めるだけで、配列は伸ばさない。
   * 各片は 2〜7px の矩形で、速度・重力・寿命・色を個別に持つ。
   */
  private spawnShards(cx: number, cy: number, n: number, rarity: Rarity, speed: number): void {
    if (n <= 0) return;
    const colors = burstColors(rarity);
    let made = 0;
    for (let slot = 0; slot < SHARD_CAP && made < n; slot++) {
      const sh = this.shards[slot];
      if (!sh || sh.live) continue;
      const k = this.shardSeed++;
      // 角度は等分＋揺らぎ。1点から出ると噴水に見えるので箱の面から生む
      const ang = (made / n) * Math.PI * 2 + (hashF(k * 7 + 1) - 0.5) * 0.8;
      const spd = speed * (0.35 + hashF(k * 13 + 5) * 1.60);
      const pick = hashF(k * 17 + 9);
      // 白を厚めに混ぜる。流動場の上でも紙片が沈まないようにするため。
      const color = pick < 0.38 ? colors[0] : pick < 0.60 ? colors[1] : colors[2];
      sh.live = true;
      sh.x = cx + (hashF(k * 23 + 3) - 0.5) * 52;
      sh.y = cy + (hashF(k * 29 + 11) - 0.5) * 60;
      sh.vx = Math.cos(ang) * spd;
      sh.vy = Math.sin(ang) * spd - 150 * hashF(k * 31 + 7);
      sh.w = 2 + Math.floor(hashF(k * 37 + 13) * 6);
      sh.h = 2 + Math.floor(hashF(k * 41 + 17) * 6);
      sh.life = 0.70 + hashF(k * 43 + 19) * 0.80;
      sh.grav = 240 + hashF(k * 47 + 23) * 520;
      sh.drag = 0.9 + hashF(k * 53 + 29) * 1.9;
      sh.color = color;
      made++;
    }
  }

  private updateShards(dt: number): void {
    for (const sh of this.shards) {
      if (!sh.live) continue;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      // 飛散 → 減速 → 落下
      const d = Math.min(1, sh.drag * dt);
      sh.vx -= sh.vx * d;
      sh.vy -= sh.vy * d;
      sh.vy += sh.grav * dt;
      sh.life -= dt;
      // 寿命切れ・画面外で消える
      if (sh.life <= 0 || sh.y > VH + 24 || sh.x < -24 || sh.x > VW + 24) sh.live = false;
    }
  }

  private drawShards(ctx: CanvasRenderingContext2D): void {
    for (const sh of this.shards) {
      if (!sh.live) continue;
      // 消え際は点滅で抜く（アルファのフェードはドット絵に合わない）
      if (sh.life < 0.22 && Math.floor(sh.life * 24) % 2 === 0) continue;
      ctx.fillStyle = sh.color;
      ctx.fillRect(Math.round(sh.x), Math.round(sh.y), sh.w, sh.h);
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
    this.cutLines = [];
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
      drawField(ctx, cut.rarity, this.clock, this.fieldSteps());
    } else {
      fillRect(ctx, -8, -8, VW + 16, VH + 16, THEME.bg);
    }

    // 2) 一覧。カットイン中は **一切描かない**。
    //    暗幕を重ねて誤魔化すと背後の行が透けてレイヤーが崩壊する。
    //    箱が割れてアイテムが確定するまで、この画面には箱と紙片と札しか無い。
    if (!cut) {
      this.drawList(ctx);
      if (this.phase === 'done') this.drawSummary(ctx);
    }

    // 3) 箱・破裂・札
    if (cut) this.drawCut(ctx, cut);

    if (this.flashT > 0) this.drawFlash(ctx);

    // 閃光の上を紙片が飛ぶ。順序を逆にすると、一番見せたい数フレームが
    // 単色の矩形で塗り潰されてしまう。
    this.drawShards(ctx);

    // 4) HUD。実機でも開封中ずっと残るので、閃光より上に置く
    this.drawHeader(ctx);
    this.drawButtons(ctx);

    if (this.detail) {
      // rgba の混色はパレット外の色を作るので、順序ディザの暗幕を使う（§9.3）
      fillScrim(ctx, -8, -8, VW + 16, VH + 16, THEME.outline, 0.82);
      // 高さは共有部品側の都合で変わるので、閉じる案内は固定位置に置く
      drawItemDetail(ctx, this.detail, 20, 190, VW - 40);
      drawTextCentered(ctx, 'タップで閉じる', VW / 2, 470, 8, THEME.dim);
    }
    ctx.restore();
  }

  /**
   * 解放の閃光。
   *
   * 全面を単色で塗ると、この演出で一番見せたい2フレームが「ただの矩形」に
   * なってしまう（白を紫に変えただけ、と同じ）。そこで、
   *   ・塗りは fillScrim の順序ディザだけにして、どの画素にも背景を残す
   *   ・中心から外へ濃さを落とす同心の階段にして、のっぺりした面を作らない
   * の2点で「単色で画面が埋まる瞬間」を無くす。ベタ塗りは1pxも使わない。
   */
  private drawFlash(ctx: CanvasRenderingContext2D): void {
    const k = this.flashT / this.flashMax;          // 1 → 0
    const main = RARITY_COLOR[this.flashRarity];
    const c = k > 0.5 ? main : shadeOf(main);
    const cx = VW / 2;
    const rings = 8;
    // 外側（薄い）から内側（濃い）へ。Bayer のしきい値は入れ子なので、
    // 重ねても濃さは単調に増えるだけで混色は起きない。
    for (let i = rings - 1; i >= 0; i--) {
      const r = 40 + i * 56;
      const d = 0.78 * k * (1 - i / rings);
      fillScrim(ctx, cx - r, BURST_CY - r, r * 2, r * 2, c, d);
    }
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

  /** 画面に出す進捗。ヘッダと名札の唯一の出所。 */
  private progress(): number {
    if (this.phase === 'intro') return 0;
    if (this.phase === 'done') return this.items.length;
    return Math.min(this.items.length, this.idx + 1);
  }

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    // カットイン中は背景が明るく流れるので、HUD の下だけ地を敷いて読めるようにする
    if (this.phase === 'cut') fillRect(ctx, -8, -8, VW + 16, 39, THEME.outline);
    drawText(ctx, '開封', LIST_X, 10, 12, THEME.gold);
    const total = this.items.length;
    // 「今めくっているのが何個目か」。名札（drawPlaque）と必ず同じ値を出す。
    // shown（着地済みの数）を出すと、カットインの間だけ名札と1ズレる。
    drawText(ctx, `${this.progress()} / ${total}`, LIST_X + 44, 12, 8, THEME.dim);

    // 収穫額。着地のたびに跳ねる（色の点滅＋2px の浮き）
    const pop = this.goldPop > 0;
    const gy = 10 - (pop && Math.floor(this.clock * 20) % 2 === 0 ? 2 : 0);
    const col = pop ? THEME.text : THEME.goldDark;
    drawTextRight(ctx, `${Math.round(this.goldShown)}G`, VW - LIST_X, gy, 12, col);
    fillRect(ctx, LIST_X, 30, LIST_W, 1, THEME.panelLight);
  }

  /**
   * その行を比べる相手＝今いちばん強い装備（スロット別）。
   *
   * 並のアイテムは数字が近く、そのままでは「何も起きなかった10行」に見える。
   * 装備中との差を ▲▼ で出せば、10個のうちどれを見るべきかが1行で分かる。
   */
  private baselineFor(it: Item): Item | null {
    if (!this.baseline) {
      const st = this.nav.state;
      const rank = (i: Item): number =>
        i.slot === 'weapon' ? Math.round(i.power * i.speed) : i.power;
      const best = (weapon: boolean): Item | null => {
        let out: Item | null = null;
        for (const eq of Object.values(st.data.equipped)) {
          const cand = st.itemById(weapon ? eq.weapon : eq.armor);
          if (!cand) continue;
          if (!out || rank(cand) > rank(out)) out = cand;
        }
        return out;
      };
      this.baseline = { weapon: best(true), armor: best(false) };
    }
    const b = it.slot === 'weapon' ? this.baseline.weapon : this.baseline.armor;
    return b && b.id !== it.id ? b : null;
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
      // 右から整数ステップで滑り込む（幅は変えない。欠けて見えないように平行移動）
      const dx = landing ? Math.round(k * 20) : 0;
      if (dx !== 0) ctx.translate(dx, 0);
      drawItemRow(ctx, it, LIST_X, y, LIST_W, ROW_H, { compareTo: this.baselineFor(it) });
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
      // 稀少以上は一覧の中でも自己主張する。並の行と同じ重さで並べない。
      // 内側に枠を重ねると2段目の文字を削るので、左端の旗で厚みを出す。
      if (it.rarity === 'rare' || it.rarity === 'relic') {
        const rc = RARITY_COLOR[it.rarity];
        strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, rc);
        const blink = it.rarity === 'relic' && Math.floor(this.clock * 3) % 2 === 0;
        fillRect(ctx, LIST_X, y, 3, ROW_H, blink ? THEME.text : rc);
      }
    }
  }

  private drawClosed(ctx: CanvasRenderingContext2D, y: number): void {
    fillRect(ctx, LIST_X, y, LIST_W, ROW_H, THEME.panel);
    strokeRect1(ctx, LIST_X, y, LIST_W, ROW_H, THEME.outline);
    drawSprOr(ctx, 'ev_chest', 'icon_T1', LIST_X + 5, y + Math.floor((ROW_H - 16) / 2));
    drawText(ctx, '未鑑定', LIST_X + 25, y + Math.floor((ROW_H - 12) / 2), 8, THEME.dim);
    drawTextRight(ctx, '？', VW - LIST_X - 6, y + Math.floor((ROW_H - 16) / 2), 12, THEME.panelLight);
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
    drawText(ctx, `稀少 ${rare}`, LIST_X, y, 12, rare > 0 ? RARITY_COLOR.rare : THEME.dim);
    drawText(ctx, `遺物 ${relic}`, LIST_X + 80, y, 12, relic > 0 ? RARITY_COLOR.relic : THEME.dim);
    drawTextRight(ctx, `売却 ${this.goldTarget}G`, VW - LIST_X, y, 12, THEME.goldDark);
    drawText(ctx, 'タップで詳細', LIST_X, y + 26, 8, THEME.dim);
  }

  private drawButtons(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'intro') {
      drawTextCentered(ctx, `${this.items.length}個の未鑑定品を持ち帰った`, VW / 2, 516, 8, THEME.dim);
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
   * 実機の色ランプを、重ねる層の数に翻訳したもの。
   * 遺物は溜めの間ずっと最低段階＝ほぼ暗転を保つ（§7.4「画面暗転」）。
   */
  private fieldSteps(): number {
    const it = this.cutItem;
    if (!it) return 1;
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;
    if (this.t >= T.hold) {
      // 破裂の直後だけ地を落とす。紙片が飛んでいる間は背景を最も暗くして、
      // 100枚以上の紙片そのものが主役になるようにする。
      const since = this.t - T.hold;
      return since < 0.28 ? 1 : since < 0.50 ? 2 : 3;
    }
    const p = Math.min(1, Math.max(0, (this.t - T.dark) / (T.charge - T.dark)));
    if (relic) return p > 0.80 ? 2 : 1;
    return p > 0.75 ? 3 : p > 0.35 ? 2 : 1;
  }

  private drawCut(ctx: CanvasRenderingContext2D, it: Item): void {
    const relic = it.rarity === 'relic';
    const T = relic ? RELIC_T : RARE_T;
    const t = this.t;
    const cx = VW / 2;
    const cy = BURST_CY;
    const color = RARITY_COLOR[it.rarity];
    const shade = shadeOf(color);

    if (t < T.hold) {
      // --- 溜め。charge を過ぎたら値を固定して「完全に止める」---
      const p = Math.min(1, Math.max(0, (t - T.dark) / (T.charge - T.dark)));
      const moving = t < T.charge;
      if (relic) this.drawChargeRelic(ctx, cx, cy, p, moving, color, shade);
      else this.drawChargeRare(ctx, cx, cy, p, moving, color, shade);

      // 封をした小箱。溜めが進むほど激しく鳴り、割れ目が走る
      const amp = p < 0.25 ? 0 : Math.round(1 + p * 3);
      const jitter = amp === 0 ? 0
        : Math.round((hashF(Math.floor(this.clock * (moving ? 30 : 0)) * 7) - 0.5) * 2 * amp);
      drawSealBox(ctx, cx, cy, color, shade, p < 0.55 ? 0 : (p - 0.55) / 0.45, jitter);
      this.drawPlaque(ctx, it);
      return;
    }

    // --- 解放後 ---
    if (this.spokeT > 0) {
      const k = 1 - this.spokeT / this.spokeMax;
      const outer = Math.round(60 + k * 320);
      const inner = Math.max(0, outer - (relic ? 90 : 70));
      drawSpokes(ctx, cx, cy, relic ? 16 : 12, inner, outer, color, shade);
    }
    if (relic) drawMarchingBorder(ctx, this.clock, color, THEME.text);

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
    drawTextRight(ctx, `${this.progress()} / ${this.items.length}`, x + w - 8, y + 12, 8, THEME.dim);
  }

  /** 稀少の溜め：中央の帯が整数ステップで開き、指示線が箱へ寄ってくる。 */
  private drawChargeRare(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean,
    color: string, shade: string
  ): void {
    const bandH = Math.round(p * 88 / 8) * 8;
    fillScrim(ctx, 0, cy - bandH / 2, VW, bandH, THEME.outline, 0.55);
    fillRect(ctx, 0, cy - bandH / 2, VW, 1, shade);
    fillRect(ctx, 0, cy + bandH / 2 - 1, VW, 1, shade);

    const dist = Math.round((1 - p) * 140) + 34;
    const blink = moving ? Math.floor(this.clock * 16) % 2 === 0 : true;
    for (let i = 0; i < 3; i++) {
      const d = dist + i * 10;
      const c = i === 0 && blink ? THEME.text : color;
      fillRect(ctx, cx - d, cy - 3, 6, 6, c);
      fillRect(ctx, cx + d - 6, cy - 3, 6, 6, c);
    }
  }

  /** 遺物の溜め：ほぼ暗転のまま。柱と亀裂だけが育つ。 */
  private drawChargeRelic(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, moving: boolean,
    color: string, shade: string
  ): void {
    const beat = moving ? (Math.floor(this.clock * 8) % 2 === 0 ? 2 : 0) : 2;
    const h = Math.round(p * 240 / 12) * 12;
    fillRect(ctx, cx - 2 - beat, cy - h / 2, 4 + beat * 2, h, shade);
    fillRect(ctx, cx - 1, cy - h / 2, 2, h, color);

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
          i % 3 === 0 ? color : shade);
      }
    }

    const scan = Math.round((1 - p) * 200);
    fillRect(ctx, 0, cy - scan, VW, 1, shade);
    fillRect(ctx, 0, cy + scan, VW, 1, shade);
  }

  /**
   * 提示。稀少＝札とアフィックス、遺物＝暗転の中にユニーク効果の1行。
   * 札は暗い地に太いレアリティ枠。黒背景の中で「一枚だけ照らされている」ようにする。
   *
   * 破裂直後は札を出さない。紙片だけが飛んでいる間（0.20秒）を必ず空ける。
   * ここに白い矩形を1枚出すと、それが「バースト」に見えてしまい紙片が死ぬ。
   */
  private drawCard(
    ctx: CanvasRenderingContext2D, it: Item, since: number, relic: boolean
  ): void {
    if (since < 0.20) return;

    const cx = VW / 2;
    const color = RARITY_COLOR[it.rarity];
    const shade = shadeOf(color);
    const cardW = this.cutW;

    // 中身の行数から高さを先に決める（打鍵中に札が伸び縮みしないように）。
    // 遺物も「ユニーク行 ＋ アフィックス枠」の両方を出す。§5.7 は遺物を
    // 「固定2枠＋ランダム1枠、かつユニーク」と定義しており、最も強い演出で
    // その枠が一度も見えないのは逆転（稀少の札のほうが情報が多くなる）。
    const u = relic && it.unique ? uniqueDef(it.unique) : null;
    const bodyRows = (u ? 1 + this.cutLines.length : 0) + it.affixes.length;
    const iconScale = relic ? 4 : 3;
    const iconPx = 16 * iconScale;
    // ユニーク行とアフィックス枠の間には区切り線ぶんの余白を足す。
    // 行送り（16px の字に 3px）の中に線を割り込ませると字を横切ってしまう。
    const cardH = 14 + iconPx + 12 + 18 + bodyRows * LH + 34 + (u ? SEP_GAP : 0);
    const cardY = BURST_CY - Math.floor(cardH / 2);
    const cardX = Math.round(cx - cardW / 2);

    // --- 見出し帯 ---
    const bandY = cardY - 46;
    const loud = Math.floor(this.clock * 12) % 2 === 0;
    if (relic) {
      // 遺物だけ帯を塗り潰す。稀少（黒地＋枠線）と一目で別物にする。
      // 差は「塗るか塗らないか」であって、色相ではない。
      fillRect(ctx, 0, bandY, VW, 38, shade);
      fillRect(ctx, 0, bandY, VW, 2, color);
      fillRect(ctx, 0, bandY + 36, VW, 2, color);
    } else {
      fillRect(ctx, 0, bandY, VW, 38, THEME.outline);
      fillRect(ctx, 0, bandY, VW, 2, color);
      fillRect(ctx, 0, bandY + 36, VW, 2, color);
    }
    ctx.save();
    ctx.translate(cx, bandY + 7);
    ctx.scale(2, 2);
    drawTextCentered(ctx, RARITY_LABEL[it.rarity], 0, 0, 12,
      relic ? (loud ? THEME.text : color) : (since < 0.5 && loud ? THEME.text : color));
    ctx.restore();

    // --- 札 ---
    //
    // 地は必ず不透明なベタで塗る。ディザで背景を透かすと、粒が札の中まで
    // 続いて「枠線だけの窓」になり、いちばん読ませたい名前・アフィックス・★が
    // 模様の上に乗ってしまう。背景がどんな模様でも輪郭が立つよう、
    //   外に1pxの暗色 → レアリティ枠2px → 内に1pxの暗色 → ベタ地
    // の順に重ねる。
    fillRect(ctx, cardX - 1, cardY - 1, cardW + 2, cardH + 2, THEME.outline);
    strokeRect1(ctx, cardX, cardY, cardW, cardH, color);
    strokeRect1(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, color);
    strokeRect1(ctx, cardX + 2, cardY + 2, cardW - 4, cardH - 4, THEME.outline);
    fillRect(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, THEME.panel);

    // アイコン（整数倍スケール）。枠だけ先に出て、1テンポ置いて中身が入る。
    // 台座は地より暗くして、はめ込まれているように見せる
    const ix = Math.round(cx - iconPx / 2);
    const iy = cardY + 14;
    fillRect(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12, THEME.outline);
    strokeRect1(ctx, ix - 6, iy - 6, iconPx + 12, iconPx + 12,
      relic && Math.floor(this.clock * 8) % 2 === 0 ? color : THEME.outline);
    if (since >= 0.36) {
      drawSprOr(ctx, itemIconName(it), 'icon_W1', ix, iy, iconScale);
    }

    // 名前
    const nameY = iy + iconPx + 12;
    if (since >= 0.46) {
      drawTextCentered(ctx, itemName(it), cx, nameY, 12, color);
    }

    let ly = nameY + 22;
    // アフィックスを出し始める時刻。遺物はユニーク行を打ち終えてから続ける。
    let affixFrom = 0.54;
    if (u) {
      if (since >= 0.54) drawTextCentered(ctx, `《${u.name}》`, cx, ly, 12, color);
      ly += LH;
      // ユニーク効果を1文字ずつ出す（§7.4 ユニーク効果のテキスト表示）。
      // 折り返しは startCut で font.ts の wrapText が確定させてある。
      // 打鍵中に途中の文字列を折り返し直すと、行頭禁則が毎フレーム崩れる。
      const total = u.text.length;
      const chars = Math.max(0, Math.min(total, Math.floor((since - 0.62) / 0.030)));
      if (chars > this.typed) {
        if (chars % 4 === 0) sfx('tap');
        this.typed = chars;
      }
      let rest = chars;
      let lastRow = 0;
      let lastText = '';
      for (let i = 0; i < this.cutLines.length; i++) {
        const ln = this.cutLines[i];
        if (ln === undefined || rest <= 0) break;
        const shownText = rest >= ln.length ? ln : ln.slice(0, rest);
        drawTextCentered(ctx, shownText, cx, ly + i * LH, 12, THEME.text);
        lastRow = i;
        lastText = shownText;
        rest -= ln.length;
      }
      if (chars < total && Math.floor(this.clock * 16) % 2 === 0) {
        fillRect(ctx, cx + Math.floor(textWidth(lastText, 12) / 2) + 2,
          ly + lastRow * LH + 1, 6, 12, color);
      }
      ly += Math.max(1, this.cutLines.length) * LH;
      affixFrom = 0.62 + total * 0.030 + 0.12;
      // ユニーク行とアフィックス枠の境目
      if (since >= affixFrom) fillRect(ctx, cardX + 16, ly + 4, cardW - 32, 1, THEME.panelLight);
      ly += SEP_GAP;
    }
    // アフィックスを1行ずつ、間を置いて出す（稀少も遺物も同じ枠を見せる）
    it.affixes.forEach((a, i) => {
      if (since < affixFrom + i * 0.11) return;
      drawText(ctx, affixLine(a), cardX + 16, ly + i * LH, 12, THEME.text);
      drawTextRight(ctx, tierStars(a.tier), cardX + cardW - 16, ly + i * LH, 12,
        a.tier >= 4 ? color : THEME.dim);
    });
    ly += it.affixes.length * LH;

    // 増える売却額。数値が跳ねる瞬間を札の中にも置く
    if (since > 0.52) {
      const pop = since < 0.70 && Math.floor(this.clock * 20) % 2 === 0;
      drawTextRight(ctx, `+${sellValue(it)}G`, cardX + cardW - 16, cardY + cardH - 28, 12,
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
    fillRect(ctx, px - 1, py - 1, 3, 3, THEME.text);
  }
}
