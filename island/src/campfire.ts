// 指示書 §5。焚き火は東屋のそばに常設し、時刻を直接判定するのではなく
// §3 のスカイボックスで使っている光度パラメータ（env.uniforms.uDay）と
// 連動させる。空が暗くなるほど火が自然に強まり、夜明けとともに燃え尽きる
// ように弱まりながら消えていく（duskFactor / uFireGlow の計算は env.ts）。
//
// この作品の地形・水・植生はどれも three.js のシーンライトを一切参照しない
// 自前の ShaderMaterial で描いている。そのため、実体としての
// THREE.PointLight（指示書のオブジェクト階層に合わせて置いている）は
// 現状どのマテリアルにも影響しない。周囲の砂・葉が実際に暖色で照らされる
// 見た目は、env.uniforms.uFireBounce を terrain / foliage のフラグメント
// シェーダに足す形で作っている（そちらが実質の「波及光」）。

import * as THREE from 'three';
import { COMMON } from './glsl/lib';
import { makeRng } from './noise';
import type { Env } from './env';

export type Campfire = { group: THREE.Group; update: () => void };

/** 炎の3層。指示書の表のとおり、芯ほど低く・明るく・揺れない */
const FLAME_LAYERS = [
  { r: 0.11, h: 0.50, sway: 0.010, seg: 6, noisy: false, color: [255, 226, 140] as const },
  { r: 0.19, h: 0.80, sway: 0.045, seg: 7, noisy: false, color: [255, 150, 60] as const },
  { r: 0.28, h: 1.10, sway: 0.095, seg: 8, noisy: true, color: [230, 86, 40] as const }
];

function flameMaterial(
  env: Env, height: number, sway: number, noisy: boolean, c: readonly [number, number, number]
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vHeight;
      void main() {
        vec3 p = position;
        // 根元は動かさず、先端ほど大きく揺らす（芯はほぼ揺れない）
        float t = clamp(p.y / ${height.toFixed(3)}, 0.0, 1.0);
        float amt = ${sway.toFixed(4)} * t * t;
        p.x += sin(uTime * 3.0 + p.y * 5.0) * amt;
        p.z += cos(uTime * 2.3 + p.y * 4.0) * amt;
        ${noisy ? 'p.x += sin(uTime * 7.1 + p.y * 11.0) * amt * 0.4;\n        p.z += cos(uTime * 6.3 + p.y * 9.0) * amt * 0.4;' : ''}
        vHeight = t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: COMMON + /* glsl */ `
      uniform float uFireGlow;
      varying float vHeight;
      void main() {
        vec3 base = sRGB(${c[0].toFixed(1)}, ${c[1].toFixed(1)}, ${c[2].toFixed(1)});
        // 先端ほど透け、芯（根元）がいちばん濃い
        float fade = 1.0 - smoothstep(0.45, 1.0, vHeight);
        float a = fade * uFireGlow;
        if (a < 0.012) discard;
        gl_FragColor = vec4(grade(base * (0.75 + 0.35 * fade)), a);
      }
    `
  });
}

