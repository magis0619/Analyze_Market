// 決定論的なノイズ一式。地形と配置は毎回同じ島になってほしいので、
// Math.random は使わずシード付きの hash から作る。

/** 32bit 整数シードから 0..1 の乱数を返す（mulberry32） */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** 値ノイズ。-1..1 */
export function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return (top + (bot - top) * fy) * 2 - 1;
}

/** 重ね合わせノイズ。-1..1 付近 */
export function fbm(x: number, y: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** 尾根状ノイズ。岩がちな稜線に使う。0..1 */
export function ridged(x: number, y: number, octaves = 4): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * freq, y * freq));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
