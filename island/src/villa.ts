// 指示書 §6。別荘は「到着/別れの演出」を彩度の変化という抽象処理だけでなく、
// この家から出発しこの家に戻るという具体的な動線として実体化する場所であり、
// 拾った貝殻・流木を飾る場所でもある。
//
// 地中海〜南欧リゾート風の洋館、2階建て。白い漆喰壁・テラコッタ瓦・
// フレンチドア・木製の鎧戸。砂浜からやや高台寄り、湾を見渡せる場所に置く。
//
// 各階はシンプルな箱の組み合わせで作る（指示書の実装方針どおり）。
// 螺旋階段の物理的な段差判定は最低限に留め、階段の足元だけをスロープとして
// 扱う（VillaFloorTracker）。

import * as THREE from 'three';
import { Builder, hex, shade, type V3 } from './meshbuild';
import { makeRng } from './noise';
import type { HeightFn } from './structures';
import { COMMON } from './glsl/lib';
import type { Env } from './env';

/** 敷地。湾を見渡せる高台。REST（東屋・焚き火）から見える距離感。 */
export const VILLA = { x: -8, z: 176 };

// --- 寸法（すべて VILLA.x / VILLA.z からのローカルオフセット） -------------
const W = 11.0, D = 8.0;              // 1F の外形（x幅・z奥行き）
const HALF_W = W / 2, HALF_D = D / 2; // 5.5 / 4.0
const WALL_T = 0.20;                  // 壁の厚み
const FOUND_H = 0.85;                 // 基礎（傾斜地の高さ合わせを兼ねる）
const WALL1_H = 3.0;                  // 1F 壁高
const SLAB_T = 0.28;                  // 2F 床（1F 天井）の厚み
const WALL2_H = 2.65;                 // 2F 壁高
const DOOR_W = 3.0;                   // フレンチドアの開口幅
const VERANDA_D = 3.6;                // ベランダの奥行き（南＝浜側へ張り出す）

/** 階段の踊り場（2F 床に開ける吹き抜けの矩形）。北東の隅。 */
const STAIR = { x0: 2.6, x1: HALF_W, z0: 0.6, z1: HALF_D };

export type VillaLayout = {
  groundY: number;   // 敷地の生の地面高さ（基礎の起点）
  floor1Y: number;   // 1F 床
  floor2Y: number;   // 2F 床（= 1F 天井の上面）
  roofBaseY: number; // 2F 壁の上端（軒の高さ）
};

export function computeLayout(h: HeightFn): VillaLayout {
  // 敷地の四隅のうち最も高い点に合わせる。傾斜のぶんは基礎の袴で吸収する
  const corners: [number, number][] = [
    [VILLA.x - HALF_W, VILLA.z - HALF_D], [VILLA.x + HALF_W, VILLA.z - HALF_D],
    [VILLA.x + HALF_W, VILLA.z + HALF_D], [VILLA.x - HALF_W, VILLA.z + HALF_D]
  ];
  const groundY = Math.max(...corners.map(([x, z]) => h(x, z)));
  const floor1Y = groundY + FOUND_H;
  const floor2Y = floor1Y + WALL1_H + SLAB_T;
  const roofBaseY = floor2Y + WALL2_H;
  return { groundY, floor1Y, floor2Y, roofBaseY };
}

/**
 * 1F・2F は同じ footprint を積み重ねているだけなので、(x,z) だけでは
 * どちらの階にいるか決まらない（垂直方向の情報がまさに知りたいことなので）。
 * 階段の踊り場を通ったときだけ高さを切り替え、それ以外は「いまどちらの階に
 * いたか」を覚えておくことで、上って→歩いて→また階段、という動きを
 * 素直に扱えるようにしている。
 */
export class VillaFloorTracker {
  private onUpstairs: boolean;

  constructor(startUpstairs = false) {
    this.onUpstairs = startUpstairs;
  }

