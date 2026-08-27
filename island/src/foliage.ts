// 指示書 §4 / §4-1。岬と浜の緑、そして人の手が入った気配。
//
// 種ごとに置き場所を変えるのがこの島の性格になる。ヤシは浜沿い、
// アダンは岬の岩場のふち、マングローブは湾の奥のごく浅いところ、
// 月桃とソテツと花木は東屋のまわり——という具合に、表のとおりに撒く。
// 描画は種ごとに InstancedMesh 1つずつ。

import * as THREE from 'three';
import { COMMON, SKY, FOG } from './glsl/lib';
import { makeRng, fbm } from './noise';
import { sampleHeight, slopeAt, shoreSigned, BOUNDS, type Field } from './heightfield';
import { buildFlora, type Species } from './flora';
import { pavilion, hammock, pier, lighthouse, stoneWall, firePit } from './structures';
import { buildVillaExterior, buildGarden, buildPots, buildVillaInterior, createEntryLantern, computeLayout, POTTED_SPOTS, VILLA } from './villa';
import type { Env } from './env';

/** 「留まる」場所。東屋・焚き火・ハンモック・桟橋はここにまとまる */
export const REST = { x: -20, z: 118, rot: -0.28 };
/** 焚き火の位置。東屋のそば、「留まる」場所の中心（指示書 §5） */
export const FIRE_POS = { x: REST.x + 5.2, z: REST.z - 4.4 };
/** この半径の中は藪を生やさず、焚き火を囲んで座れる開けた地面にする */
const FIRE_CLEAR_R = 3.6;
/** 別荘の庭として開けたままにする半径。建物の対角より少し広く取る */
const VILLA_CLEAR_R = 14.0;
/** 桟橋。浜から湾へ短く突き出す */
export const PIER = { x: -20, z0: 87, z1: 62, width: 1.9 };
/** 灯台。左の岬の先端 */
export const LIGHT = { x: -214, z: -112 };
/** マングローブの一角。浜が岬の付け根に回り込む、波の当たらない隅 */
const MANGROVE = { x: -150, z: 100, r: 30 };

