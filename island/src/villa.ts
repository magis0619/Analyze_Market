// 指示書 §6。別荘は「到着/別れの演出」を彩度の変化という抽象処理だけでなく、
// この家から出発しこの家に戻るという具体的な動線として実体化する場所であり、
// 拾った貝殻・流木を飾る場所でもある。
//
// スタイルはモダンミニマル（地中海リゾート風は撤回）。白い立方体ボリューム、
// フラットな屋根、床から天井までのガラス面、木目調のウッドデッキ、
// インフィニティ感のあるプール。装飾は最小限に留めるほどこのスタイルらしい。
// 砂浜からやや高台寄り、湾を見渡せる場所に置く。
//
// 各階はシンプルな箱の組み合わせで作る（指示書の実装方針どおり）。
// 螺旋階段の物理的な段差判定は最低限に留め、階段の足元だけをスロープとして
// 扱う（VillaFloorTracker）。壁・家具の水平方向の当たり判定は collision.ts。

import * as THREE from 'three';
import { Builder, hex, shade, type V3 } from './meshbuild';
import { makeRng } from './noise';
import type { HeightFn } from './structures';
import { COMMON, SKY } from './glsl/lib';
import type { Env } from './env';
import { makeAABB, type AABB } from './collision';

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
const DOOR_W = 3.6;                   // スライドドアの開口幅
const GLASS_MARGIN = 0.5;             // 隅に残す方立（構造壁）の幅
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

// --- モダンミニマルのパレット -----------------------------------------------
const C = {
  wall: hex(0xf6f5f0),
  wallShade: hex(0xebe9e2),
  found: hex(0xd7d4cb),
  roofSlab: hex(0xeeece5),
  frame: hex(0x232326),
  glass: hex(0xb9dbe3),
  steel: hex(0xc9cdce),
  wood: hex(0x8a6f4c),
  woodDark: hex(0x6d573a),
  floorWood: hex(0xc9a06a),
  poolDeck: hex(0xe6e3d9),
  poolCoping: hex(0xf2f0e8),
  sofa: hex(0xe8e2d5),
  sofaCushion: hex(0xf1ece0),
  tv: hex(0x141417),
  counter: hex(0xedebe2),
  counterTop: hex(0x3c3c40),
  shelf: hex(0x8a6f4c),
  bed: hex(0xf7f4ee),
  bedFrame: hex(0xdcd9d0),
  desk: hex(0xf0eee7),
  lantern: hex(0x2c2c30)
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
  gapX0: number | null, gapX1: number | null, alongX: boolean, col: V3,
  colliders?: AABB[]
): void {
  const midY = (y0 + y1) / 2, halfY = (y1 - y0) / 2;
  const seg = (a: number, bnd: number) => {
    if (bnd - a < 0.05) return;
    const mid = (a + bnd) / 2, half = (bnd - a) / 2;
    const center: V3 = alongX ? [VILLA.x + mid, midY, VILLA.z + z] : [VILLA.x + z, midY, VILLA.z + mid];
    const halfExt: V3 = alongX ? [half, halfY, WALL_T / 2] : [WALL_T / 2, halfY, half];
    b.box(center, halfExt, col, 0, WALL_LIT);
    colliders?.push(makeAABB(center, halfExt));
  };
  if (gapX0 === null) { seg(x0, x1); return; }
  seg(x0, gapX0);
  seg(gapX1!, x1);
}

/** フラットな屋根。薄いパラペット（立ち上がりの縁）だけで、装飾は最小限にする */
function buildFlatRoof(b: Builder, baseY: number, halfW: number, halfD: number, eave: number): void {
  const ex = halfW + eave, ez = halfD + eave;
  const slabH = 0.22;
  b.box([VILLA.x, baseY + slabH / 2, VILLA.z], [ex, slabH / 2, ez], C.roofSlab, 0, WALL_LIT);
  const parH = 0.32, parT = 0.09;
  const midY = baseY + slabH + parH / 2;
  b.box([VILLA.x, midY, VILLA.z - ez + parT / 2], [ex, parH / 2, parT / 2], C.wallShade, 0, WALL_LIT);
  b.box([VILLA.x, midY, VILLA.z + ez - parT / 2], [ex, parH / 2, parT / 2], C.wallShade, 0, WALL_LIT);
  b.box([VILLA.x - ex + parT / 2, midY, VILLA.z], [parT / 2, parH / 2, ez], shade(C.wallShade, 0.95), 0, WALL_LIT);
  b.box([VILLA.x + ex - parT / 2, midY, VILLA.z], [parT / 2, parH / 2, ez], shade(C.wallShade, 0.95), 0, WALL_LIT);
}

