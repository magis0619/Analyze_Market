// 手続きジオメトリの組み立て。植生も人工物も、外部アセットを持たずに
// ここで三角形を積んで作る。
//
// 頂点属性:
//   position / normal  ふつうの位置と法線
//   aTint  vec3   その頂点の色（sRGB 0..1）。幹と葉を1つのメッシュで塗り分ける
//   aParam vec2   x = 揺れやすさ 0..1、y = 葉らしさ 0..1（照明の当て方が変わる）

import * as THREE from 'three';

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: V3, b: V3, t: number): V3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const cross3 = (a: V3, b: V3): V3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** sRGB の16進 → 0..1 の3成分 */
export function hex(h: number): V3 {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

/** 色を少し明暗させる（同じ株の中の面ごとの差） */
export function shade(c: V3, k: number): V3 {
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

export class Builder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private tint: number[] = [];
  private param: number[] = [];

  get triangleCount(): number { return this.pos.length / 9; }

  /** 面法線で三角形を1枚積む */
  tri(a: V3, b: V3, c: V3, col: V3, sway: number, leaf: number, n?: V3): void {
    const nn = n ?? norm(cross(sub(b, a), sub(c, a)));
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(nn[0], nn[1], nn[2]);
      this.tint.push(col[0], col[1], col[2]);
      this.param.push(sway, leaf);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, col: V3, sway: number, leaf: number): void {
    this.tri(a, b, c, col, sway, leaf);
    this.tri(a, c, d, col, sway, leaf);
  }

  /**
   * 折れ線に沿ったテーパー付きの筒。幹・枝・気根に使う。
   * sway は根元 0 → 先端 swayTip で線形に上げる。
   */
  tube(path: V3[], radii: number[], sides: number, col: V3, swayTip: number, leaf = 0,
       colJitter = 0.10): void {
    if (path.length < 2) return;
    const rings: V3[][] = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i]!;
      const fwd = norm(sub(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(i - 1, 0)]!));
      // 進行方向に垂直な基底
      const up: V3 = Math.abs(fwd[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = norm(cross(fwd, up));
      const v = norm(cross(fwd, u));
      const r = radii[i] ?? radii[radii.length - 1]!;
      const ring: V3[] = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        ring.push(addv(p, addv(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const t0 = i / (rings.length - 1), t1 = (i + 1) / (rings.length - 1);
      for (let s = 0; s < sides; s++) {
        const s1 = (s + 1) % sides;
        // 輪ごとに明暗を変える。幹の節・葉痕として読ませたいので、
        // 面ごとにばらけさせず、同じ高さは同じ明るさに揃える
        const k = 1 - colJitter * 0.5 + colJitter * (((i * 5) % 7) / 6);
        const c = shade(col, k);
        this.quad(rings[i]![s]!, rings[i]![s1]!, rings[i + 1]![s1]!, rings[i + 1]![s]!,
          c, swayTip * ((t0 + t1) * 0.5), leaf);
      }
    }
  }

  /**
   * 芯線に沿った平たいリボン。葉・葉身に使う。
   * widths は芯線と同じ長さ。up は葉の面の向き。
   */
  ribbon(path: V3[], widths: number[], up: V3, col: V3, swayBase: number, swayTip: number,
         tipCol?: V3): void {
    if (path.length < 2) return;
    const left: V3[] = [], right: V3[] = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i]!;
      const fwd = norm(sub(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(i - 1, 0)]!));
      const side = norm(cross(fwd, norm(up)));
      const w = widths[i] ?? 0;
      left.push(addv(p, mul(side, w)));
      right.push(addv(p, mul(side, -w)));
    }
    for (let i = 0; i < path.length - 1; i++) {
      const t = i / (path.length - 1);
      const sw = swayBase + (swayTip - swayBase) * t;
      const c = tipCol ? [
        col[0] + (tipCol[0] - col[0]) * t,
        col[1] + (tipCol[1] - col[1]) * t,
        col[2] + (tipCol[2] - col[2]) * t
      ] as V3 : col;
      this.quad(left[i]!, left[i + 1]!, right[i + 1]!, right[i]!, c, sw, 1);
    }
  }

  /** 塊。低木の葉群や花の房に使う */
  blob(center: V3, r: V3, detail: number, col: V3, sway: number, leaf: number,
       jitter: (i: number) => number = () => 1): void {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      const vs: V3[] = [];
      for (let k = 0; k < 3; k++) {
        const j = jitter(i + k);
        vs.push([
          center[0] + p.getX(i + k) * r[0] * j,
          center[1] + p.getY(i + k) * r[1] * j,
          center[2] + p.getZ(i + k) * r[2] * j
        ]);
      }
      const kk = 0.88 + 0.24 * (((i / 3) % 7) / 6);
      this.tri(vs[0]!, vs[1]!, vs[2]!, shade(col, kk), sway, leaf);
    }
    g.dispose();
  }

  /** 直方体。板・柱・石に使う */
  box(center: V3, half: V3, col: V3, sway = 0, leaf = 0): void {
    const [cx, cy, cz] = center, [hx, hy, hz] = half;
    const v = (sx: number, sy: number, sz: number): V3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];
    const faces: [V3, V3, V3, V3, number][] = [
      [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1), 1.10],   // 上
      [v(-1, -1, 1), v(1, -1, 1), v(1, -1, -1), v(-1, -1, -1), 0.62], // 下
      [v(-1, -1, 1), v(-1, 1, 1), v(1, 1, 1), v(1, -1, 1), 0.94],
      [v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), v(-1, -1, -1), 0.86],
      [v(1, -1, 1), v(1, 1, 1), v(1, 1, -1), v(1, -1, -1), 1.00],
      [v(-1, -1, -1), v(-1, 1, -1), v(-1, 1, 1), v(-1, -1, 1), 0.80]
    ];
    for (const [a, b, c, d, k] of faces) this.quad(a, b, c, d, shade(col, k), sway, leaf);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(this.tint), 3));
    g.setAttribute('aParam', new THREE.BufferAttribute(new Float32Array(this.param), 2));
    g.computeBoundingSphere();
    return g;
  }
}