function buildFlames(env: Env): THREE.Group {
  const group = new THREE.Group();
  for (const layer of FLAME_LAYERS) {
    const geo = new THREE.ConeGeometry(layer.r, layer.h, layer.seg, 5, true);
    geo.translate(0, layer.h / 2, 0);
    const mesh = new THREE.Mesh(geo, flameMaterial(env, layer.h, layer.sway, layer.noisy, layer.color));
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/**
 * 火の粉。「密度より、たまに1粒跳ねる疎さ」を狙う。粒ごとに独立した周期と
 * 位相を持たせ、周期の前半だけ立ち上って後半は次の周期まで透明にしておく。
 */
function buildEmbers(env: Env): THREE.Points {
  const N = 18;
  const rng = makeRng(0xe3b5a1);
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.20;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.18 + rng() * 0.14;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying float vRise;
      void main() {
        float period = 2.6 + aSeed * 3.4;
        float phase = fract(uTime / period + aSeed * 11.7);
        // 周期の前半（0..0.55）だけ火の粉として立ち、残りは次を待つ
        float u = clamp(phase / 0.55, 0.0, 1.0);
        float spawned = step(phase, 0.55);
        vec3 p = position;
        p.y += u * (0.65 + aSeed * 0.75);
        p.x += sin(uTime * 3.1 + aSeed * 40.0) * 0.06 * u;
        p.z += cos(uTime * 2.6 + aSeed * 23.0) * 0.06 * u;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sparkle = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.4, 1.0, u));
        vAlpha = sparkle * spawned;
        vRise = u;
        gl_PointSize = mix(6.0, 1.4, u) * uPixelRatio;
      }
    `,
    fragmentShader: COMMON + /* glsl */ `
      uniform float uFireGlow;
      varying float vAlpha;
      varying float vRise;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        float a = exp(-r * 4.0) * vAlpha * uFireGlow;
        if (a < 0.01) discard;
        vec3 col = mix(sRGB(255.0, 210.0, 110.0), sRGB(255.0, 90.0, 40.0), vRise);
        gl_FragColor = vec4(grade(col), a);
      }
    `
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 21;
  pts.frustumCulled = false;
  return pts;
}

/**
 * 消えかけの煙。普段はほぼ見えず、鎮火直前（uSmokeGlow、夜明け側の遷移）
 * だけ薄く強調する。カメラのほうを向く簡易ビルボードを3枚。
 */
function smokeWisp(env: Env, seed: number): THREE.Mesh {
  const period = 7.0 + seed * 4.0;
  const phase0 = seed * 5.3;
  const baseX = (seed - 0.5) * 0.5;
  const baseZ = (((seed * 3.1) % 1) - 0.5) * 0.5;
  const wobblePhase = seed * 9.0;

  const geo = new THREE.PlaneGeometry(0.55, 1.5, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        float u = fract(uTime / ${period.toFixed(3)} + ${phase0.toFixed(3)});
        // 画面のほうを向く簡易ビルボード（モデルビュー行列から軸を取り出す）
        vec3 right = vec3(modelViewMatrix[0].x, modelViewMatrix[1].x, modelViewMatrix[2].x);
        vec3 up    = vec3(modelViewMatrix[0].y, modelViewMatrix[1].y, modelViewMatrix[2].y);
        float scale = mix(0.30, 0.85, u);
        vec3 base = vec3(${baseX.toFixed(3)}, 0.55 + u * 1.5, ${baseZ.toFixed(3)});
        vec3 wobble = right * sin(uTime * 0.6 + ${wobblePhase.toFixed(3)}) * 0.18 * u;
        vec3 local = base + wobble + right * position.x * scale + up * (position.y * 0.5 + 0.5) * scale;
        vec4 mv = modelViewMatrix * vec4(local, 1.0);
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vFade = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.55, 1.0, u));
      }
    `,
    fragmentShader: COMMON + /* glsl */ `
      uniform float uSmokeGlow;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vec2 d = (vUv - 0.5) * vec2(2.0, 1.05);
        float edge = 1.0 - smoothstep(0.5, 1.0, length(d));
        float a = edge * vFade * 0.28 * uSmokeGlow;
        if (a < 0.006) discard;
        gl_FragColor = vec4(grade(sRGB(150.0, 145.0, 138.0)), a);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 19;
  mesh.frustumCulled = false;
  return mesh;
}

/** 焚き火まわりの動的な部分（炎・火の粉・煙・光）をまとめて作る。 */
export function createCampfire(env: Env): Campfire {
  const group = new THREE.Group();
  group.add(buildFlames(env));
  group.add(buildEmbers(env));

  const rng = makeRng(0x5a0c31);
  for (let i = 0; i < 3; i++) group.add(smokeWisp(env, rng()));

  // 指示書のオブジェクト階層に合わせて置く FireLight。上のコメントの
  // とおり、現状のカスタムシェーダ群には効かない（波及光は uFireBounce
  // 側で実装済み）。将来 MeshStandardMaterial 等を足したときのために
  // 実体だけは用意しておく。
  const light = new THREE.PointLight(0xff8c3c, 0, 6, 2);
  light.position.set(0, 0.45, 0);
  group.add(light);

  const BASE_INTENSITY = 3.2;
  const update = () => {
    light.intensity = (env.uniforms.uFireGlow!.value as number) * BASE_INTENSITY;
  };

  return { group, update };
}
