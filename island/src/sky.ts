// 指示書 §3。空は手続き生成のスカイドーム1枚で、時刻パラメータだけで
// 夜明けから夜まで回す。星は乱数の3D単位ベクトルを Points に詰めて GPU へ送る。

import * as THREE from 'three';
import { COMMON, SKY } from './glsl/lib';
import type { Env } from './env';
import { makeRng } from './noise';

export function createSky(env: Env): THREE.Group {
  const group = new THREE.Group();

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: COMMON + SKY + /* glsl */ `
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir), 1.0), 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 32), mat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  group.add(dome);
  group.add(createStars(env));
  return group;
}

/** 星。ランダムな3D単位ベクトル + サイズ・色を属性に詰めて一括描画する。 */
function createStars(env: Env): THREE.Points {
  const N = 2600;
  const rng = makeRng(0x5eed57a7);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    // 一様な単位ベクトル
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const R = 8600;
    pos[i * 3] = Math.cos(a) * r * R;
    pos[i * 3 + 1] = z * R;
    pos[i * 3 + 2] = Math.sin(a) * r * R;

    // 明るさは指数分布気味にして、少数の明るい星を作る
    const b = Math.pow(rng(), 3.2);
    size[i] = 1.1 + b * 3.2;
    // 色温度をばらす（青白い星と橙の星）
    const t = rng();
    const cr = 0.72 + t * 0.30, cg = 0.80 + (1 - Math.abs(t - 0.5) * 2) * 0.16, cb = 1.05 - t * 0.35;
    const k = 0.35 + b * 0.75;
    col[i * 3] = cr * k; col[i * 3 + 1] = cg * k; col[i * 3 + 2] = cb * k;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uSunElev;
      uniform float uWeather;
      uniform float uPixelRatio;
      varying vec3 vCol;
      void main() {
        // 空がまだ明るいうちは見えない。薄明が終わってから出す
        float night = smoothstep(-0.05, -0.24, uSunElev);
        vCol = aColor * night * (1.0 - uWeather * 0.9);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        float a = exp(-r * 4.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol * a, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -99;
  pts.frustumCulled = false;
  return pts;
}
