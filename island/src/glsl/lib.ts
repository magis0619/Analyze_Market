// シェーダ共通チャンク。空の色は「空・水面の反射・大気遠近」の3か所で
// 同じ関数を使いたいので、文字列として切り出して各マテリアルに注入する。

/** 定数・色空間・ノイズ */
export const COMMON = /* glsl */ `
const float PI = 3.141592653589793;

// 色は sRGB の 16進で決め打ちしたいので、シェーダ内で線形に直す。
// （レンダラの outputColorSpace が sRGB なので、線形で出せば指定通りの色で出る）
vec3 sRGB(vec3 c) { return pow(c, vec3(2.2)); }
vec3 sRGB(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.875;
}

float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s / 0.969;
}

/** 尾根状（岩肌に使う） 0..1 */
float ridge3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    float n = 1.0 - abs(vnoise(p));
    s += a * n * n; p *= 2.11; a *= 0.5;
  }
  return s / 0.875;
}

float sat(float x) { return clamp(x, 0.0, 1.0); }

vec3 desaturate(vec3 c, float amount) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(l), amount);
}
`;

/**
 * 空。指示書 §3 の「密度・光度・トワイライトの3勾配を掛け合わせる」方式。
 *  - 密度勾配   : 地平線に近いほど大気が厚い → 明るく白っぽい
 *  - 光度勾配   : 太陽方向にどれだけ近いか
 *  - トワイライト: 密度 × 光度。太陽高度が0付近のときだけ強く出す
 */
export const SKY = /* glsl */ `
uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform float uSunElev;      // sunDir.y
uniform float uDay;          // 0=夜 1=昼
uniform vec3  uZenith;
uniform vec3  uSkyMid;
uniform vec3  uHorizon;
uniform vec3  uNightZenith;
uniform vec3  uNightHorizon;
uniform vec3  uTwilightCol;
uniform vec3  uSunGlow;
uniform vec3  uSunColor;
uniform vec3  uMoonColor;
uniform float uWeather;      // 0=快晴 1=曇天
uniform float uCloudCover;
uniform float uCloudTime;

/** 雲。高い平面との交点で fbm を引く（薄い巻雲を主にする） */
float cloudField(vec3 dir, out float thick) {
  thick = 0.0;
  if (dir.y < 0.006) return 0.0;
  float t = 1800.0 / dir.y;
  vec2 p = dir.xz * t * 0.00085;
  p += vec2(uCloudTime * 0.012, uCloudTime * 0.004);
  // 巻雲: 一方向に引き伸ばす
  float wisp = fbm5(vec2(p.x * 0.42, p.y * 1.9));
  // 積雲: 等方の塊。曇天ほど比率を上げる
  float puff = fbm5(p * 1.25 + 17.0);
  float f = mix(wisp, puff * 0.85 + 0.15 * wisp, sat(uWeather * 1.15));
  f = f * 0.5 + 0.5;
  float cov = uCloudCover;
  float a = smoothstep(1.0 - cov, 1.0 - cov + 0.30, f);
  thick = smoothstep(1.0 - cov, 1.0 - cov + 0.55, f);
  // 地平線際は雲が視線方向に潰れるのでフェード
  a *= smoothstep(0.006, 0.10, dir.y);
  return a;
}

vec3 skyColor(vec3 dir, float withDisc) {
  float y = clamp(dir.y, -1.0, 1.0);
  float up = max(y, 0.0);

  // --- 密度勾配 ---
  // 実写の空は、地平線のすぐ上まで赤がほとんど乗らない。
  // 白っぽい霞みは指数を大きくして地平線際に押し込む。
  float dMid = pow(1.0 - up, 2.0);
  float dHaze = pow(1.0 - up, 13.0);

  vec3 zen = mix(uNightZenith, uZenith, uDay);
  vec3 hor = mix(uNightHorizon, uHorizon, uDay);
  vec3 mid = mix(uNightZenith * 1.35 + uNightHorizon * 0.25, uSkyMid, uDay);

  vec3 col = mix(zen, mid, dMid);
  col = mix(col, hor, dHaze);

  // 水平線より下（水面反射の逆引きで来る）は地平線色を薄暗く
  col = mix(col, hor * 0.55, smoothstep(0.0, -0.12, y));

  // --- 光度勾配 ---
  float mu = max(dot(dir, uSunDir), 0.0);
  float glow = pow(mu, 6.0) * 0.30 + pow(mu, 60.0) * 0.55;
  col += uSunGlow * glow * uDay * (1.0 - uWeather * 0.75);

  // --- トワイライト（密度 × 光度）---
  float tw = exp(-pow(uSunElev / 0.16, 2.0));
  float twMask = sat(dHaze * 1.1 + pow(mu, 3.0) * 0.85) * tw;
  col = mix(col, uTwilightCol, sat(twMask * 0.80));

  // --- 太陽・月の円盤 ---
  if (withDisc > 0.5) {
    float sd = dot(dir, uSunDir);
    float disc = smoothstep(0.99965, 0.99988, sd);
    col += uSunColor * disc * 9.0 * smoothstep(-0.10, 0.02, uSunElev) * (1.0 - uCloudCover * 0.55);

    float md = dot(dir, uMoonDir);
    // 月は光度勾配を反転して（＝より鋭く）強調する
    float mglow = pow(max(md, 0.0), 220.0);
    float mdisc = smoothstep(0.99958, 0.99980, md);
    col += uMoonColor * (mdisc * 2.2 + mglow * 0.30) * (1.0 - uDay);
  }

  // --- 雲 ---
  float thick;
  float ca = cloudField(dir, thick);
  if (ca > 0.001) {
    // 太陽側は明るく、厚い部分は影
    float lit = sat(dot(normalize(dir + uSunDir * 0.35), uSunDir) * 0.5 + 0.5);
    vec3 bright = mix(sRGB(228.0, 236.0, 246.0), uSunColor * 1.15, 0.25 * uDay);
    vec3 shade = mix(sRGB(150.0, 166.0, 184.0), uTwilightCol * 0.9, tw * 0.7);
    vec3 cc = mix(shade, bright, mix(lit, 1.0, 0.35));
    cc = mix(cc, cc * 0.55, uWeather * 0.65);
    cc *= mix(0.10, 1.0, uDay);
    col = mix(col, cc, ca * mix(0.72, 0.97, thick));
  }

  // --- 天候（彩度を落として暗くするだけ。§3 の軽量な処理）---
  col = desaturate(col, uWeather * 0.55);
  col *= mix(1.0, 0.55, uWeather);
  return col;
}
`;

/** 大気遠近。フォグ色は視線方向の空の色そのものにして水平線を溶かす */
export const FOG = /* glsl */ `
uniform float uFogDensity;
vec3 applyFog(vec3 col, float dist, vec3 dir) {
  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  vec3 fogCol = skyColor(normalize(dir), 0.0);
  return mix(col, fogCol, sat(f));
}
`;
