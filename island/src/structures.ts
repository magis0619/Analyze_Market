// 指示書 §4-1 の人工物。人の手が入った気配だけを置く。
// 「留まる」ための東屋とハンモック、湾の入り口の桟橋と灯台、
// そして琉球石灰岩の石垣。どれも数は少ないので、量より佇まいを優先する。

import * as THREE from 'three';
import { Builder, hex, addv, mul, norm, shade, type V3 } from './meshbuild';
import { makeRng } from './noise';

const C = {
  wood: hex(0x8a6f4c),
  woodDark: hex(0x6d573a),
  post: hex(0x7b6244),
  thatch: hex(0x9c8552),
  thatchDark: hex(0x7d6a41),
  limestone: hex(0xe6ddc7),
  limestoneDark: hex(0xc6bca3),
  rope: hex(0xc9bb9a),
  cloth: hex(0xd8cdb6),
  towerWhite: hex(0xf1efe6),
  towerBand: hex(0xc4402f),
  lantern: hex(0x40484c),
  glass: hex(0xa9c6cf)
};

export type HeightFn = (x: number, z: number) => number;

/** 琉球石灰岩の積み石。多孔質でゴツゴツした白い石を、目地をずらして積む */
function limestoneRun(
  b: Builder, path: [number, number][], height: number, thick: number,
  h: HeightFn, seed: number
): void {
  const rng = makeRng(seed);
  const courses = Math.max(2, Math.round(height / 0.22));
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i]!, [x1, z1] = path[i + 1]!;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    for (let c = 0; c < courses; c++) {
      const y0 = (c / courses) * height;
      const ch = height / courses;
      // 段ごとに目地をずらす
      const off = (c % 2) * 0.5;
      const n = Math.max(1, Math.round(len / 0.55));
      for (let k = 0; k < n; k++) {
        const t = (k + off) / n;
        if (t >= 1) continue;
        // 石の大きさと高さをばらつかせる。揃えるとブロック塀になってしまう
        const bw = (len / n) * (0.30 + rng() * 0.34);
        const cx = x0 + ux * (t * len + bw), cz = z0 + uz * (t * len + bw);
        const g = h(cx, cz);
        const col = rng() < 0.30 ? C.limestoneDark : C.limestone;
        const hy = ch * (0.36 + rng() * 0.16);
        b.box([cx, g + y0 + ch * 0.5 + (rng() - 0.5) * ch * 0.14, cz],
          [bw * 0.94 + thick * 0.22, hy, thick * (0.42 + rng() * 0.20)],
          shade(col, 0.86 + rng() * 0.30));
      }
    }
  }
}