  /** footprint の外なら null。呼び出し側は地形の高さにフォールバックする。 */
  groundY = (layout: VillaLayout, x: number, z: number): number | null => {
    const lx = x - VILLA.x, lz = z - VILLA.z;
    const inFootprint = lx > -HALF_W && lx < HALF_W && lz > -HALF_D && lz < HALF_D;
    if (!inFootprint) {
      // 建物を出たら、次に入るときは必ず1Fから（ベランダ経由で出入りするため）
      this.onUpstairs = false;
      return null;
    }

    const inStairwell = lx > STAIR.x0 && lx < STAIR.x1 && lz > STAIR.z0 && lz < STAIR.z1;
    if (inStairwell) {
      // 螺旋の実際の巻きは追わず、踊り場の中を対角に上る単純なスロープにする
      // （指示書の「物理的な段差判定は最低限に留める」）。
      const t = ((lx - STAIR.x0) / (STAIR.x1 - STAIR.x0) + (lz - STAIR.z0) / (STAIR.z1 - STAIR.z0)) / 2;
      const tc = Math.min(1, Math.max(0, t));
      this.onUpstairs = tc > 0.5;
      return layout.floor1Y + (layout.floor2Y - layout.floor1Y) * tc;
    }
    return this.onUpstairs ? layout.floor2Y : layout.floor1Y;
  };

  get upstairs(): boolean { return this.onUpstairs; }
}

/**
 * 到着/別れの動線（指示書 §6）。寝室にいるあいだは仄暗く、階段を降りるほど
 * 満ちていき、フレンチドアを抜けて庭を離れるほどさらに満ちる。逆順で戻る。
 * env.arrive を直接動かすのではなく「目標値」だけを返す。実際の変化は
 * env.ts の ease（6.5秒で満ち／2.8秒で引く）にそのまま乗せる。
 */
export function arrivalDepth(floor: VillaFloorTracker, x: number, z: number): number {
  const lx = x - VILLA.x, lz = z - VILLA.z;
  const inFootprint = lx > -HALF_W && lx < HALF_W && lz > -HALF_D && lz < HALF_D;
  if (inFootprint) {
    const inStairwell = lx > STAIR.x0 && lx < STAIR.x1 && lz > STAIR.z0 && lz < STAIR.z1;
    if (inStairwell) {
      const t = ((lx - STAIR.x0) / (STAIR.x1 - STAIR.x0) + (lz - STAIR.z0) / (STAIR.z1 - STAIR.z0)) / 2;
      const tc = Math.min(1, Math.max(0, t));
      return 0.05 + (0.45 - 0.05) * tc;
    }
    return floor.upstairs ? 0.05 : 0.45;
  }
  // 屋外。フレンチドアの敷居からの距離で、庭・プールを抜けるほど満ちていく
  const doorZ = VILLA.z - HALF_D;
  const dist = Math.hypot(x - VILLA.x, z - doorZ);
  const GARDEN_SPAN = 18; // ベランダ〜庭〜浜の手前までの距離目安
  const t = Math.min(1, Math.max(0, dist / GARDEN_SPAN));
  return 0.45 + (1 - 0.45) * t;
}

const C = {
  wall: hex(0xf3ece0),
  wallShade: hex(0xe6dcc8),
  found: hex(0xd8cdb4),
  roof: hex(0xb5583a),
  roofDark: hex(0x8f4530),
  shutter: hex(0x6fa8a0),
  shutterDark: hex(0x4f7f78),
  wood: hex(0x8a6f4c),
  woodDark: hex(0x6d573a),
  glass: hex(0xbfe0e6),
  rail: hex(0x7c6448),
  floorWood: hex(0xc9a06a),
  poolWater: hex(0x36c4cf),
  poolDeck: hex(0xe8ddc8),
  sofa: hex(0x8a5a4a),
  sofaCushion: hex(0xa8735f),
  tv: hex(0x2b2b30),
  counter: hex(0xe9e3d6),
  counterTop: hex(0x5b4636),
  shelf: hex(0x8a6f4c),
  bed: hex(0xf4efe6),
  bedFrame: hex(0x7c6448),
  desk: hex(0x8a6f4c),
  lantern: hex(0x3a3a3f)
};

