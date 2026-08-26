// 指示書 §2。水の見た目は「海底までの深さ」ひとつから作る。
// 深さ → 吸光と散乱 → ターコイズ〜紺のグラデーション、というのが核で、
// 泡・屈折・浅瀬の模様も同じ深さの値から派生させている。

import * as THREE from 'three';
import { COMMON, SKY, FOG } from './glsl/lib';
import { FIELD } from './glsl/field';
import type { Env } from './env';

/**
 * 極座標グリッド。中心（湾）ほど密で、水平線（8km 先）に向かって粗くなる。
 * 平面を一様に割ると、手前が粗いのに沖が無駄に細かくなる。
 */
function polarGrid(rings: number, sectors: number, rMax: number): THREE.BufferGeometry {
  const k = 4.45;
  const C = rMax / (Math.exp(k) - 1);
  const count = (rings + 1) * sectors;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i <= rings; i++) {
    const r = C * (Math.exp((k * i) / rings) - 1);
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const o = (i * sectors + s) * 3;
      pos[o] = Math.cos(a) * r;
      pos[o + 1] = 0;
      pos[o + 2] = Math.sin(a) * r;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < sectors; s++) {
      const s1 = (s + 1) % sectors;
      const a = i * sectors + s, b = i * sectors + s1;
      const c = (i + 1) * sectors + s, d = (i + 1) * sectors + s1;
      // 上から見て表になる巻き方（裏返すと水面が丸ごと背面カリングで消える）
      idx.push(a, d, c, a, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), rMax * 1.05);
  return geo;
}

const GERSTNER = /* glsl */ `
// 4本の Gerstner 波を重ねる。振幅は水深で減衰させ、浜に近いほど平らにする。
uniform float uWaveAmp;
uniform vec4  uWave0;   // (dirX, dirZ, 波長, 尖り)
uniform vec4  uWave1;
uniform vec4  uWave2;
uniform vec4  uWave3;

void gerstner(vec4 w, vec2 xz, float t, float amp, inout vec3 disp, inout vec3 tanX, inout vec3 tanZ) {
  vec2 d = normalize(w.xy);
  float kk = 6.2831853 / w.z;
  float c = sqrt(9.81 / kk);
  float f = kk * (dot(d, xz) - c * t);
  float a = (w.w / kk) * amp;
  float sf = sin(f), cf = cos(f);
  disp += vec3(d.x * a * cf, a * sf, d.y * a * cf);
  float ka = kk * a;
  tanX += vec3(-d.x * d.x * ka * sf, d.x * ka * cf, -d.x * d.y * ka * sf);
  tanZ += vec3(-d.x * d.y * ka * sf, d.y * ka * cf, -d.y * d.y * ka * sf);
}

/**
 * 浅瀬に寄せてくる波の列。位相に水深を使うと、帯が自然に等深線＝汀線と
 * 平行に並ぶ。浅瀬がのっぺりした靄に見えるのを防ぐ、いちばん効く要素。
 */
float swellBand(vec2 xz, float depth, float t) {
  return sin(t * 0.85 - depth * 9.0 + fbm3(xz * 0.045) * 1.6);
}

/** 波打ち際の寄せ引き。足跡を消す遊びの土台にもなる、ゆっくりした上下動。 */
float swash(vec2 xz, float t) {
  float ph = t * 0.62 - xz.y * 0.010 + fbm3(xz * 0.012) * 1.4;
  float s = sin(ph);
  // 寄せは速く引きは遅い、という非対称にする
  return (s > 0.0 ? pow(s, 0.7) : -pow(-s, 1.5));
}
`;