/** 東屋。屋根と柱だけ。石灰岩の土台に載せる */
export function pavilion(cx: number, cz: number, h: HeightFn, rot: number): THREE.BufferGeometry {
  const b = new Builder();
  const g = h(cx, cz);
  const hw = 2.3;                     // 土台の半径
  const deckY = g + 0.42;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const at = (x: number, z: number): [number, number] => [cx + x * cos - z * sin, cz + x * sin + z * cos];

  // 土台: 石灰岩を四周に積み、上に床板を張る
  const c0 = at(-hw, -hw), c1 = at(hw, -hw), c2 = at(hw, hw), c3 = at(-hw, hw);
  limestoneRun(b, [c0, c1, c2, c3, c0], 0.42, 0.40, () => g, 51);
  const planks = 11;
  for (let i = 0; i < planks; i++) {
    const z = -hw + ((i + 0.5) / planks) * hw * 2;
    const p = at(0, z);
    b.box([p[0], deckY, p[1]], [hw * 0.98, 0.045, (hw / planks) * 0.86],
      shade(i % 2 ? C.wood : C.woodDark, 0.94 + (i % 3) * 0.05));
  }

  // 柱4本と梁
  const ph = 2.35;
  const posts: [number, number][] = [[-hw + 0.35, -hw + 0.35], [hw - 0.35, -hw + 0.35],
                                     [hw - 0.35, hw - 0.35], [-hw + 0.35, hw - 0.35]];
  for (const [px, pz] of posts) {
    const p = at(px, pz);
    b.tube([[p[0], deckY, p[1]], [p[0], deckY + ph, p[1]]], [0.10, 0.09], 6, C.post, 0);
  }
  const beamY = deckY + ph;
  for (let i = 0; i < 4; i++) {
    const a = at(posts[i]![0], posts[i]![1]);
    const bb = at(posts[(i + 1) % 4]![0], posts[(i + 1) % 4]![1]);
    b.tube([[a[0], beamY, a[1]], [bb[0], beamY, bb[1]]], [0.075, 0.075], 5, C.woodDark, 0);
  }

  // 寄棟の茅葺き。軒を深く出して日陰を作る
  const eave = hw + 0.55;
  const ridgeY = beamY + 1.25;
  const rl = hw * 0.42;
  const e = (x: number, z: number): V3 => { const p = at(x, z); return [p[0], beamY + 0.12, p[1]]; };
  const r = (x: number): V3 => { const p = at(x, 0); return [p[0], ridgeY, p[1]]; };
  const E00 = e(-eave, -eave), E10 = e(eave, -eave), E11 = e(eave, eave), E01 = e(-eave, eave);
  const R0 = r(-rl), R1 = r(rl);
  b.quad(E00, E10, R1, R0, C.thatch, 0, 0);          // 手前の面
  b.quad(E11, E01, R0, R1, shade(C.thatch, 0.88), 0, 0); // 奥の面
  b.tri(E10, E11, R1, shade(C.thatchDark, 1.02), 0, 0);  // 端の三角
  b.tri(E01, E00, R0, shade(C.thatchDark, 0.94), 0, 0);
  // 棟と軒先を厚く見せる
  b.tube([R0, R1], [0.13, 0.13], 5, C.thatchDark, 0);
  for (const [a, bb] of [[E00, E10], [E10, E11], [E11, E01], [E01, E00]] as [V3, V3][]) {
    b.tube([a, bb], [0.085, 0.085], 5, C.thatchDark, 0);
  }
  return b.build();
}

/** ハンモック。2点の間で布が垂れる */
export function hammock(a: V3, bEnd: V3, sag: number): THREE.BufferGeometry {
  const b = new Builder();
  const S = 9;
  const spine: V3[] = [];
  const widths: number[] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const y = a[1] + (bEnd[1] - a[1]) * t - Math.sin(Math.PI * t) * sag;
    spine.push([a[0] + (bEnd[0] - a[0]) * t, y, a[2] + (bEnd[2] - a[2]) * t]);
    // 端はロープに絞られ、中ほどが広い
    widths.push(0.04 + 0.40 * Math.sin(Math.PI * t));
  }
  b.ribbon(spine, widths, [0, 1, 0], C.cloth, 0.25, 0.25);
  // 吊り紐
  b.tube([a, spine[1]!], [0.018, 0.018], 4, C.rope, 0);
  b.tube([bEnd, spine[S - 1]!], [0.018, 0.018], 4, C.rope, 0);
  return b.build();
}