/** 傾斜地の高さ合わせを兼ねた基礎。四周を袴のように囲む */
function buildFoundation(b: Builder, layout: VillaLayout, h: HeightFn): void {
  const rng = makeRng(0xfa5ade);
  const edges: [number, number, number, number][] = [
    [-HALF_W, -HALF_D, HALF_W, -HALF_D], [HALF_W, -HALF_D, HALF_W, HALF_D],
    [HALF_W, HALF_D, -HALF_W, HALF_D], [-HALF_W, HALF_D, -HALF_W, -HALF_D]
  ];
  for (const [x0, z0, x1, z1] of edges) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const cx = VILLA.x + x0 + (x1 - x0) * (t0 + t1) / 2;
      const cz = VILLA.z + z0 + (z1 - z0) * (t0 + t1) / 2;
      const g = h(cx, cz);
      const midY = (g + layout.floor1Y) / 2;
      const halfLen = Math.hypot(x1 - x0, z1 - z0) / n / 2 + 0.05;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      b.box([cx, midY, cz], along ? [halfLen, (layout.floor1Y - g) / 2 + 0.05, WALL_T * 1.3]
                                    : [WALL_T * 1.3, (layout.floor1Y - g) / 2 + 0.05, halfLen],
        shade(C.found, 0.88 + rng() * 0.2));
    }
  }
}

/** 壁を1枚、指定した開口（ドア・窓）を空けて積む。開口は wx0..wx1 の範囲 */
// 漆喰壁は、日陰側でも「行きたかった場所」の白さを保ちたい。真の物理陰影
// （ndl が0近辺だと真っ暗）だと時刻によって鼠色の板に見えてしまうので、
// leaf パラメータを流用して常時いくらか明るさの底上げをかけている
// （sceneryMaterial 側の lit = mix(hard, soft, leaf) が効く）。
const WALL_LIT = 0.62;

function wallWithGap(
  b: Builder, y0: number, y1: number, x0: number, x1: number, z: number,
  gapX0: number | null, gapX1: number | null, alongX: boolean, col: V3
): void {
  const midY = (y0 + y1) / 2, halfY = (y1 - y0) / 2;
  const seg = (a: number, bnd: number) => {
    if (bnd - a < 0.05) return;
    const mid = (a + bnd) / 2, half = (bnd - a) / 2;
    if (alongX) {
      b.box([VILLA.x + mid, midY, VILLA.z + z], [half, halfY, WALL_T / 2], col, 0, WALL_LIT);
    } else {
      b.box([VILLA.x + z, midY, VILLA.z + mid], [WALL_T / 2, halfY, half], col, 0, WALL_LIT);
    }
  };
  if (gapX0 === null) { seg(x0, x1); return; }
  seg(x0, gapX0);
  seg(gapX1!, x1);
}

/** 寄棟の屋根。軒を出し、テラコッタ色。妻側は三角に塞ぐ */
function buildRoof(b: Builder, baseY: number, halfW: number, halfD: number, eave: number, rise: number): void {
  const ex = halfW + eave, ez = halfD + eave;
  const ridgeHalf = halfW * 0.35;
  const apexY = baseY + rise;
  const E = (sx: number, sz: number): V3 => [VILLA.x + sx * ex, baseY + 0.10, VILLA.z + sz * ez];
  const R0: V3 = [VILLA.x - ridgeHalf, apexY, VILLA.z];
  const R1: V3 = [VILLA.x + ridgeHalf, apexY, VILLA.z];
  const e00 = E(-1, -1), e10 = E(1, -1), e11 = E(1, 1), e01 = E(-1, 1);
  b.quad(e00, e10, R1, R0, C.roof, 0, 0);              // 南斜面
  b.quad(e11, e01, R0, R1, shade(C.roof, 0.88), 0, 0); // 北斜面
  b.tri(e10, e11, R1, shade(C.roofDark, 1.02), 0, 0);  // 東の妻
  b.tri(e01, e00, R0, shade(C.roofDark, 0.94), 0, 0);  // 西の妻
  b.tube([R0, R1], [0.14, 0.14], 5, C.roofDark, 0);
  for (const [a, c] of [[e00, e10], [e10, e11], [e11, e01], [e01, e00]] as [V3, V3][]) {
    b.tube([a, c], [0.09, 0.09], 5, C.roofDark, 0);
  }
}

