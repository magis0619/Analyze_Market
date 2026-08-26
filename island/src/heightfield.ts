// 指示書 §1「島ではなく湾の形を作る」の実装。
//
// 高さは 4 つのレイヤーの重ね合わせで作る:
//   深海 / 遠浅の水中棚 / 白砂浜 / 緑の丘・岩場
// 単純な放射ノイズだと入り江の抱擁感が出ないので、2 つの headland（岬）を
// 制御点付きのスパインで明示的に置き、その間を遠浅の水域にしている。

import { fbm, ridged, clamp, smoothstep, mix } from './noise';

/** 地形グリッドが覆う範囲（m）。z+ が陸側、z- が沖。 */
export const BOUNDS = { x0: -360, x1: 360, z0: -400, z1: 440 };
/** 頂点間隔（m） */
export const CELL = 2.5;

export const COLS = Math.round((BOUNDS.x1 - BOUNDS.x0) / CELL) + 1;
export const ROWS = Math.round((BOUNDS.z1 - BOUNDS.z0) / CELL) + 1;

/** グリッド外の海底。ここより沖は一様な深海として扱う。 */
export const DEEP = -38;

// --- 島の輪郭 ---------------------------------------------------------------
// 陸は (0,250) を中心にした楕円。x 方向に伸ばして横長の島にする。
const ISLE_CX = 0, ISLE_CZ = 250, ISLE_R = 178, ISLE_SX = 1.34;

// --- 2 つの岬 ---------------------------------------------------------------
// 湾を抱くように、砂浜の左右から沖へ突き出す。左右で長さと高さを変えて
// 対称になりすぎないようにしている。
type Spine = { pts: [number, number][]; peak: number; width: number; seed: number };

const HEADLANDS: Spine[] = [
  { pts: [[-150, 268], [-205, 178], [-236, 78], [-243, -26], [-214, -112]], peak: 33, width: 52, seed: 11 },
  { pts: [[168, 276], [224, 186], [255, 84], [259, -20], [231, -98]], peak: 41, width: 60, seed: 29 }
];