/** 窓ガラス1枚。細い黒フレームつき（モダンミニマルは縁の薄さが命） */
function windowGlass(
  b: Builder, wx: number, y0: number, y1: number, z: number, faceOut: number,
  halfWx = 0.9, colliders?: AABB[]
): void {
  const midY = (y0 + y1) / 2, halfY = (y1 - y0) / 2 * 0.94;
  const center: V3 = [VILLA.x + wx, midY, VILLA.z + z + faceOut * 0.03];
  const half: V3 = [halfWx, halfY, 0.02];
  // ガラスは直射より空の映り込みで見える面。日陰側でも黒く沈まないよう、
  // 壁と同じ明るさの底上げをかけておく（そうしないと日陰面だけ真っ黒になる）
  b.box(center, half, C.glass, 0, WALL_LIT);
  colliders?.push(makeAABB(center, half));
  const ft = 0.035;
  b.box([VILLA.x + wx, y0 + ft, VILLA.z + z + faceOut * 0.05], [halfWx + ft, ft, 0.018], C.frame);
  b.box([VILLA.x + wx, y1 - ft, VILLA.z + z + faceOut * 0.05], [halfWx + ft, ft, 0.018], C.frame);
  b.box([VILLA.x + wx - halfWx, midY, VILLA.z + z + faceOut * 0.05], [ft, halfY, 0.018], C.frame);
  b.box([VILLA.x + wx + halfWx, midY, VILLA.z + z + faceOut * 0.05], [ft, halfY, 0.018], C.frame);
}