/** 鎧戸。窓の左右に薄い板を1枚ずつ */
function shutters(b: Builder, wx: number, y0: number, y1: number, z: number, faceOut: number): void {
  const midY = (y0 + y1) / 2, halfY = (y1 - y0) / 2;
  for (const s of [-1, 1]) {
    b.box([VILLA.x + wx + s * 0.62, midY, VILLA.z + z + faceOut * 0.08],
      [0.32, halfY * 0.92, 0.03], s > 0 ? C.shutter : shade(C.shutter, 0.9));
    // 板のスリット感（縦の溝を細い線で示す）
    for (let i = -1; i <= 1; i++) {
      b.box([VILLA.x + wx + s * 0.62 + i * 0.18, midY, VILLA.z + z + faceOut * 0.095],
        [0.02, halfY * 0.90, 0.01], C.shutterDark);
    }
  }
}

/** 窓ガラス1枚 */
function windowGlass(b: Builder, wx: number, y0: number, y1: number, z: number, faceOut: number, halfWx = 0.9): void {
  b.box([VILLA.x + wx, (y0 + y1) / 2, VILLA.z + z + faceOut * 0.03], [halfWx, (y1 - y0) / 2 * 0.85, 0.02], C.glass);
}

export function buildVillaExterior(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const layout = computeLayout(h);
  buildFoundation(b, layout, h);

  const y0 = layout.floor1Y, y1 = layout.floor1Y + WALL1_H;
  const y2 = layout.floor2Y, y3 = layout.floor2Y + WALL2_H;

  // --- 1F 壁 ---（南面はフレンチドアの開口）
  wallWithGap(b, y0, y1, -HALF_W, HALF_W, -HALF_D, -DOOR_W / 2, DOOR_W / 2, true, C.wall);
  wallWithGap(b, y0, y1, -HALF_W, HALF_W, HALF_D, null, null, true, shade(C.wall, 0.92));
  wallWithGap(b, y0, y1, -HALF_D, HALF_D, -HALF_W, null, null, false, shade(C.wall, 0.96));
  wallWithGap(b, y0, y1, -HALF_D, HALF_D, HALF_W, null, null, false, shade(C.wall, 0.96));
  // 1F 天井（= 2F 床）のスラブ
  b.box([VILLA.x, y1 + SLAB_T / 2, VILLA.z], [HALF_W + 0.06, SLAB_T / 2, HALF_D + 0.06], C.wallShade, 0, WALL_LIT);

  // --- 2F 壁 ---（南面は小窓、西面は寝室の窓）
  wallWithGap(b, y2, y3, -HALF_W, HALF_W, -HALF_D, -0.75, 0.75, true, C.wall);
  wallWithGap(b, y2, y3, -HALF_W, HALF_W, HALF_D, null, null, true, shade(C.wall, 0.92));
  wallWithGap(b, y2, y3, -HALF_D, HALF_D, -HALF_W, -0.9, 0.9, false, shade(C.wall, 0.96));
  wallWithGap(b, y2, y3, -HALF_D, HALF_D, HALF_W, null, null, false, shade(C.wall, 0.96));

  // --- 窓・鎧戸 ---
  windowGlass(b, 0, y2, y3, -HALF_D, -1, 0.7);            // 2F 南の小窓
  shutters(b, 0, y2, y3, -HALF_D, -1);
  windowGlass(b, -HALF_D * 0 - HALF_W, y2 + 0.1, y3 - 0.1, -1.2, -1, 0.75); // 西の寝室窓（西壁面）
  windowGlass(b, HALF_W, y0 + 0.3, y1 - 0.2, 1.5, 1, 0.9);  // 1F 東（キッチン脇）の窓
  shutters(b, 1.5, y0 + 0.3, y1 - 0.2, HALF_W, 1);
  windowGlass(b, -1.5, y0 + 0.3, y1 - 0.2, HALF_D, 1, 0.9); // 1F 北の窓
  shutters(b, -1.5, y0 + 0.3, y1 - 0.2, HALF_D, 1);

  // --- フレンチドア（開口いっぱいに、両開きの2枚） ---
  for (const s of [-1, 1]) {
    b.box([VILLA.x + s * DOOR_W * 0.26, (y0 + y1 - 0.3) / 2, VILLA.z - HALF_D],
      [DOOR_W * 0.24, (y1 - y0 - 0.3) / 2, 0.03], C.glass);
    b.box([VILLA.x + s * DOOR_W * 0.5, (y0 + y1) / 2, VILLA.z - HALF_D], [0.03, (y1 - y0) / 2, 0.03], C.rail);
  }
  // 2枚の合わせ目。すきまを開けたままだと外がまる見えの穴になるので、
  // 実物のフレンチドアどおり中央に方立（マリオン）を立てて塞ぐ
  b.box([VILLA.x, (y0 + y1) / 2, VILLA.z - HALF_D], [0.055, (y1 - y0) / 2, 0.035], C.rail);

  buildRoof(b, y3, HALF_W, HALF_D, 0.55, 2.1);
  lanternHousing(b, layout);

  // --- ベランダ（南へ張り出す木製デッキ）と手すり ---
  const vz0 = -HALF_D - VERANDA_D, vz1 = -HALF_D;
  const planks = 9;
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    b.box([VILLA.x, layout.floor1Y - 0.03, VILLA.z + vz0 + (vz1 - vz0) * t],
      [HALF_W + 0.1, 0.045, (vz1 - vz0) / planks * 0.46], shade(i % 2 ? C.wood : C.woodDark, 0.95 + (i % 3) * 0.05));
  }
  // 束柱（デッキを支える短い柱）
  for (const sx of [-1, 0, 1]) {
    const px = VILLA.x + sx * HALF_W * 0.85, pz = VILLA.z + vz0 + 0.3;
    const g = h(px, pz);
    b.tube([[px, g, pz], [px, layout.floor1Y, pz]], [0.09, 0.09], 6, C.woodDark, 0);
  }
  // 手すり（南端と東西の縁）
  const railY = layout.floor1Y + 0.55;
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    b.tube([[VILLA.x + ax, railY, VILLA.z + az], [VILLA.x + bx, railY, VILLA.z + bz]], [0.035, 0.035], 5, C.rail, 0);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      b.tube([[VILLA.x + x, layout.floor1Y, VILLA.z + z], [VILLA.x + x, railY, VILLA.z + z]], [0.02, 0.02], 4, C.rail, 0);
    }
  };
  rail(-HALF_W, vz0, HALF_W, vz0);
  rail(-HALF_W, vz0, -HALF_W, vz1);
  rail(HALF_W, vz0, HALF_W, vz1);

  return b.build();
}

