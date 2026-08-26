// 岩肌用の手続きテクスチャ。外部アセットを持たない方針なので、
// タイル可能な値ノイズから石材のアルベドと法線マップをその場で焼く。

import * as THREE from 'three';
import { makeRng } from './noise';

/** 周期 P で繰り返す値ノイズ（タイリングのため整数座標を wrap する） */
function periodicNoise(P: number, seed: number) {
  const rng = makeRng(seed);
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (ix: number, iy: number) => g[((iy % P) + P) % P * P + (((ix % P) + P) % P)] ?? 0;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };
}

function stoneHeight(size: number): Float32Array {
  const layers = [
    { p: 4, s: 101, a: 1.0 },
    { p: 8, s: 202, a: 0.55 },
    { p: 16, s: 303, a: 0.30 },
    { p: 32, s: 404, a: 0.17 },
    { p: 64, s: 505, a: 0.10 }
  ].map(l => ({ ...l, n: periodicNoise(l.p, l.s) }));

  const out = new Float32Array(size * size);
  let norm = 0;
  for (const l of layers) norm += l.a;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const l of layers) {
        const u = (x / size) * l.p, w = (y / size) * l.p;
        // 尾根状にして、割れ目のある岩肌にする
        v += l.a * (1 - Math.abs(l.n(u, w) * 2 - 1));
      }
      out[y * size + x] = v / norm;
    }
  }
  return out;
}

export type StoneTextures = { map: THREE.DataTexture; normalMap: THREE.DataTexture };

export function makeStoneTextures(size = 256): StoneTextures {
  const h = stoneHeight(size);
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y % size) + size) % size * size + (((x % size) + size) % size)] ?? 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = at(x, y);
      // 琉球石灰岩。白っぽくて多孔質なので、明るい地に暗い孔を穿つ
      let base = 0.58 + v * 0.40;
      // 孔（ポア）。小さく暗い窪みを散らす
      const pore = at(x * 1 + 3, y * 1 + 7);
      if (pore > 0.72) base *= 0.62 + (pore - 0.72) * 0.9;
      albedo[i] = Math.round(255 * Math.min(1, base * 1.00));
      albedo[i + 1] = Math.round(255 * Math.min(1, base * 0.975));
      albedo[i + 2] = Math.round(255 * Math.min(1, base * 0.905));
      albedo[i + 3] = 255;

      const dx = (at(x + 1, y) - at(x - 1, y)) * 5.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 5.5;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      normal[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }

  const mk = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(albedo), normalMap: mk(normal) };
}