export function buildVillaExterior(h: HeightFn, colliders: AABB[]): THREE.BufferGeometry {
  const b = new Builder();
  const layout = computeLayout(h);
  buildFoundation(b, layout, h);

  const y0 = layout.floor1Y, y1 = layout.floor1Y + WALL1_H;
  const y2 = layout.floor2Y, y3 = layout.floor2Y + WALL2_H;

  // --- 1F 南面：隅の方立だけを構造壁として残し、中央はスライドドア
  // （createSlidingDoor が動的メッシュで別途重ねる）、その両脇は固定ガラスで
  // 床から天井までのガラス面にする（地中海様式の撤回・モダンミニマル化）。
  {
    const doorHalf = DOOR_W / 2;
    const flankWidth = HALF_W - GLASS_MARGIN - doorHalf;
    for (const s of [-1, 1] as const) {
      const cx = s * (HALF_W - GLASS_MARGIN / 2);
      const half: V3 = [GLASS_MARGIN / 2, (y1 - y0) / 2, WALL_T / 2];
      const center: V3 = [VILLA.x + cx, (y0 + y1) / 2, VILLA.z - HALF_D];
      b.box(center, half, C.wall, 0, WALL_LIT);
      colliders.push(makeAABB(center, half));
    }
    for (const s of [-1, 1] as const) {
      const fx = s * (doorHalf + flankWidth / 2);
      windowGlass(b, fx, y0 + 0.02, y1 - 0.02, -HALF_D, -1, flankWidth / 2 - 0.04, colliders);
    }
  }
  wallWithGap(b, y0, y1, -HALF_W, HALF_W, HALF_D, null, null, true, shade(C.wall, 0.94), colliders);
  wallWithGap(b, y0, y1, -HALF_D, HALF_D, -HALF_W, null, null, false, shade(C.wall, 0.97), colliders);
  wallWithGap(b, y0, y1, -HALF_D, HALF_D, HALF_W, null, null, false, shade(C.wall, 0.97), colliders);
  windowGlass(b, HALF_W, y0 + 0.3, y1 - 0.2, 1.5, 1, 0.9);
  windowGlass(b, -1.5, y0 + 0.3, y1 - 0.2, HALF_D, 1, 0.9);

  // 1F 天井（= 2F 床）のスラブ
  b.box([VILLA.x, y1 + SLAB_T / 2, VILLA.z], [HALF_W + 0.06, SLAB_T / 2, HALF_D + 0.06], C.wallShade, 0, WALL_LIT);

  // --- 2F 壁 ---（南は方立+全面ガラス、西は大窓、北・東は無地）
  {
    for (const s of [-1, 1] as const) {
      const cx = s * (HALF_W - GLASS_MARGIN / 2);
      const half: V3 = [GLASS_MARGIN / 2, (y3 - y2) / 2, WALL_T / 2];
      const center: V3 = [VILLA.x + cx, (y2 + y3) / 2, VILLA.z - HALF_D];
      b.box(center, half, C.wall, 0, WALL_LIT);
      colliders.push(makeAABB(center, half));
    }
    windowGlass(b, 0, y2 + 0.04, y3 - 0.04, -HALF_D, -1, HALF_W - GLASS_MARGIN - 0.05, colliders);
  }
  wallWithGap(b, y2, y3, -HALF_W, HALF_W, HALF_D, null, null, true, shade(C.wall, 0.94), colliders);
  wallWithGap(b, y2, y3, -HALF_D, HALF_D, -HALF_W, -1.8, 1.8, false, shade(C.wall, 0.97), colliders);
  windowGlass(b, 0, y2 + 0.06, y3 - 0.06, -HALF_W, -1, 1.75, colliders);
  wallWithGap(b, y2, y3, -HALF_D, HALF_D, HALF_W, null, null, false, shade(C.wall, 0.97), colliders);

  buildFlatRoof(b, y3, HALF_W, HALF_D, 0.45);
  lanternHousing(b, layout);

  // --- ベランダ（南へ張り出す木目デッキ）と手すり ---
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
  // 手すり：南端（湾側）はガラスの腰壁、東西はスチールの縦格子
  const railY = layout.floor1Y + 0.55;
  b.box([VILLA.x, (layout.floor1Y + railY) / 2 + 0.05, VILLA.z + vz0],
    [HALF_W - 0.05, (railY - layout.floor1Y) / 2, 0.02], C.glass, 0, 0);
  b.tube([[VILLA.x - HALF_W, railY, VILLA.z + vz0], [VILLA.x + HALF_W, railY, VILLA.z + vz0]], [0.03, 0.03], 6, C.steel, 0);
  const sideRail = (ax: number, az: number, bx: number, bz: number) => {
    b.tube([[VILLA.x + ax, railY, VILLA.z + az], [VILLA.x + bx, railY, VILLA.z + bz]], [0.03, 0.03], 6, C.steel, 0);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      b.tube([[VILLA.x + x, layout.floor1Y, VILLA.z + z], [VILLA.x + x, railY, VILLA.z + z]], [0.016, 0.016], 4, C.steel, 0);
    }
  };
  sideRail(-HALF_W, vz0, -HALF_W, vz1);
  sideRail(HALF_W, vz0, HALF_W, vz1);

  return b.build();
}

export type PoolLayout = {
  cx: number; cz: number;
  poolHalfX: number; poolHalfZ: number; deckHalf: number;
  deckY: number; poolY: number;
};

/** プール・デッキの位置と高さ。buildGarden と createPoolWater の両方が使う共通の値 */
export function poolLayout(h: HeightFn): PoolLayout {
  const cx = VILLA.x, cz = VILLA.z - HALF_D - VERANDA_D - 4.2;
  const poolHalfX = 2.6, poolHalfZ = 1.7, deckHalf = 1.0;
  const outX = poolHalfX + deckHalf, outZ = poolHalfZ + deckHalf;

  // 別荘の基礎と同じ理由。1点の地面サンプルだけでデッキの高さを決めると、
  // 傾斜地では低いほうの隅で地形がデッキに突き刺さって見える。四隅の
  // うち一番高い点に合わせ、低い側は控えめな土台で受ける。
  const corners: [number, number][] = [[-outX, -outZ], [outX, -outZ], [outX, outZ], [-outX, outZ]];
  const gMax = Math.max(...corners.map(([dx, dz]) => h(cx + dx, cz + dz)));
  const deckY = gMax + 0.12;
  const poolCorners: [number, number][] = [
    [-poolHalfX, -poolHalfZ], [poolHalfX, -poolHalfZ], [poolHalfX, poolHalfZ], [-poolHalfX, poolHalfZ]
  ];
  const poolGMax = Math.max(...poolCorners.map(([dx, dz]) => h(cx + dx, cz + dz)));
  const poolY = Math.min(deckY - 0.10, poolGMax + 0.35);
  return { cx, cz, poolHalfX, poolHalfZ, deckHalf, deckY, poolY };
}