/** 庭。プールとプールデッキ。ベランダのさらに南、浜側 */
export function buildGarden(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const cx = VILLA.x, cz = VILLA.z - HALF_D - VERANDA_D - 4.2;
  const poolHalfX = 2.6, poolHalfZ = 1.7;
  const deckHalf = 1.0; // プールの外周に敷くデッキの幅
  const outX = poolHalfX + deckHalf, outZ = poolHalfZ + deckHalf;

  // 別荘の基礎と同じ理由。1点の地面サンプルだけでデッキの高さを決めると、
  // 傾斜地では低いほうの隅で地形がデッキに突き刺さって見える。四隅の
  // うち一番高い点に合わせ、低い側は控えめな土台で受ける。
  const corners: [number, number][] = [[-outX, -outZ], [outX, -outZ], [outX, outZ], [-outX, outZ]];
  const gMax = Math.max(...corners.map(([dx, dz]) => h(cx + dx, cz + dz)));
  const deckY = gMax + 0.12;
  // 水面はプール内側だけで見た最高点よりさらに上に置く（低いと地形に埋もれる）
  const poolCorners: [number, number][] = [
    [-poolHalfX, -poolHalfZ], [poolHalfX, -poolHalfZ], [poolHalfX, poolHalfZ], [-poolHalfX, poolHalfZ]
  ];
  const poolGMax = Math.max(...poolCorners.map(([dx, dz]) => h(cx + dx, cz + dz)));
  const poolY = Math.min(deckY - 0.10, poolGMax + 0.35); // デッキより低く、かつ池底の地形より確実に高く

  // デッキの土台（傾斜を吸収する控えめな土台）
  const rng = makeRng(0xdec6);
  const skirt: [number, number, number, number][] = [
    [-outX, -outZ, outX, -outZ], [outX, -outZ, outX, outZ],
    [outX, outZ, -outX, outZ], [-outX, outZ, -outX, -outZ]
  ];
  for (const [x0, z0, x1, z1] of skirt) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const midX = cx + x0 + (x1 - x0) * (t0 + t1) / 2, midZ = cz + z0 + (z1 - z0) * (t0 + t1) / 2;
      const g = h(midX, midZ);
      const midY = (g + deckY) / 2;
      const halfLen = Math.hypot(x1 - x0, z1 - z0) / n / 2 + 0.05;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      b.box([midX, midY, midZ], along ? [halfLen, (deckY - g) / 2 + 0.03, 0.14] : [0.14, (deckY - g) / 2 + 0.03, halfLen],
        shade(C.found, 0.85 + rng() * 0.2));
    }
  }

  // デッキ（プールを囲む敷石）
  const ring: [number, number, number, number][] = [
    [-poolHalfX - deckHalf, -poolHalfZ - deckHalf, poolHalfX + deckHalf, -poolHalfZ],
    [-poolHalfX - deckHalf, poolHalfZ, poolHalfX + deckHalf, poolHalfZ + deckHalf],
    [-poolHalfX - deckHalf, -poolHalfZ, -poolHalfX, poolHalfZ],
    [poolHalfX, -poolHalfZ, poolHalfX + deckHalf, poolHalfZ]
  ];
  for (const [x0, z0, x1, z1] of ring) {
    const midX = cx + (x0 + x1) / 2, midZ = cz + (z0 + z1) / 2;
    b.box([midX, deckY, midZ], [(x1 - x0) / 2, 0.10, (z1 - z0) / 2], shade(C.poolDeck, 0.90 + rng() * 0.18));
  }
  // プールの縁（少し立ち上げた白い縁石）
  b.box([cx, poolY + 0.28, cz - poolHalfZ], [poolHalfX + 0.08, 0.10, 0.08], C.poolDeck);
  b.box([cx, poolY + 0.28, cz + poolHalfZ], [poolHalfX + 0.08, 0.10, 0.08], C.poolDeck);
  b.box([cx - poolHalfX, poolY + 0.28, cz], [0.08, 0.10, poolHalfZ], C.poolDeck);
  b.box([cx + poolHalfX, poolY + 0.28, cz], [0.08, 0.10, poolHalfZ], C.poolDeck);
  // 水面（波紋なしの静止面。海より明るく澄んだ色にする）
  b.box([cx, poolY, cz], [poolHalfX, 0.02, poolHalfZ], C.poolWater);
  // プール底（浅く見せる）
  b.box([cx, poolY - 0.55, cz], [poolHalfX - 0.06, 0.02, poolHalfZ - 0.06], shade(C.poolWater, 0.55));

  return b.build();
}