/** 桟橋。杭の上に板を並べただけの短い突堤 */
export function pier(from: V3, to: V3, width: number, h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const sx = -uz, sz = ux;                 // 横方向
  const deckY = Math.max(from[1], to[1]);
  const bays = Math.max(2, Math.round(len / 2.4));

  for (let i = 0; i <= bays; i++) {
    const t = i / bays;
    const cx = from[0] + ux * len * t, cz = from[2] + uz * len * t;
    for (const s of [-1, 1]) {
      const px = cx + sx * width * 0.5 * s, pz = cz + sz * width * 0.5 * s;
      const g = h(px, pz);
      b.tube([[px, g - 0.35, pz], [px, deckY - 0.10, pz]], [0.10, 0.085], 6, C.woodDark, 0);
    }
    // 根太
    const aL: V3 = [cx + sx * width * 0.5, deckY - 0.10, cz + sz * width * 0.5];
    const aR: V3 = [cx - sx * width * 0.5, deckY - 0.10, cz - sz * width * 0.5];
    b.tube([aL, aR], [0.055, 0.055], 4, C.woodDark, 0);
  }
  // 甲板の板
  const planks = Math.round(len / 0.32);
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const cx = from[0] + ux * len * t, cz = from[2] + uz * len * t;
    const k = 0.90 + ((i * 7) % 5) * 0.045;
    const half = (len / planks) * 0.42;
    // 板は進行方向に薄く、横に長い
    const a: V3 = [cx + sx * width * 0.5 + ux * half, deckY, cz + sz * width * 0.5 + uz * half];
    const bb: V3 = [cx - sx * width * 0.5 + ux * half, deckY, cz - sz * width * 0.5 + uz * half];
    const c: V3 = [cx - sx * width * 0.5 - ux * half, deckY, cz - sz * width * 0.5 - uz * half];
    const d: V3 = [cx + sx * width * 0.5 - ux * half, deckY, cz + sz * width * 0.5 - uz * half];
    b.quad(a, bb, c, d, shade(i % 2 ? C.wood : C.woodDark, k), 0, 0);
    // 板の小口。真上から見たときに厚みが出る
    b.quad([a[0], deckY - 0.05, a[2]], [bb[0], deckY - 0.05, bb[2]], bb, a, shade(C.woodDark, 0.8), 0, 0);
  }
  return b.build();
}

/** 灯台。岬の先の小さな白い塔 */
export function lighthouse(cx: number, cz: number, h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const g = h(cx, cz);
  // 石灰岩の基壇
  limestoneRun(b, [[cx - 1.5, cz - 1.5], [cx + 1.5, cz - 1.5], [cx + 1.5, cz + 1.5],
                   [cx - 1.5, cz + 1.5], [cx - 1.5, cz - 1.5]], 0.7, 0.5, () => g, 77);
  const base = g + 0.7;
  const H = 6.4;
  // 塔身。上へすぼまる
  b.tube([[cx, base, cz], [cx, base + H * 0.55, cz], [cx, base + H, cz]],
    [1.05, 0.86, 0.76], 12, C.towerWhite, 0, 0, 0.06);
  // 赤い帯
  b.tube([[cx, base + H * 0.68, cz], [cx, base + H * 0.80, cz]], [0.815, 0.795], 12, C.towerBand, 0, 0, 0.05);
  // 回廊
  b.tube([[cx, base + H, cz], [cx, base + H + 0.14, cz]], [1.02, 1.02], 12, C.lantern, 0, 0, 0.05);
  // 灯室
  b.tube([[cx, base + H + 0.14, cz], [cx, base + H + 1.15, cz]], [0.62, 0.58], 10, C.glass, 0, 0, 0.04);
  // 屋根
  b.tube([[cx, base + H + 1.15, cz], [cx, base + H + 1.75, cz]], [0.72, 0.03], 10, C.lantern, 0, 0, 0.05);
  return b.build();
}

/** 石垣そのもの（東屋のまわりに1本だけ通す） */
export function stoneWall(path: [number, number][], h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  limestoneRun(b, path, 0.78, 0.46, h, 131);
  return b.build();
}

/** 焚き火のあと。東屋のそばに、留まった気配だけ置く */
export function firePit(cx: number, cz: number, h: HeightFn): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(4242);
  const g = h(cx, cz);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3;
    const r = 0.68 + rng() * 0.10;
    b.box([cx + Math.cos(a) * r, g + 0.11, cz + Math.sin(a) * r],
      [0.15 + rng() * 0.06, 0.11, 0.13 + rng() * 0.05],
      shade(C.limestone, 0.80 + rng() * 0.25));
  }
  // 燃え残りの薪
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const d = norm([Math.cos(a), 0.55, Math.sin(a)]);
    b.tube([[cx - d[0] * 0.35, g + 0.03, cz - d[2] * 0.35],
            addv([cx, g + 0.03, cz], mul(d, 0.42))],
      [0.055, 0.04], 5, hex(0x3a3129), 0);
  }
  return b.build();
}