/** 庭。プールデッキとコーピング（水面は createPoolWater が別に重ねる） */
export function buildGarden(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const pl = poolLayout(h);
  const { cx, cz, poolHalfX, poolHalfZ, deckHalf, deckY, poolY } = pl;
  const outX = poolHalfX + deckHalf, outZ = poolHalfZ + deckHalf;

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
    b.box([midX, deckY, midZ], [(x1 - x0) / 2, 0.10, (z1 - z0) / 2], shade(C.poolDeck, 0.92 + rng() * 0.14));
  }
  // プールの縁（白いコーピング。薄く低くして、海との一体感を邪魔しない）
  b.box([cx, poolY + 0.24, cz - poolHalfZ], [poolHalfX + 0.06, 0.07, 0.06], C.poolCoping);
  b.box([cx, poolY + 0.24, cz + poolHalfZ], [poolHalfX + 0.06, 0.07, 0.06], C.poolCoping);
  b.box([cx - poolHalfX, poolY + 0.24, cz], [0.06, 0.07, poolHalfZ], C.poolCoping);
  b.box([cx + poolHalfX, poolY + 0.24, cz], [0.06, 0.07, poolHalfZ], C.poolCoping);

  return b.build();
}

/** プールの水面。海と同じ吸光・散乱モデルを共有ユニフォームごと使い回すことで
 * 「海と同等の水質」にする（指示書②）。タイル張りの浅いプールなので海底の
 * 代わりに一定の水深とタイルのアルベドを仮定するだけで、あとは同じ式。 */
