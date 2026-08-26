// 指示書 §4。岬の緑は InstancedMesh でまとめて描く。
// 同一ジオメトリを大量に置くだけなので、描画コールは低木と木の2回で済む。

import * as THREE from 'three';
import { COMMON, SKY, FOG } from './glsl/lib';
import { makeRng, fbm } from './noise';
import { sampleHeight, slopeAt, BOUNDS, type Field } from './heightfield';
import type { Env } from './env';

function bushGeometry(): THREE.BufferGeometry {
  // 塊を3つ寄せた低木。頂点を軽く歪ませて既製の球に見えないようにする
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number, number][] = [
    [0, 0.55, 0, 0.62], [0.42, 0.34, 0.16, 0.42], [-0.30, 0.30, -0.28, 0.38]
  ];
  for (const [x, y, z, r] of spots) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const rng = makeRng(9001);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) * (0.85 + rng() * 0.34),
      p.getY(i) * (0.80 + rng() * 0.30),
      p.getZ(i) * (0.85 + rng() * 0.34));
  }
  geo.computeVertexNormals();
  return geo;
}

function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 2.6, 5, 1);
  trunk.translate(0, 1.3, 0);
  const parts: THREE.BufferGeometry[] = [trunk];
  const spots: [number, number, number, number][] = [
    [0, 3.3, 0, 1.5], [0.85, 2.6, 0.35, 1.05], [-0.7, 2.75, -0.5, 0.95], [0.15, 4.3, -0.2, 0.85]
  ];
  for (const [x, y, z, r] of spots) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  return geo;
}

/** three の BufferGeometryUtils を持ち込まずに済ませる最小のマージ */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  const arrays: Float32Array[] = [];
  for (const g of list) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    const a = nonIndexed.getAttribute('position').array as Float32Array;
    arrays.push(a instanceof Float32Array ? a : new Float32Array(a));
    total += a.length;
  }
  const merged = new Float32Array(total);
  let o = 0;
  for (const a of arrays) { merged.set(a, o); o += a.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  geo.computeVertexNormals();
  return geo;
}

function foliageMaterial(env: Env): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vCol;
      varying float vUp;
      void main() {
        vec3 p = position;
        // 上のほうほど揺らす
        float sway = smoothstep(0.4, 3.0, p.y);
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        wp.x += sin(uTime * 0.9 + wp.z * 0.35) * 0.10 * sway;
        wp.z += cos(uTime * 0.7 + wp.x * 0.30) * 0.08 * sway;
        vWorld = wp.xyz;
        vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
        vCol = instanceColor;
        vUp = smoothstep(0.0, 1.4, p.y);
        gl_Position = projectionMatrix * modelViewMatrix * wp;
      }
    `,
    fragmentShader: COMMON + SKY + FOG + /* glsl */ `
      uniform vec3 uCamPos;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyLight;
      uniform vec3 uAmbLight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vCol;
      varying float vUp;
      void main() {
        vec3 N = normalize(vNormal);
        // 葉は半透過なので、裏面もそれなりに明るくする
        // 葉は半透過なので裏面も少し明るいが、陰影は強めに残す
        float ndl = dot(N, uKeyDir);
        float wrap = sat(ndl * 0.72 + 0.28);
        vec3 albedo = sRGB(vCol);
        // 株元は暗く、面ごとにも少しばらつかせる
        float ao = mix(0.32, 1.0, vUp);
        float facet = 0.90 + 0.20 * hash21(floor(vWorld.xz * 3.0) + N.xz * 7.0);
        vec3 col = albedo * (uKeyLight * wrap * 1.05 + uAmbLight * (0.35 + 0.65 * sat(N.y))) * ao * facet;
        float dist = distance(uCamPos, vWorld);
        col = applyFog(col, dist, vWorld - uCamPos);
        col = desaturate(col, uWeather * 0.45);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `
  });
}

export function createFoliage(env: Env, field: Field): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(0xb00b1e5);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const posv = new THREE.Vector3();

  type Spot = { x: number; z: number; y: number; slope: number };
  const bushes: Spot[] = [];
  const trees: Spot[] = [];

  // 受理されるまで撒く。岬と内陸の丘に寄せ、白砂の浜には生やさない。
  for (let tries = 0; tries < 90000 && (bushes.length < 5200 || trees.length < 1500); tries++) {
    const x = BOUNDS.x0 + rng() * (BOUNDS.x1 - BOUNDS.x0);
    const z = BOUNDS.z0 + rng() * (BOUNDS.z1 - BOUNDS.z0);
    const y = sampleHeight(field, x, z);
    if (y < 2.8) continue;
    const s = slopeAt(field, x, z);
    if (s > 0.95) continue;
    // 白砂の浜と砂丘は裸のまま残す。「低くて平ら」を砂と見なす。
    // 岬は島の楕円の外に張り出しているので、汀線からの距離では判定できない。
    if (y < 7.5 && s < 0.14) continue;
    // 密度をノイズで斑にする
    const d = fbm(x * 0.012, z * 0.012, 3) * 0.5 + 0.5;
    if (rng() > 0.25 + d * 0.85) continue;
    const spot = { x, z, y, slope: s };
    // 木は緩い斜面だけ。急な岩場は低木
    if (s < 0.50 && y > 5 && trees.length < 1500 && rng() < 0.34) trees.push(spot);
    else if (bushes.length < 5200) bushes.push(spot);
  }

  const mk = (geo: THREE.BufferGeometry, spots: Spot[], scale: [number, number], tint: (t: number) => THREE.Color) => {
    const mesh = new THREE.InstancedMesh(geo, foliageMaterial(env), spots.length);
    const col = new THREE.Color();
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i]!;
      const s = scale[0] + rng() * (scale[1] - scale[0]);
      posv.set(sp.x, sp.y - 0.15 * s, sp.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      scl.set(s * (0.85 + rng() * 0.3), s * (0.8 + rng() * 0.45), s * (0.85 + rng() * 0.3));
      m.compose(posv, q, scl);
      mesh.setMatrixAt(i, m);
      col.copy(tint(rng()));
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  };

  const bushTint = (t: number) => new THREE.Color().setRGB(
    (40 + t * 44) / 255, (70 + t * 56) / 255, (30 + t * 30) / 255
  );
  const treeTint = (t: number) => new THREE.Color().setRGB(
    (34 + t * 40) / 255, (62 + t * 56) / 255, (26 + t * 28) / 255
  );

  group.add(mk(bushGeometry(), bushes, [1.1, 2.6], bushTint));
  group.add(mk(treeGeometry(), trees, [0.9, 1.9], treeTint));
  return group;
}
