// 海底の高さ・岩がち度をテクスチャから引く。水と地形で同じ関数を使う。
export const FIELD = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uFieldRect;   // (原点x, 原点z, 1/幅, 1/奥行き)
uniform float uFieldDeep;

/** x=高さ(m, 海面=0) y=岩がち度 0..1 */
vec2 fieldAt(vec2 xz) {
  vec2 uv = (xz - uFieldRect.xy) * uFieldRect.zw;
  vec2 cl = clamp(uv, 0.0, 1.0);
  vec2 t = texture2D(uField, cl).rg;
  // グリッド外は一様な深海として扱う
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(uFieldDeep, 1.0);
  return vec2(t.r * 8.0, t.g);
}

/** 海底の色。浅瀬に透けて見える岩・珊瑚の模様はここで作る。 */
vec3 seabedAlbedo(vec2 xz, float rock) {
  // 水中の砂は乾いた砂より暗い。ここを明るくしすぎると浅瀬が白く飛ぶ。
  vec3 sand  = sRGB(214.0, 208.0, 192.0);
  vec3 coral = sRGB(88.0, 100.0, 78.0);
  vec3 dark  = sRGB(46.0, 56.0, 50.0);
  float n = fbm5(xz * 0.055) * 0.5 + 0.5;
  float fine = fbm3(xz * 0.42) * 0.5 + 0.5;
  float m = sat(rock * (0.55 + 0.95 * n));
  vec3 c = mix(sand, coral, smoothstep(0.10, 0.52, m));
  c = mix(c, dark, smoothstep(0.62, 1.0, m));
  // 砂紋。浅瀬に模様が無いと、澄んだ水ではなく白い靄に見えてしまう。
  // 汀線に平行な縞を主にして、細かい粒を重ねる。
  float ripple = fbm3(xz * vec2(0.55, 2.6)) * 0.5 + 0.5;
  c *= 1.0 + 0.26 * (ripple - 0.5) + 0.16 * (fine - 0.5) + 0.07 * fbm3(xz * 3.1);
  return c;
}
`;