export function createPoolWater(env: Env, h: HeightFn): THREE.Mesh {
  const pl = poolLayout(h);
  const geo = new THREE.PlaneGeometry(pl.poolHalfX * 2 - 0.10, pl.poolHalfZ * 2 - 0.10, 24, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: COMMON + /* glsl */ `
      uniform float uTime;
      varying vec2 vXz;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 3.4 + uTime * 1.3) * 0.010 + cos(p.z * 2.6 + uTime * 0.9) * 0.010;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vXz = world.xz;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: COMMON + SKY + /* glsl */ `
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyLight;
      uniform vec3 uAmbLight;
      uniform vec3 uExtinction;
      uniform vec3 uScatterCoef;
      varying vec2 vXz;
      varying vec3 vWorld;
      void main() {
        // タイル張りの浅いプールなので、海底の代わりに一定の水深を仮定する
        float depth = 1.35;
        vec3 tileAlbedo = sRGB(214.0, 232.0, 232.0);
        vec3 bedLit = tileAlbedo * (uKeyLight * max(uKeyDir.y, 0.15) + uAmbLight * 0.7);
        vec3 trans = exp(-uExtinction * depth * 1.6);
        vec3 twoE = 2.0 * uExtinction;
        vec3 inScat = (uScatterCoef / twoE) * (1.0 - exp(-twoE * depth)) * (uKeyLight * 0.75 + uAmbLight * 0.9);
        vec3 body = bedLit * trans + inScat;

        vec3 V = normalize(uCamPos - vWorld);
        vec2 rp = vXz * 1.6 + vec2(uTime * 0.05, uTime * 0.04);
        float n = fbm3(rp);
        vec3 N = normalize(vec3(n * 0.05, 1.0, fbm3(rp * 1.7 + 5.0) * 0.05));
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyColor(normalize(R), 0.0);
        float fres = 0.03 + 0.6 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(body, refl, fres);

        vec3 H = normalize(uKeyDir + V);
        col += uSunColor * pow(max(dot(N, H), 0.0), 500.0) * 1.6;

        gl_FragColor = vec4(grade(col), 0.95);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pl.cx, pl.poolY, pl.cz);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  return mesh;
}

/** 玄関先の鉢。最小限、ソテツ1本だけ（指示書「装飾は最小限に留める」） */
export const POTTED_SPOTS: [number, number][] = [
  [VILLA.x - DOOR_W / 2 - 1.3, VILLA.z - HALF_D - VERANDA_D + 0.5]
];

export function buildPots(h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  for (const [x, z] of POTTED_SPOTS) {
    const g = h(x, z);
    b.tube([[x, g, z], [x, g + 0.30, z]], [0.22, 0.19], 8, C.steel, 0);
    b.tube([[x, g + 0.28, z], [x, g + 0.33, z]], [0.24, 0.24], 8, shade(C.steel, 0.85), 0);
  }
  return b.build();
}

/** 軒下の間接照明の本体（灯りは createEntryLantern が別途重ねる）。
 * 吊り下げ式ランタンではなく、スラブの下端に沿った細いスリット状の器具にする */
function lanternHousing(b: Builder, layout: VillaLayout): void {
  const y = layout.floor1Y + WALL1_H + 0.02;
  b.box([VILLA.x, y, VILLA.z - HALF_D - 0.28], [0.55, 0.03, 0.05], C.lantern);
}

/**
 * 軒下照明の灯り。焚き火のような揺らぎは持たせず、夜（1 - uDay）に
 * 応じて静かに灯るだけのごく単純な発光。campfire.ts と同じ、
 * この作品の照明モデル（three.js のシーンライトを参照しない自前シェーダ）
 * にそのまま乗せている。
 */
export function createEntryLantern(env: Env, layout: VillaLayout): THREE.Mesh {
  const p: V3 = [VILLA.x, layout.floor1Y + WALL1_H - 0.02, VILLA.z - HALF_D - 0.28];
  const geo = new THREE.IcosahedronGeometry(0.09, 0);
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
        vec3 col = sRGB(255.0, 200.0, 140.0) * (1.0 - uDay) * 0.9;
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

export type DoorLayout = {
  y0: number; y1: number; z: number; halfW: number; halfH: number;
  closedX: number; openX: number;
};

/** スライドドアの開口位置。壁側（buildVillaExterior）と動的メッシュの両方が使う */
function doorLayout(layout: VillaLayout): DoorLayout {
  const y0 = layout.floor1Y + 0.02, y1 = layout.floor1Y + WALL1_H - 0.02;
  return {
    y0, y1, z: VILLA.z - HALF_D,
    halfW: DOOR_W / 2, halfH: (y1 - y0) / 2,
    closedX: VILLA.x, openX: VILLA.x + (HALF_W - GLASS_MARGIN) // 東の方立の裏に隠れる位置
  };
}

/**
 * スライド式ガラスドア（指示書④）。この作品の家具・地形はすべて静的に
 * 焼き込んだ merged geometry で、動くものは焚き火・軒灯だけが例外的に
 * 独立した Mesh だった。ドアも同じ扱いにする：プレイヤーの位置を毎フレーム
 * 見て開閉し、当たり判定（box）もその開閉に追従させる。
 */
export function createSlidingDoor(env: Env, layout: VillaLayout): {
  mesh: THREE.Mesh;
  update: (playerX: number, playerZ: number, dt: number) => void;
  box: () => AABB;
} {
  const dl = doorLayout(layout);
  const geo = new THREE.PlaneGeometry(dl.halfW * 2 * 0.96, dl.halfH * 2 * 0.96);
  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vWorld;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: COMMON + /* glsl */ `
      uniform vec3 uCamPos;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyLight;
      uniform vec3 uAmbLight;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      void main() {
        vec3 V = normalize(uCamPos - vWorld);
        float fres = pow(1.0 - max(dot(normalize(vNormalW), V), 0.0), 3.0);
        vec3 glassCol = sRGB(180.0, 210.0, 216.0);
        vec3 lit = glassCol * (uKeyLight * max(uKeyDir.y, 0.25) + uAmbLight);
        vec3 col = mix(lit * 0.55, sRGB(255.0, 255.0, 255.0), fres * 0.6);
        gl_FragColor = vec4(grade(col), 0.30 + fres * 0.35);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(dl.closedX, (dl.y0 + dl.y1) / 2, dl.z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;

  let openAmount = 0;
  const TRIGGER = 2.2;
  function update(playerX: number, playerZ: number, dt: number): void {
    const dist = Math.hypot(playerX - dl.closedX, playerZ - dl.z);
    const target = dist < TRIGGER ? 1 : 0;
    openAmount += (target - openAmount) * Math.min(1, dt * 3.2);
    mesh.position.x = dl.closedX + (dl.openX - dl.closedX) * openAmount;
  }
  function box(): AABB {
    return makeAABB([mesh.position.x, mesh.position.y, mesh.position.z], [dl.halfW * 0.96, dl.halfH * 0.96, 0.06]);
  }
  return { mesh, update, box };
}

/** 螺旋階段。白/スチールの片持ち踏板が浮いているように見せる（指示書③） */
function buildSpiralStair(b: Builder, layout: VillaLayout): void {
  const cx = VILLA.x + (STAIR.x0 + STAIR.x1) / 2, cz = VILLA.z + (STAIR.z0 + STAIR.z1) / 2;
  const r = Math.min(STAIR.x1 - STAIR.x0, STAIR.z1 - STAIR.z0) / 2 - 0.15;
  const steps = 12;
  const turns = 1.4;
  b.tube([[cx, layout.floor1Y, cz], [cx, layout.floor2Y + 0.1, cz]], [0.05, 0.05], 10, C.steel, 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const y = layout.floor1Y + (layout.floor2Y - layout.floor1Y) * t;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const nx = cx + Math.cos(a + 0.3) * r * 0.55, nz = cz + Math.sin(a + 0.3) * r * 0.55;
    // 踏板（芯から外へ台形に張り出す板）。leaf を効かせて白く浮かせる
    b.quad(
      [nx, y, nz], [x, y, z],
      [x + Math.cos(a) * 0.06, y, z + Math.sin(a) * 0.06],
      [nx + Math.cos(a) * 0.06, y, nz + Math.sin(a) * 0.06],
      shade(C.steel, 0.97 + (i % 3) * 0.02), 0, 0.35
    );
    if (i % 2 === 0) b.tube([[x, y, z], [x, y + 0.52, z]], [0.014, 0.014], 4, C.steel, 0);
  }
}

/** 1F 家具。開放的な玄関＋リビングを1つの土間として作る */
function buildInterior1F(b: Builder, layout: VillaLayout, colliders: AABB[]): void {
  const y = layout.floor1Y;
  // 床（フローリング）
  b.box([VILLA.x, y - 0.02, VILLA.z], [HALF_W - 0.05, 0.03, HALF_D - 0.05], C.floorWood);

  // --- ソファ（西寄り、中央を向く）。座面・背もたれ・肘掛けの継ぎ目に
  // 丸みを通して柔らかく見せる（指示書⑤） ---
  const sx = VILLA.x - HALF_W * 0.55, sz = VILLA.z + 0.4;
  b.box([sx, y + 0.20, sz], [1.35, 0.18, 0.55], C.sofa);
  b.box([sx, y + 0.52, sz - 0.30], [1.35, 0.24, 0.14], C.sofa);
  b.tube([[sx - 1.30, y + 0.36, sz - 0.16], [sx + 1.30, y + 0.36, sz - 0.16]], [0.16, 0.16], 8, C.sofa, 0);
  for (const dx of [-0.85, 0, 0.85]) {
    b.box([sx + dx, y + 0.42, sz + 0.10], [0.32, 0.13, 0.30], C.sofaCushion);
  }
  for (const s of [-1, 1]) {
    b.box([sx + s * 1.30, y + 0.26, sz], [0.11, 0.26, 0.55], shade(C.sofa, 0.92));
    b.tube([[sx + s * 1.30, y + 0.50, sz - 0.52], [sx + s * 1.30, y + 0.50, sz + 0.52]], [0.11, 0.11], 8, shade(C.sofa, 0.92), 0);
  }
  colliders.push(makeAABB([sx, y + 0.3, sz], [1.45, 0.6, 0.68]));

  // --- TV（北壁ぎわ。視距離4.5mから対角約50インチ相当に拡大：指示書⑥） ---
  const tvx = VILLA.x - 1.1, tvz = VILLA.z + HALF_D - 0.35;
  b.box([tvx, y + 0.18, tvz], [0.62, 0.16, 0.18], shade(C.counter, 0.9));
  b.box([tvx, y + 0.62, tvz - 0.06], [0.56, 0.31, 0.035], C.tv);

  // --- キッチン（東壁ぎわのオープンカウンター） ---
  const kx = VILLA.x + HALF_W - 0.55;
  const k1: V3 = [kx, y + 0.42, VILLA.z + 1.2], k1h: V3 = [0.42, 0.42, 1.55];
  const k2: V3 = [kx, y + 0.42, VILLA.z - 0.7], k2h: V3 = [0.42, 0.42, 0.85];
  b.box(k1, k1h, C.counter);
  b.box([kx, y + 0.86, VILLA.z + 1.2], [0.44, 0.03, 1.58], C.counterTop);
  b.box(k2, k2h, C.counter);
  b.box([kx, y + 0.86, VILLA.z - 0.7], [0.44, 0.03, 0.88], C.counterTop);
  colliders.push(makeAABB(k1, [k1h[0] + 0.02, k1h[1] + 0.44, k1h[2]]));
  colliders.push(makeAABB(k2, [k2h[0] + 0.02, k2h[1] + 0.44, k2h[2]]));

  // --- 飾り棚（北壁。ドアから戻ってすぐ目に入る場所） ---
  const shx = VILLA.x + 2.0, shz = VILLA.z + HALF_D - 0.12;
  for (const dy of [0, 0.55]) {
    b.box([shx, y + 0.85 + dy, shz], [0.85, 0.03, 0.16], C.shelf);
  }
  b.box([shx - 0.80, y + 0.6, shz], [0.03, 0.85, 0.16], shade(C.shelf, 0.85));
  b.box([shx + 0.80, y + 0.6, shz], [0.03, 0.85, 0.16], shade(C.shelf, 0.85));

  buildSpiralStair(b, layout);
}

/** 2F 家具。窓辺に書き物机、寝室にベッド */
function buildInterior2F(b: Builder, layout: VillaLayout, colliders: AABB[]): void {
  const y = layout.floor2Y;
  // 床。階段の吹き抜け（STAIR、北東の隅にぴったり寄せてある）を、
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
  const bedCenter: V3 = [bx, y + 0.22, bz];
  b.box(bedCenter, [1.0, 0.16, 1.55], shade(C.bedFrame, 0.95));
  b.box([bx, y + 0.40, bz], [0.95, 0.14, 1.48], C.bed);
  b.box([bx, y + 0.62, bz - 1.30], [0.98, 0.30, 0.08], C.bedFrame);
  b.box([bx - 0.45, y + 0.56, bz - 1.05], [0.30, 0.16, 0.28], hex(0xffffff));
  b.box([bx + 0.45, y + 0.56, bz - 1.05], [0.30, 0.16, 0.28], hex(0xffffff));
  colliders.push(makeAABB(bedCenter, [1.05, 0.45, 1.60]));

  // --- 書き物机（南の大窓の脇。灯篭流しの一言をここで書く。白/スチールで統一） ---
  const dx = VILLA.x + 1.6, dz = VILLA.z - HALF_D + 0.55;
  b.box([dx, y + 0.42, dz], [0.55, 0.03, 0.35], C.desk);
  for (const [ox, oz] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]] as [number, number][]) {
    b.tube([[dx + ox, y, dz + oz], [dx + ox, y + 0.40, dz + oz]], [0.018, 0.018], 5, C.steel, 0);
  }
  b.box([dx, y + 0.60, dz + 0.30], [0.22, 0.16, 0.02], shade(C.desk, 0.85));
}

export function buildVillaInterior(h: HeightFn, colliders: AABB[]): THREE.BufferGeometry {
  const b = new Builder();
  const layout = computeLayout(h);
  buildInterior1F(b, layout, colliders);
  buildInterior2F(b, layout, colliders);
  return b.build();
}