/** 玄関先の鉢。中身の植物は foliage.ts 側で flora の低木を差し込む */
export const POTTED_SPOTS: [number, number][] = [
  [VILLA.x - DOOR_W / 2 - 0.9, VILLA.z - HALF_D - VERANDA_D + 0.5],
  [VILLA.x + DOOR_W / 2 + 0.9, VILLA.z - HALF_D - VERANDA_D + 0.5]
];

export function buildPots(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  for (const [x, z] of POTTED_SPOTS) {
    const g = h(x, z);
    b.tube([[x, g, z], [x, g + 0.30, z]], [0.24, 0.20], 8, hex(0xc17a4e), 0);
    b.tube([[x, g + 0.28, z], [x, g + 0.34, z]], [0.27, 0.27], 8, hex(0xa8613a), 0);
  }
  return b.build();
}

/** 軒下のランタン本体（灯りは createEntryLantern が別途重ねる） */
function lanternHousing(b: Builder, layout: VillaLayout): void {
  const p: V3 = [VILLA.x, layout.floor1Y + WALL1_H - 0.20, VILLA.z - HALF_D - 0.30];
  b.tube([[p[0], p[1] + 0.22, p[2]], [p[0], p[1] - 0.02, p[2]]], [0.015, 0.015], 4, C.lantern, 0);
  b.box(p, [0.09, 0.13, 0.09], C.lantern);
}