function distToPolyline(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as [number, number];
    const b = pts[i + 1] as [number, number];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const wx = x - a[0], wz = z - a[1];
    const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
    const dx = wx - vx * t, dz = wz - vz * t;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

/** 汀線からの符号付き距離。+ が陸、- が海。 */
export function shoreSigned(x: number, z: number): number {
  const dx = (x - ISLE_CX) / ISLE_SX, dz = z - ISLE_CZ;
  // 汀線そのものを少しだけ蛇行させる（真円の浜は嘘くさい）
  const wob = fbm(x * 0.0045, z * 0.0045, 3) * 16;
  return ISLE_R - Math.sqrt(dx * dx + dz * dz) + wob;
}

/**
 * 高さ（m）。海面は y=0。
 * 4 レイヤーの内訳:
 *   s > 0        白砂浜 →（奥へ）緑の丘
 *   -200 < s < 0 遠浅の水中棚（サンゴ礁のリーフ縁を含む）
 *   s < -200     深海への落ち込み
 */
export function heightAt(x: number, z: number): number {
  const s = shoreSigned(x, z);
  let h: number;

  if (s >= 0) {
    // --- 白砂浜 → 砂丘 → 緑の丘 -------------------------------------------
    // 汀線から 30m ほどは緩い砂浜、その奥で砂丘、さらに奥は低い丘。
    const beach = s * 0.045;
    const berm = 1.35 * smoothstep(24, 78, s);
    const inland = 7.5 * smoothstep(70, 210, s);
    h = beach + berm + inland;
    // 内陸ほど起伏を強くする（浜はなだらかに保つ = 低周波のみ）
    h += fbm(x * 0.0075, z * 0.0075, 4) * 3.2 * smoothstep(30, 130, s);
    h += fbm(x * 0.06, z * 0.06, 2) * 0.10 * smoothstep(0, 20, s);
  } else {
    // --- 遠浅の水中棚 → 深海 -----------------------------------------------
    const d = -s;
    // 岸から離れるほどゆっくり深くなる。exp なので汀線際は極端に浅い。
    // 3段構え。
    //  (1) 汀線の 2m はごく浅く保つ（寄せ波が砂の上を走る余地）
    //  (2) そこから 15m ほどは浜の急な面。参考画像のとおり、砂を離れると
    //      すぐターコイズが濃くなるのはこの段のおかげ
    //  (3) その先は遠浅の棚。湾いっぱいに広がる明るいターコイズはここ
    let depth = 0.22 * (1 - Math.exp(-d / 2.2))
      + 2.50 * (1 - Math.exp(-Math.max(d - 2, 0) / 7))
      + 3.30 * (1 - Math.exp(-Math.max(d - 14, 0) / 75));
    // リーフ縁: 沖 190m 付近がぐっと浅くなり、白波が立つ線になる。
    // 礁縁の位置と高さを岸沿いに揺らして、真円のリングにならないようにする。
    const along = fbm(x * 0.0060, z * 0.0060, 3);
    const reefD = 192 + along * 26;
    const reefH = 4.6 * (0.78 + 0.30 * fbm(x * 0.013 + 40, z * 0.013 - 20, 2));
    depth -= reefH * Math.exp(-(((d - reefD) / 30) ** 2));
    // その外側で一気に落ち込む（水平線際の紺色）
    depth += (DEEP * -1 - 5.9) * smoothstep(206, 310, d);
    // 珊瑚の根・岩の起伏。浅瀬の模様の下地になる
    depth -= fbm(x * 0.021, z * 0.021, 4) * 1.75 * smoothstep(6, 40, d) * smoothstep(300, 130, d);
    depth -= fbm(x * 0.085, z * 0.085, 2) * 0.22 * smoothstep(4, 30, d);
    h = -depth;
  }

  // --- 岬（岩場の高台）--------------------------------------------------------
  for (const hl of HEADLANDS) {
    const d = distToPolyline(x, z, hl.pts);
    const m = Math.exp(-((d / hl.width) ** 2));
    if (m < 0.004) continue;
    // 稜線に沿った起伏 + 岩がちな高周波
    const along = 0.72 + 0.42 * fbm((x + hl.seed * 31) * 0.010, (z + hl.seed * 17) * 0.010, 3);
    const rock = ridged((x + hl.seed) * 0.045, (z - hl.seed) * 0.045, 4);
    const hh = hl.peak * along * (0.62 + 0.55 * rock) * m;
    h = mix(h, Math.max(h, hh), clamp(m * 1.35, 0, 1));
  }

  return h;
}

/**
 * 海底の岩がち度 0..1。浅瀬に透けて見える珊瑚・岩の模様のもと。
 * 汀線のすぐ手前は白砂のままにしたい（参考画像でも岸際は真っ白）ので、
 * 岸から少し離れたところで立ち上げる。
 */
export function rockinessAt(x: number, z: number, h: number): number {
  const s = shoreSigned(x, z);
  if (s > 6) {
    // 陸側: 傾斜と高さで岩肌になる。傾斜は呼び出し側では取れないので高さで代用し、
    // 実際の岩/砂/緑の塗り分けはシェーダ側の法線で仕上げる。
    return clamp(smoothstep(9, 26, h), 0, 1);
  }
  const d = -s;
  const patch = fbm(x * 0.017, z * 0.017, 4) * 0.5 + 0.5;
  const fine = fbm(x * 0.075, z * 0.075, 3) * 0.5 + 0.5;
  let r = smoothstep(0.44, 0.72, patch * 0.78 + fine * 0.22);
  // 岸際の数 m だけ白砂を残し、そこから先は珊瑚の根が斑に出る。
  // この斑が、参考画像の「浅瀬に透けて見える岩の影」そのものになる。
  r *= smoothstep(5, 20, d);
  // 落ち込みの外は暗い深海底
  r = Math.max(r, smoothstep(215, 300, d));
  // 岬の裾は岩
  for (const hl of HEADLANDS) {
    const dd = distToPolyline(x, z, hl.pts);
    r = Math.max(r, smoothstep(hl.width * 1.9, hl.width * 0.9, dd));
  }
  return clamp(r, 0, 1);
}

export type Field = {
  height: Float32Array;
  rock: Float32Array;
  cols: number;
  rows: number;
};

/** グリッド全体を焼く。水シェーダに渡す深度テクスチャの元にもなる。 */
export function bakeField(): Field {
  const height = new Float32Array(COLS * ROWS);
  const rock = new Float32Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) {
    const z = BOUNDS.z0 + j * CELL;
    for (let i = 0; i < COLS; i++) {
      const x = BOUNDS.x0 + i * CELL;
      const h = heightAt(x, z);
      const k = j * COLS + i;
      height[k] = h;
      rock[k] = rockinessAt(x, z, h);
    }
  }
  return { height, rock, cols: COLS, rows: ROWS };
}

/** 焼いたグリッドをバイリニア補間して高さを引く（歩行・配置用） */
export function sampleHeight(field: Field, x: number, z: number): number {
  const fx = (x - BOUNDS.x0) / CELL;
  const fz = (z - BOUNDS.z0) / CELL;
  if (fx < 0 || fz < 0 || fx > field.cols - 1 || fz > field.rows - 1) return DEEP;
  const i = Math.floor(fx), j = Math.floor(fz);
  const i1 = Math.min(i + 1, field.cols - 1), j1 = Math.min(j + 1, field.rows - 1);
  const tx = fx - i, tz = fz - j;
  const h = field.height;
  const a = h[j * field.cols + i] ?? 0, b = h[j * field.cols + i1] ?? 0;
  const c = h[j1 * field.cols + i] ?? 0, d = h[j1 * field.cols + i1] ?? 0;
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

/** 法線（配置時の傾斜判定用） */
export function slopeAt(field: Field, x: number, z: number): number {
  const e = CELL;
  const hx = sampleHeight(field, x + e, z) - sampleHeight(field, x - e, z);
  const hz = sampleHeight(field, x, z + e) - sampleHeight(field, x, z - e);
  return Math.sqrt(hx * hx + hz * hz) / (2 * e);
}
