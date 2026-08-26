// 焼いた高さ場からメッシュと、水シェーダが参照する深度テクスチャを作る。

import * as THREE from 'three';
import { COMMON, SKY, FOG } from './glsl/lib';
import { FIELD } from './glsl/field';
import { bakeField, BOUNDS, CELL, COLS, ROWS, DEEP, type Field } from './heightfield';
import { makeStoneTextures } from './textures';
import type { Env } from './env';

export type TerrainResult = { mesh: THREE.Mesh; field: Field };

/** 高さ場を RG16F のテクスチャに詰める（R=高さ/8, G=岩がち度） */
function fieldTexture(field: Field): THREE.DataTexture {
  const data = new Uint16Array(COLS * ROWS * 2);
  for (let i = 0; i < COLS * ROWS; i++) {
    data[i * 2] = THREE.DataUtils.toHalfFloat((field.height[i] ?? DEEP) / 8);
    data[i * 2 + 1] = THREE.DataUtils.toHalfFloat(field.rock[i] ?? 0);
  }
  const tex = new THREE.DataTexture(data, COLS, ROWS, THREE.RGFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrain(env: Env): TerrainResult {
  const field = bakeField();

  // --- 深度テクスチャを共有ユニフォームに載せる ---
  env.uniforms.uField = { value: fieldTexture(field) };
  env.uniforms.uFieldRect = {
    value: new THREE.Vector4(
      BOUNDS.x0 - CELL * 0.5, BOUNDS.z0 - CELL * 0.5,
      1 / (CELL * COLS), 1 / (CELL * ROWS)
    )
  };
  env.uniforms.uFieldDeep = { value: DEEP };

  // --- ジオメトリ ---
  const count = COLS * ROWS;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const rockAttr = new Float32Array(count);
  const h = field.height;
  const hAt = (i: number, j: number) => h[
    Math.min(ROWS - 1, Math.max(0, j)) * COLS + Math.min(COLS - 1, Math.max(0, i))
  ] ?? DEEP;

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const k = j * COLS + i;
      pos[k * 3] = BOUNDS.x0 + i * CELL;
      pos[k * 3 + 1] = h[k] ?? DEEP;
      pos[k * 3 + 2] = BOUNDS.z0 + j * CELL;
      const dx = hAt(i + 1, j) - hAt(i - 1, j);
      const dz = hAt(i, j + 1) - hAt(i, j - 1);
      const nx = -dx, nz = -dz, ny = 2 * CELL;
      const len = Math.hypot(nx, ny, nz);
      nrm[k * 3] = nx / len; nrm[k * 3 + 1] = ny / len; nrm[k * 3 + 2] = nz / len;
      rockAttr[k] = field.rock[k] ?? 0;
    }
  }

  const idx = new Uint32Array((COLS - 1) * (ROWS - 1) * 6);
  let p = 0;
  for (let j = 0; j < ROWS - 1; j++) {
    for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i, b = a + 1, c = a + COLS, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = d;
      idx[p++] = a; idx[p++] = d; idx[p++] = b;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rockAttr, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const stone = makeStoneTextures(256);
  env.uniforms.uStone = { value: stone.map };
  env.uniforms.uStoneN = { value: stone.normalMap };

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float aRock;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vRock;
      void main() {
        vWorld = position;
        vNormal = normal;
        vRock = aRock;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: COMMON + SKY + FIELD + FOG + /* glsl */ `
      uniform vec3 uCamPos;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyLight;
      uniform vec3 uSunLight;
      uniform vec3 uAmbLight;
      uniform sampler2D uStone;
      uniform sampler2D uStoneN;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vRock;

      void main() {
        vec3 N = normalize(vNormal);
        vec2 xz = vWorld.xz;
        float dist = distance(uCamPos, vWorld);
        float slope = 1.0 - sat(N.y);
        float n1 = fbm5(xz * 0.030);
        float n2 = fbm3(xz * 0.19);

        // --- 岩（石材テクスチャ + 法線マップ）---
        // 平らな面は上からの投影、急斜面は横からの投影で貼る
        // 1周期を大きめに取る。細かく貼るとグレージング角でモアレが出る
        vec2 uvTop = xz * 0.042;
        vec2 uvSide = vec2((xz.x + xz.y) * 0.030, vWorld.y * 0.055);
        float flat_ = sat(N.y * N.y);
        vec3 stoneTop = texture2D(uStone, uvTop).rgb;
        vec3 stoneSide = texture2D(uStone, uvSide).rgb;
        vec3 stoneN = texture2D(uStoneN, mix(uvSide, uvTop, flat_)).rgb * 2.0 - 1.0;
        float stoneV = mix(stoneSide.r, stoneTop.r, flat_);
        // 琉球石灰岩。白っぽい地に、割れ目と孔が暗く落ちる
        vec3 rockCol = sRGB(206.0, 197.0, 174.0) * (0.42 + 0.76 * stoneV);
        rockCol = mix(rockCol, sRGB(120.0, 114.0, 98.0), sat(0.30 + 0.45 * n2));

        // --- 白砂 ---
        // 平坦な単色だと作り物に見えるので、風紋くらいの起伏を色と法線に入れる
        float dune = fbm3(xz * vec2(0.62, 0.20)) * 0.5 + 0.5;
        float grain = fbm3(xz * 2.7) * 0.5 + 0.5;
        vec3 sandCol = sRGB(252.0, 228.0, 213.0) * (0.978 + 0.026 * dune + 0.020 * grain + 0.020 * n2);

        // --- 緑 ---
        // 一様な緑は嘘くさいので、低木の濃い緑と草地の明るい緑を斑に混ぜる
        float vmix = sat(0.5 + 0.5 * n1 + 0.28 * n2);
        vec3 vegCol = mix(sRGB(40.0, 74.0, 34.0), sRGB(100.0, 126.0, 58.0), vmix);
        vegCol = mix(vegCol, sRGB(62.0, 98.0, 44.0), sat(fbm3(xz * 0.11) * 0.5 + 0.5));

        // 海際は波に洗われて岩が出る。高いところは土が乗って緑に覆われる。
        // 参考画像の岬はどれも緑が濃く、白い石灰岩が覗くのは波打ち際だけ。
        float seaCliff = smoothstep(0.26, 0.60, slope) * (1.0 - smoothstep(2.0, 13.0, vWorld.y));
        float highGreen = 1.0 - smoothstep(6.0, 20.0, vWorld.y) * 0.78;
        float rockM = sat(smoothstep(0.46, 0.92, slope) * highGreen
                        + seaCliff + smoothstep(0.88, 1.0, vRock) * 0.30 * highGreen);
        // しきい値のほうを揺らす。高さに直接ノイズを足すと、平らな砂浜にまで
        // 緑が滲み出して浜が茶色くなる
        // 浜と砂丘は砂のまま残す。中途半端に緑を混ぜると泥の色になる
        float vegM = (1.0 - rockM * 0.45) * smoothstep(4.6 + n1 * 1.7, 8.6 + n1 * 1.7, vWorld.y);

        // 緑が茂っているところは、多少斜面でも土と草が岩を覆う
        rockM *= 1.0 - sat(vegM) * 0.55;
        vec3 albedo = mix(sandCol, vegCol, sat(vegM));
        albedo = mix(albedo, rockCol, sat(rockM));

        // 水面下は海底の色に合わせる（水シェーダと同じ関数）
        float sub = smoothstep(0.05, -0.35, vWorld.y);
        albedo = mix(albedo, seabedAlbedo(xz, vRock), sub);

        // --- 濡れた砂 ---
        // 波が寄せるところまでは色が濃くなる
        // 濡れているのは寄せ波が届くところだけ。ここを広げると浜全体が
        // くすんで、参考画像の白い砂にならない。
        float wet = (1.0 - smoothstep(0.02, 0.30, vWorld.y)) * (1.0 - rockM);
        albedo *= mix(1.0, 0.72, wet);

        // --- 法線に岩の凹凸を足す ---
        float near = 1.0 - smoothstep(60.0, 260.0, dist);
        vec3 Np = normalize(N + vec3(stoneN.x, 0.0, stoneN.y) * rockM * 0.85 * near);
        // 砂の風紋（法線だけ動かす。高さは動かさない）
        float sandM = (1.0 - rockM) * (1.0 - sat(vegM)) * near;
        vec2 se = vec2(0.35, 0.0);
        float d0 = fbm3(xz * vec2(0.62, 0.20));
        Np = normalize(Np + vec3(
          (fbm3((xz + se.xy) * vec2(0.62, 0.20)) - d0) * 3.2,
          0.0,
          (fbm3((xz + se.yx) * vec2(0.62, 0.20)) - d0) * 3.2) * sandM * 0.16);

        // --- 照明 ---
        float ndl = sat(dot(Np, uKeyDir));
        vec3 col = albedo * (uKeyLight * ndl + uAmbLight * (0.45 + 0.55 * sat(Np.y)));
        // 濡れた砂のてかり
        vec3 V = normalize(uCamPos - vWorld);
        vec3 H = normalize(uKeyDir + V);
        col += uSunColor * pow(sat(dot(Np, H)), 60.0) * wet * 0.35 * (0.12 + 0.88 * uDay);

        col = applyFog(col, dist, vWorld - uCamPos);
        col = desaturate(col, uWeather * 0.45);
        gl_FragColor = vec4(grade(col), 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, field };
}