export function createWater(env: Env): THREE.Mesh {
  const geo = polarGrid(300, 256, 8000);

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
    vertexShader: COMMON + FIELD + GERSTNER + /* glsl */ `
      uniform float uTime;
      uniform vec3 uCamPos;
      varying vec3 vWorld;
      varying vec3 vTanX;
      varying vec3 vTanZ;
      varying float vDepth0;

      void main() {
        vec3 p = position;
        vec2 xz = p.xz;
        float bed = fieldAt(xz).x;
        float depth = max(-bed, 0.0);
        vDepth0 = depth;

        // 浅いほど波を寝かせる。遠景は頂点密度が足りないので同じく抑える
        float shallow = smoothstep(0.15, 3.2, depth);
        float far = 1.0 - smoothstep(600.0, 3000.0, distance(xz, uCamPos.xz));
        float amp = uWaveAmp * shallow * mix(0.25, 1.0, far);

        vec3 disp = vec3(0.0);
        vec3 tx = vec3(0.0), tz = vec3(0.0);
        gerstner(uWave0, xz, uTime, amp, disp, tx, tz);
        gerstner(uWave1, xz, uTime, amp, disp, tx, tz);
        gerstner(uWave2, xz, uTime, amp, disp, tx, tz);
        gerstner(uWave3, xz, uTime, amp, disp, tx, tz);

        // 波打ち際の寄せ引き
        float surgeMask = 1.0 - smoothstep(0.0, 2.6, depth);
        disp.y += swash(xz, uTime) * 0.14 * surgeMask;
        // 寄せてくる波の列。浅いほど背が立つ
        float swellMask = smoothstep(0.05, 0.5, depth) * (1.0 - smoothstep(1.2, 4.5, depth));
        disp.y += swellBand(xz, depth, uTime) * 0.11 * swellMask;

        p += disp;
        vWorld = p;
        vTanX = tx; vTanZ = tz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: COMMON + SKY + FIELD + FOG + GERSTNER + /* glsl */ `
      uniform float uTime;
      uniform vec3  uCamPos;
      uniform vec3  uKeyDir;
      uniform vec3  uKeyLight;
      uniform vec3  uExtinction;
      uniform vec3  uScatterCoef;
      uniform vec3  uSunLight;
      uniform vec3  uAmbLight;
      varying vec3  vWorld;
      varying vec3  vTanX;
      varying vec3  vTanZ;
      varying float vDepth0;

      /** 水面の細かいさざ波。法線に足して光をちらつかせる */
      vec3 rippleNormal(vec2 xz, float t, float scale, float strength) {
        vec2 e = vec2(0.35, 0.0);
        vec2 q = xz * scale + vec2(t * 0.35, -t * 0.22);
        float n0 = fbm3(q);
        float nx = fbm3(q + e.xy * scale);
        float nz = fbm3(q + e.yx * scale);
        return normalize(vec3(-(nx - n0) * strength, 1.0, -(nz - n0) * strength));
      }

      /** 水中の光の網目 */
      float caustic(vec2 xz, float t) {
        vec2 p = xz * 0.55;
        float a = vnoise(p + vec2(t * 0.11, t * 0.03));
        float b = vnoise(p * 1.63 - vec2(t * 0.07, t * 0.13));
        return pow(sat(1.0 - abs(a + b) * 0.95), 3.0);
      }

      void main() {
        vec2 xz = vWorld.xz;
        vec2 fld = fieldAt(xz);
        float bed = fld.x;
        float rock = fld.y;

        // 画素ごとの水深。頂点が粗くても汀線はここで滑らかに出る
        float depth = vWorld.y - bed;
        float edge = smoothstep(0.0, 0.055, depth);
        if (edge < 0.004) discard;

        vec3 V = normalize(uCamPos - vWorld);
        float dist = length(uCamPos - vWorld);

        // --- 法線 ---
        vec3 N = normalize(cross(normalize(vec3(0.0, 0.0, 1.0) + vTanZ),
                                 normalize(vec3(1.0, 0.0, 0.0) + vTanX)));
        N = normalize(vec3(-N.x, abs(N.y), -N.z));
        float detailFade = 1.0 - smoothstep(40.0, 320.0, dist);
        vec3 r1 = rippleNormal(xz, uTime, 0.55, 0.55 * detailFade);
        vec3 r2 = rippleNormal(xz, uTime * 1.7, 2.30, 0.30 * detailFade);
        N = normalize(N + vec3(r1.x + r2.x, 0.0, r1.z + r2.z) * mix(0.35, 1.0, smoothstep(0.1, 1.5, depth)));
        {
          // 波の列の傾き。水深の勾配方向に倒す
          float e = 0.45;
          float dhx = fieldAt(xz + vec2(e, 0.0)).x - fieldAt(xz - vec2(e, 0.0)).x;
          float dhz = fieldAt(xz + vec2(0.0, e)).x - fieldAt(xz - vec2(0.0, e)).x;
          vec2 g = vec2(dhx, dhz) / (2.0 * e);
          float sw2 = cos(uTime * 0.85 - depth * 9.0 + fbm3(xz * 0.045) * 1.6) * 9.0;
          float m = smoothstep(0.05, 0.5, depth) * (1.0 - smoothstep(1.2, 4.5, depth)) * detailFade;
          N = normalize(N + vec3(-g.x, 0.0, -g.y) * sw2 * 0.11 * m);
        }

        // --- 水中（屈折して見える海底）---
        vec2 refr = xz + N.xz * min(depth, 6.0) * 0.55;
        vec2 fld2 = fieldAt(refr);
        vec3 albedo = seabedAlbedo(refr, fld2.y);
        float ca = caustic(refr, uTime) * (1.0 - smoothstep(0.5, 7.0, depth));
        vec3 bedLit = albedo * (uKeyLight * (0.92 + 0.10 * ca) * max(uKeyDir.y, 0.10) + uAmbLight * 0.60);

        // 吸光: 下りと上りで往復ぶん通る
        float path = depth * 1.75;
        vec3 trans = exp(-uExtinction * path);
        // 散乱: 途中で散った光もまた吸われる（積分すると 1-exp の形になる）
        vec3 twoE = 2.0 * uExtinction;
        vec3 inScat = (uScatterCoef / twoE) * (1.0 - exp(-twoE * depth))
                    * (uKeyLight * 0.72 + uAmbLight * 0.85);
        vec3 body = bedLit * trans + inScat;

        // --- 反射 ---
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyColor(normalize(R), 0.0);
        float f0 = 0.020;
        float fres = f0 + (1.0 - f0) * pow(1.0 - sat(dot(N, V)), 5.0);
        // 参考画像は例外なく PL フィルタ越しの写真で、水面の映り込みが
        // 大きく削られている（だから珊瑚が透けて見える）。素の Fresnel だと
        // 斜めから見る水面はほぼ全面が空の青になり、あの色にはならない。
        // ここでは「偏光で削られた反射」として、水平線に近づくほど本来の
        // 反射率に戻る形で近似する。
        fres *= mix(0.10, 1.0, smoothstep(400.0, 3000.0, dist));
        fres = mix(fres, 1.0, smoothstep(2500.0, 7000.0, dist) * 0.55);

        vec3 col = mix(body, refl, fres);

        // --- 太陽のきらめき ---
        vec3 H = normalize(uKeyDir + V);
        float specFade = mix(0.12, 1.0, detailFade);
        float spec = (pow(sat(dot(N, H)), 900.0) * 2.4 + pow(sat(dot(N, H)), 90.0) * 0.22) * specFade;
        col += uSunColor * spec * (0.16 + 0.84 * uDay) * (1.0 - uWeather * 0.85);

        // --- 泡 ---
        // (a) 波打ち際: 寄せ引きに合わせて泡の線が動く。
        // 帯を広く取ると浅瀬が一面の白になるので、水深 30cm ほどに絞る。
        float sw = swash(xz, uTime);
        // 泡が立つのは寄せ波の先端、水の膜がいちばん薄いところ。
        // その後ろは「濡れた砂の上の澄んだ薄い水」で、白くはならない。
        float lip = 1.0 - smoothstep(0.010, 0.075 + 0.045 * sw, depth);
        float foamN = fbm3(xz * 2.6 + vec2(0.0, uTime * 0.35)) * 0.5 + 0.5;
        float foamN2 = fbm3(xz * 9.5 - vec2(uTime * 0.22, 0.0)) * 0.5 + 0.5;
        // 引き波が残す泡の筋
        float streak = (1.0 - smoothstep(0.04, 0.26, depth))
                     * sat(fbm3(xz * vec2(3.2, 0.7) + vec2(0.0, uTime * 0.5)) * 1.5 + 0.10) * 0.30;
        float shoreFoam = sat(max(lip * (0.72 + 0.85 * foamN * foamN2 * 1.6), streak) - 0.05);
        // (b) リーフ縁の白波: 浅くなる線に沿って砕ける
        float reefFoam = (1.0 - smoothstep(0.30, 1.9, depth)) * smoothstep(120.0, 175.0, length(xz - vec2(0.0, 70.0)));
        reefFoam *= sat(fbm3(xz * 0.32 + vec2(uTime * 0.10, -uTime * 0.28)) * 0.85 + 0.45);
        // (c) 波頭
        float crest = smoothstep(0.55, 1.15, vWorld.y / max(uWaveAmp, 0.001)) * smoothstep(1.5, 6.0, depth) * detailFade;

        // (d) 浅瀬を進む波の列。峰の少し手前が白く崩れる
        float swell = swellBand(xz, depth, uTime);
        float breaker = smoothstep(0.74, 0.97, swell)
                      * smoothstep(0.05, 0.22, depth) * (1.0 - smoothstep(0.35, 1.7, depth))
                      * sat(fbm3(xz * 1.3) * 0.9 + 0.55);

        float foam = sat(max(max(shoreFoam, reefFoam * 0.90), max(crest * 0.45, breaker * 0.75)));
        vec3 foamCol = sRGB(252.0, 253.0, 255.0) * (uKeyLight * 0.70 + uAmbLight * 0.85);
        col = mix(col, foamCol, foam * 0.94);

        // --- 大気遠近 ---
        col = applyFog(col, dist, vWorld - uCamPos);
        col = desaturate(col, uWeather * 0.45);

        gl_FragColor = vec4(col, edge);
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