/**
 * 軒下ランタンの灯り。焚き火のような揺らぎは持たせず、夜（1 - uDay）に
 * 応じて静かに灯るだけのごく単純な発光。campfire.ts と同じ、
 * この作品の照明モデル（three.js のシーンライトを参照しない自前シェーダ）
 * にそのまま乗せている。
 */
export function createEntryLantern(env: Env, layout: VillaLayout): THREE.Mesh {
  const p: V3 = [VILLA.x, layout.floor1Y + WALL1_H - 0.20, VILLA.z - HALF_D - 0.30];
  const geo = new THREE.IcosahedronGeometry(0.13, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: COMMON + /* glsl */ `
      uniform float uDay;
      void main() {
        vec3 col = sRGB(255.0, 196.0, 130.0) * (1.0 - uDay) * 0.9;
        gl_FragColor = vec4(grade(col), (1.0 - uDay) * 0.85);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(p[0], p[1], p[2]);
  mesh.frustumCulled = false;
  mesh.renderOrder = 18;
  return mesh;
}

/** 螺旋階段。踏板を STAIR の踊り場の中でらせん状に配置するだけの簡易実装 */
function buildSpiralStair(b: Builder, layout: VillaLayout): void {
  const cx = VILLA.x + (STAIR.x0 + STAIR.x1) / 2, cz = VILLA.z + (STAIR.z0 + STAIR.z1) / 2;
  const r = Math.min(STAIR.x1 - STAIR.x0, STAIR.z1 - STAIR.z0) / 2 - 0.15;
  const steps = 12;
  const turns = 1.4;
  b.tube([[cx, layout.floor1Y, cz], [cx, layout.floor2Y + 0.1, cz]], [0.06, 0.06], 8, C.rail, 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const y = layout.floor1Y + (layout.floor2Y - layout.floor1Y) * t;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const nx = cx + Math.cos(a + 0.3) * r * 0.55, nz = cz + Math.sin(a + 0.3) * r * 0.55;
    // 踏板（芯から外へ台形に張り出す板）
    b.quad(
      [nx, y, nz], [x, y, z],
      [x + Math.cos(a) * 0.06, y, z + Math.sin(a) * 0.06],
      [nx + Math.cos(a) * 0.06, y, nz + Math.sin(a) * 0.06],
      shade(C.woodDark, 0.9 + (i % 3) * 0.06), 0, 0
    );
    // 手すりの支柱
    if (i % 2 === 0) b.tube([[x, y, z], [x, y + 0.55, z]], [0.018, 0.018], 4, C.rail, 0);
  }
}

/** 1F 家具。開放的な玄関＋リビングを1つの土間として作る */
function buildInterior1F(b: Builder, layout: VillaLayout): void {
  const y = layout.floor1Y;
  // 床（フローリング）
  b.box([VILLA.x, y - 0.02, VILLA.z], [HALF_W - 0.05, 0.03, HALF_D - 0.05], C.floorWood);

  // --- ソファ（西寄り、中央を向く） ---
  const sx = VILLA.x - HALF_W * 0.55, sz = VILLA.z + 0.4;
  b.box([sx, y + 0.22, sz], [1.35, 0.22, 0.55], C.sofa);
  b.box([sx, y + 0.50, sz - 0.42], [1.35, 0.20, 0.13], C.sofa);
  for (const dx of [-0.85, 0, 0.85]) {
    b.box([sx + dx, y + 0.48, sz + 0.08], [0.32, 0.14, 0.30], C.sofaCushion);
  }
  b.box([sx - 1.30, y + 0.30, sz], [0.10, 0.30, 0.55], shade(C.sofa, 0.85));
  b.box([sx + 1.30, y + 0.30, sz], [0.10, 0.30, 0.55], shade(C.sofa, 0.85));

  // --- TV（北壁ぎわの低い台の上） ---
  const tvx = VILLA.x - 1.1, tvz = VILLA.z + HALF_D - 0.35;
  b.box([tvx, y + 0.18, tvz], [0.55, 0.16, 0.18], shade(C.counter, 0.9));
  b.box([tvx, y + 0.55, tvz - 0.06], [0.48, 0.30, 0.04], C.tv);

  // --- キッチン（東壁ぎわのオープンカウンター） ---
  const kx = VILLA.x + HALF_W - 0.55;
  b.box([kx, y + 0.42, VILLA.z + 1.2], [0.42, 0.42, 1.55], C.counter);
  b.box([kx, y + 0.86, VILLA.z + 1.2], [0.44, 0.03, 1.58], C.counterTop);
  b.box([kx, y + 0.42, VILLA.z - 0.7], [0.42, 0.42, 0.85], C.counter);
  b.box([kx, y + 0.86, VILLA.z - 0.7], [0.44, 0.03, 0.88], C.counterTop);

  // --- 飾り棚（北壁。フレンチドアから戻ってすぐ目に入る） ---
  const shx = VILLA.x + 2.0, shz = VILLA.z + HALF_D - 0.12;
  for (const dy of [0, 0.55]) {
    b.box([shx, y + 0.85 + dy, shz], [0.85, 0.03, 0.16], C.shelf);
  }
  b.box([shx - 0.80, y + 0.6, shz], [0.03, 0.85, 0.16], shade(C.shelf, 0.85));
  b.box([shx + 0.80, y + 0.6, shz], [0.03, 0.85, 0.16], shade(C.shelf, 0.85));

  buildSpiralStair(b, layout);
}

/** 2F 家具。窓辺に書き物机、寝室にベッド */
function buildInterior2F(b: Builder, layout: VillaLayout): void {
  const y = layout.floor2Y;
  // 床。階段の吹き抜け（STAIR）は矩形の切り欠きとして、2枚の板で L字に敷く
  // 階段の吹き抜け（STAIR、北東の隅にぴったり寄せてある）を、
  // 矩形2枚で隙間なく L字に敷く。継ぎ目をぴったり合わせて、
  // すきま／めり込みによる継ぎ目のちらつきを避ける。
  const notchX = STAIR.x0, notchZ = STAIR.z0;
  const edge = 0.05; // 建物外周だけ、壁にめり込まないよう少し内側に
  b.box([VILLA.x + (-HALF_W + edge + notchX) / 2, y - 0.02, VILLA.z],
    [(notchX - (-HALF_W + edge)) / 2, 0.03, HALF_D - edge], C.floorWood);
  b.box([VILLA.x + (notchX + HALF_W - edge) / 2, y - 0.02, VILLA.z + (-HALF_D + edge + notchZ) / 2],
    [(HALF_W - edge - notchX) / 2, 0.03, (notchZ - (-HALF_D + edge)) / 2], C.floorWood);

  // --- ベッド（西壁ぎわ） ---
  const bx = VILLA.x - HALF_W * 0.55, bz = VILLA.z - 0.3;
  b.box([bx, y + 0.20, bz], [1.0, 0.20, 1.55], C.bedFrame);
  b.box([bx, y + 0.40, bz], [0.95, 0.14, 1.48], C.bed);
  b.box([bx, y + 0.60, bz - 1.30], [0.98, 0.28, 0.10], C.bedFrame);
  b.box([bx - 0.45, y + 0.56, bz - 1.05], [0.30, 0.16, 0.28], hex(0xffffff));
  b.box([bx + 0.45, y + 0.56, bz - 1.05], [0.30, 0.16, 0.28], hex(0xffffff));

  // --- 書き物机（南の小窓の脇。灯篭流しの一言をここで書く） ---
  const dx = VILLA.x + 1.6, dz = VILLA.z - HALF_D + 0.55;
  b.box([dx, y + 0.42, dz], [0.55, 0.04, 0.35], C.desk);
  for (const [ox, oz] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]] as [number, number][]) {
    b.box([dx + ox, y + 0.21, dz + oz], [0.03, 0.21, 0.03], C.desk);
  }
  b.box([dx, y + 0.60, dz + 0.30], [0.22, 0.16, 0.02], shade(C.desk, 0.8));
}

export function buildVillaInterior(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const layout = computeLayout(h);
  buildInterior1F(b, layout);
  buildInterior2F(b, layout);
  return b.build();
}