function sceneryMaterial(env: Env): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    fog: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aTint;
      attribute vec2 aParam;   // x = 揺れやすさ, y = 葉らしさ
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vCol;
      varying float vLeaf;
      varying float vUp;
      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        // 株ごとに位相をずらす。全部が同じ拍で揺れると人工物に見える
        float ph = wp.x * 0.21 + wp.z * 0.17;
        float s = aParam.x;
        wp.x += sin(uTime * 1.05 + ph) * 0.17 * s;
        wp.z += cos(uTime * 0.83 + ph * 1.31) * 0.14 * s;
        wp.y += sin(uTime * 1.42 + ph * 0.7) * 0.05 * s;
        vWorld = wp.xyz;
        vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
        vCol = aTint * instanceColor;
        vLeaf = aParam.y;
        vUp = smoothstep(0.0, 1.8, position.y);
        gl_Position = projectionMatrix * modelViewMatrix * wp;
      }
    `,
    fragmentShader: COMMON + SKY + FOG + /* glsl */ `
      uniform vec3 uCamPos;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyLight;
      uniform vec3 uAmbLight;
      uniform vec3 uFireBounce;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vCol;
      varying float vLeaf;
      varying float vUp;
      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        float ndl = dot(N, uKeyDir);
        // 葉は光を透かすので裏面も明るい。板や石はふつうに陰る
        float hard = sat(ndl);
        float soft = sat(ndl * 0.60 + 0.40);
        float lit = mix(hard, soft, vLeaf);
        vec3 albedo = sRGB(vCol);
        // 株元・床下は暗く
        float ao = mix(mix(0.62, 1.0, vUp), mix(0.34, 1.0, vUp), vLeaf);
        float facet = 0.93 + 0.14 * hash21(floor(vWorld.xz * 2.5) + N.xz * 7.0);
        vec3 col = albedo * (uKeyLight * lit * 1.05 + uAmbLight * (0.38 + 0.62 * sat(N.y))) * ao * facet;

        // 焚き火の波及光。東屋まわりの月桃・ソテツ・花木や、薪山そのものが
        // 夜に暖色で照らされる（terrain.ts と同じ簡易な二乗減衰）。
        vec2 fireD = vWorld.xz - vec2(${FIRE_POS.x.toFixed(2)}, ${FIRE_POS.z.toFixed(2)});
        float fireAtten = 1.0 / (1.0 + dot(fireD, fireD) * 1.15);
        col += albedo * uFireBounce * fireAtten * 0.7;

        float dist = distance(uCamPos, vWorld);
        col = applyFog(col, dist, vWorld - uCamPos);
        col = desaturate(col, uWeather * 0.45);
        gl_FragColor = vec4(grade(col), 1.0);
        #include <colorspace_fragment>
      }
    `
  });
}

type Spot = { x: number; z: number; y: number; rot: number; scale: number; tint: number };

/** 条件に合う場所を、地図全体に撒いて拾う */
function scatter(
  field: Field, rng: () => number, want: number, maxTries: number,
  ok: (x: number, z: number, y: number, slope: number, shore: number) => boolean,
  scale: [number, number]
): Spot[] {
  const out: Spot[] = [];
  for (let t = 0; t < maxTries && out.length < want; t++) {
    const x = BOUNDS.x0 + rng() * (BOUNDS.x1 - BOUNDS.x0);
    const z = BOUNDS.z0 + rng() * (BOUNDS.z1 - BOUNDS.z0);
    const y = sampleHeight(field, x, z);
    if (!ok(x, z, y, slopeAt(field, x, z), shoreSigned(x, z))) continue;
    out.push({
      x, z, y,
      rot: rng() * Math.PI * 2,
      scale: scale[0] + rng() * (scale[1] - scale[0]),
      tint: rng()
    });
  }
  return out;
}

/** ある一点のまわりだけに撒く（東屋の足元など） */
function scatterAround(
  field: Field, rng: () => number, cx: number, cz: number,
  rMin: number, rMax: number, want: number,
  ok: (y: number, slope: number) => boolean, scale: [number, number]
): Spot[] {
  const out: Spot[] = [];
  for (let t = 0; t < want * 60 && out.length < want; t++) {
    const a = rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    // 焚き火のまわりは開けたまま残す。囲んで座る場所に藪が生えていては
    // 「留まる」場所にならない
    if (Math.hypot(x - FIRE_POS.x, z - FIRE_POS.z) < FIRE_CLEAR_R) continue;
    const y = sampleHeight(field, x, z);
    if (!ok(y, slopeAt(field, x, z))) continue;
    out.push({ x, z, y, rot: rng() * Math.PI * 2, scale: scale[0] + rng() * (scale[1] - scale[0]), tint: rng() });
  }
  return out;
}

/**
 * 自己批評用の並べ置き。種を1体ずつ平らな砂の上に並べる。
 * 島の中で探し回るより、こうして横一列にしたほうがシルエットを見比べやすい。
 */
export function createLineup(env: Env, field: Field): THREE.Group {
  const group = new THREE.Group();
  const mat = sceneryMaterial(env);
  const flora = buildFlora();
  const order: [Species, number][] = [
    ['palm', 0], ['palm', 1], ['palm', 2], ['adan', 0], ['deigo', 0],
    ['gettou', 0], ['mangrove', 0], ['sotetsu', 0], ['hibiscus', 0], ['bougain', 0],
    ['bush', 0], ['tree', 0]
  ];
  const m = new THREE.Matrix4();
  const col = new THREE.Color(1, 1, 1);
  order.forEach(([sp, vi], i) => {
    const geo = flora[sp][vi];
    if (!geo) return;
    const x = LINEUP.x0 + i * LINEUP.step;
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    m.makeTranslation(x, sampleHeight(field, x, LINEUP.z), LINEUP.z);
    mesh.setMatrixAt(0, m);
    mesh.setColorAt(0, col);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return group;
}

/** 並べ置きの場所。浜の平らなところ */
export const LINEUP = { x0: -27.5, step: 5.0, z: 104 };

export function createFoliage(env: Env, field: Field): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(0xb00b1e5);
  const flora = buildFlora();
  const mat = sceneryMaterial(env);
  const h = (x: number, z: number) => sampleHeight(field, x, z);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3();
  const posv = new THREE.Vector3();
  const col = new THREE.Color();

  /** 種ごとに1つの InstancedMesh を作る。variant があれば分散させる */
  const place = (species: Species, spots: Spot[], sink: number, jitter: number) => {
    const geos = flora[species];
    const per = Math.ceil(spots.length / geos.length);
    geos.forEach((geo, gi) => {
      const mine = spots.filter((_, i) => Math.floor(i / per) === gi);
      if (mine.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
      for (let i = 0; i < mine.length; i++) {
        const sp = mine[i]!;
        posv.set(sp.x, sp.y - sink * sp.scale, sp.z);
        q.setFromAxisAngle(up, sp.rot);
        scl.set(sp.scale * (0.92 + rng() * 0.16), sp.scale * (0.90 + rng() * 0.20), sp.scale * (0.92 + rng() * 0.16));
        m.compose(posv, q, scl);
        mesh.setMatrixAt(i, m);
        // instanceColor は色そのものではなく「掛け算の係数」。
        // 種ごとの色は頂点の aTint が持っているので、ここでは幅だけ足す
        const t = sp.tint;
        col.setRGB(0.88 + t * 0.24 + jitter * 0.10, 0.90 + t * 0.20, 0.86 + t * 0.26 - jitter * 0.08);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
  };

  // --- ヤシ: 砂浜沿い。湾全体のシルエットの主役 ---------------------------
  place('palm', scatter(field, rng, 96, 60000,
    (_x, z, y, s, sh) => z < 178 && sh > 5 && sh < 38 && y > 0.35 && y < 4.2 && s < 0.20,
    [0.72, 1.15]), 0.05, 0);

  // --- アダン: 岬の岩場のふち ---------------------------------------------
  place('adan', scatter(field, rng, 150, 90000,
    (_x, _z, y, s, sh) => sh < 0 && y > 1.8 && y < 22 && s > 0.22 && s < 1.3,
    [0.95, 1.55]), 0.12, 0);

  // --- デイゴ: 岬に1〜2本だけ。彩りのアクセント ---------------------------
  {
    const spots: Spot[] = [];
    for (const [x, z] of [[236, 96], [-208, 60]] as [number, number][]) {
      spots.push({ x, z, y: h(x, z), rot: rng() * 6.28, scale: 1.15, tint: rng() });
    }
    place('deigo', spots, 0.1, 0);
  }

  // --- マングローブ: 湾の奥、波の当たらないごく浅い一角 --------------------
  place('mangrove', scatter(field, rng, 34, 40000,
    (x, z, y) => Math.hypot(x - MANGROVE.x, z - MANGROVE.z) < MANGROVE.r && y > -0.95 && y < 0.25,
    [0.85, 1.35]), 0.55, 0);

  // --- 東屋・桟橋まわり: 月桃・ソテツ・ハイビスカス・ブーゲンビリア -------
  const nearRest = (y: number, s: number) => y > 0.4 && s < 0.35;
  place('gettou', scatterAround(field, rng, REST.x, REST.z, 3.4, 11, 22, nearRest, [0.85, 1.25]), 0.05, 0);
  place('sotetsu', scatterAround(field, rng, REST.x, REST.z, 4.5, 16, 15, nearRest, [0.9, 1.35]), 0.06, 0);
  place('hibiscus', [
    ...scatterAround(field, rng, REST.x, REST.z, 4, 14, 8, nearRest, [0.9, 1.3]),
    ...scatterAround(field, rng, PIER.x, PIER.z0 + 3, 3, 10, 5, nearRest, [0.9, 1.2])
  ], 0.08, 0.6);
  place('bougain', [
    ...scatterAround(field, rng, REST.x, REST.z, 5, 15, 7, nearRest, [0.9, 1.3]),
    ...scatterAround(field, rng, PIER.x, PIER.z0 + 4, 3, 11, 4, nearRest, [0.9, 1.2])
  ], 0.08, -0.5);

  // --- 汎用の低木と木: 岬と内陸の緑の量感 ---------------------------------
  const generic = (y: number, s: number, sh: number, x: number, z: number) => {
    if (y < 2.8 || s > 0.95) return false;
    // 白砂の浜と砂丘は裸のまま残す
    if (y < 7.5 && s < 0.14) return false;
    if (sh > 4 && sh < 30) return false;          // 汀線ぎわはヤシに譲る
    // 別荘のまわりは開けた庭のまま残す。藪に埋もれては別荘に見えない
    if (Math.hypot(x - VILLA.x, z - VILLA.z) < VILLA_CLEAR_R) return false;
    const d = fbm(x * 0.012, z * 0.012, 3) * 0.5 + 0.5;
    return rng() < 0.25 + d * 0.85;
  };
  place('bush', scatter(field, rng, 4300, 90000,
    (x, z, y, s, sh) => generic(y, s, sh, x, z) && !(s < 0.50 && y > 5 && rng() < 0.34),
    [1.05, 2.5]), 0.15, 0);
  place('tree', scatter(field, rng, 1150, 60000,
    (x, z, y, s, sh) => generic(y, s, sh, x, z) && s < 0.50 && y > 5,
    [0.85, 1.8]), 0.15, 0);

  // --- 人工物 -------------------------------------------------------------
  const one = (geo: THREE.BufferGeometry) => {
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    m.identity();
    mesh.setMatrixAt(0, m);
    mesh.setColorAt(0, col.setRGB(1, 1, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  one(pavilion(REST.x, REST.z, h, REST.rot));
  one(firePit(FIRE_POS.x, FIRE_POS.z, h));
  one(pier([PIER.x, h(PIER.x, PIER.z0) + 0.55, PIER.z0], [PIER.x, 0, PIER.z1], PIER.width, h));
  one(lighthouse(LIGHT.x, LIGHT.z, h));
  // 石垣は東屋の背中側に一本だけ。囲うのではなく、風を切るための短い壁
  one(stoneWall([[REST.x - 9, REST.z + 6.5], [REST.x - 1, REST.z + 8.2], [REST.x + 7.5, REST.z + 7.0]], h));
  // ハンモックは東屋の柱の間に吊る
  {
    const cos = Math.cos(REST.rot), sin = Math.sin(REST.rot);
    const at = (x: number, z: number): [number, number] =>
      [REST.x + x * cos - z * sin, REST.z + x * sin + z * cos];
    const a = at(-1.95, -1.95), b = at(-1.95, 1.95);
    const deck = h(REST.x, REST.z) + 0.42;
    one(hammock([a[0], deck + 1.55, a[1]], [b[0], deck + 1.55, b[1]], 0.62));
  }

  // --- 別荘（指示書 §6） ---------------------------------------------------
  one(buildVillaExterior(h));
  one(buildGarden(h));
  one(buildPots(h));
  one(buildVillaInterior(h));
  group.add(createEntryLantern(env, computeLayout(h)));
  // 玄関先の鉢植え。ソテツとブーゲンビリアを1本ずつ、既存の flora をそのまま使う
  {
    const potSpots: Spot[] = POTTED_SPOTS.map(([x, z]) => ({
      x, z, y: h(x, z) + 0.30, rot: rng() * Math.PI * 2, scale: 0.62, tint: rng()
    }));
    place('sotetsu', [potSpots[0]!], 0.10, 0);
    place('bougain', [potSpots[1]!], 0.10, -0.4);
  }

  return group;
}
