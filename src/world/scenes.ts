import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// three.js による 3D レイヤー。
//
// 役割はひとつ:「情報を読ませる HTML の板の、後ろに奥行きと光を置く」こと。
// 3D 側に文字や数値は一切出さない。読ませるものは必ず HTML 側に置く。
// 逆に、雰囲気（夜・深さ・熱・魔力）はすべてこちらが持つ。
//
// 外部テクスチャは使わない（読み込み失敗で画が壊れるのを避けるため）。
// 形は基本形状の組み合わせ、質感はライティングと霧と発光で作る。

const GOLD = 0xe9be74;
const EMBER = 0xff8348;
const ARCANE = 0x8f7dff;
const FROST = 0x6fc7ff;

/**
 * 環境マップ。
 * MeshStandardMaterial の metalness を上げた面は「周囲の映り込み」で色が付く。
 * 映り込む対象が無いと金属は真っ黒になる——最初のモックで剣が影絵になっていた。
 * 外部 HDRI は読み込まず、three が持つ簡易ルームを焼いて使う。
 */
let ENV: THREE.Texture | null = null;
function environment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (ENV) return ENV;
  const pmrem = new THREE.PMREMGenerator(renderer);
  ENV = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return ENV;
}

/** 決定的な擬似乱数。スクショが毎回同じ絵になるように。 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** 加算合成の粒。燠火・塵・魔力の輝きに使い回す。 */
interface Spread { x: number; y: number; z: number }
function makeMotes(count: number, spread: Spread, color: number, size: number, seed: number): THREE.Points {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * spread.x;
    pos[i * 3 + 1] = r() * spread.y;
    pos[i * 3 + 2] = (r() - 0.5) * spread.z;
    phase[i] = r() * Math.PI * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  const pts = new THREE.Points(g, m);
  pts.userData = { phase, base: pos.slice(), spread };
  return pts;
}

interface MoteData { phase: Float32Array; base: Float32Array; spread: Spread }

function driftMotes(pts: THREE.Points, t: number, speed = 0.28): void {
  const attr = pts.geometry.attributes.position as THREE.BufferAttribute;
  const out = attr.array as Float32Array;
  const { phase, base, spread } = pts.userData as MoteData;
  for (let i = 0; i < phase.length; i++) {
    const o = i * 3;
    // noUncheckedIndexedAccess のもとでは添字アクセスが undefined を含む。
    // ループの中で毎回 ?? を書くと読めなくなるので、先に数値として取り出す
    const bx = base[o] ?? 0;
    const by = base[o + 1] ?? 0;
    const bz = base[o + 2] ?? 0;
    const ph = phase[i] ?? 0;
    out[o] = bx + Math.sin(t * 0.6 + ph) * 0.22;
    out[o + 1] = (by + t * speed) % spread.y;
    out[o + 2] = bz + Math.cos(t * 0.45 + ph) * 0.18;
  }
  attr.needsUpdate = true;
}

function rock(w: number, h: number, d: number, color: number, seed: number): THREE.Mesh {
  // 岩肌。box を少しだけ歪めて、CG然とした直方体に見えないようにする
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const r = rng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) + (r() - 0.5) * w * 0.09,
      p.getY(i) + (r() - 0.5) * h * 0.09,
      p.getZ(i) + (r() - 0.5) * d * 0.09);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 0.95, metalness: 0.04, flatShading: true
  }));
}

function glowSprite(color: number, size: number, intensity = 1): THREE.Sprite {
  // 光源そのものの「にじみ」。板1枚に放射状グラデを焼いて加算で置く
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  if (!x) throw new Error('2d context unavailable');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  const hex = new THREE.Color(color);
  const rgb = `${(hex.r * 255) | 0},${(hex.g * 255) | 0},${(hex.b * 255) | 0}`;
  g.addColorStop(0, `rgba(${rgb},${0.95 * intensity})`);
  g.addColorStop(0.35, `rgba(${rgb},${0.32 * intensity})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------- 拠点

interface SceneDef { scene: THREE.Scene; cam: THREE.PerspectiveCamera; update(t: number): void }

function buildBase(): SceneDef {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070910);
  scene.fog = new THREE.FogExp2(0x0a0d18, 0.055);

  // 縦画面は水平画角が極端に狭くなる（垂直FOV×アスペクト0.46）。
  // 17m まで寄ると小屋だけで横幅が埋まり、屋根を見下ろす絵になっていた。
  // 引いて画角を広げ、さらに視点を地面より下に向けて被写体を画面上半分へ押し上げる。
  // 下半分は情報パネルが覆うので、見せたいものは必ず上に置く。
  const cam = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  cam.position.set(0.8, 4.6, 30);
  cam.lookAt(0, -2.0, 0);

  scene.add(new THREE.AmbientLight(0x2a3355, 1.15));
  const moon = new THREE.DirectionalLight(0x9fb6ff, 0.85);
  moon.position.set(-7, 11, 4);
  scene.add(moon);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x1b2033, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // 小屋。切妻屋根＋石の基礎＋煙突
  const lodge = new THREE.Group();
  const wall = rock(5.2, 2.6, 4.0, 0x4a3a2c, 11);
  wall.position.y = 1.3;
  lodge.add(wall);
  const base = rock(5.6, 0.5, 4.4, 0x2b3040, 12);
  base.position.y = 0.25;
  lodge.add(base);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.3, 1.9, 4),
    new THREE.MeshStandardMaterial({ color: 0x5c2b2b, roughness: 0.88, flatShading: true })
  );
  roof.position.y = 3.55;
  roof.rotation.y = Math.PI / 4;
  lodge.add(roof);
  const chim = rock(0.6, 1.5, 0.6, 0x333a4c, 13);
  chim.position.set(1.6, 4.0, 0.7);
  lodge.add(chim);

  // 窓の灯り。板＋点光源＋にじみの3点セットで「中に人がいる」感を出す
  for (const wx of [-1.5, 1.5]) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffcf82 })
    );
    pane.position.set(wx, 1.55, 2.02);
    lodge.add(pane);
    const l = new THREE.PointLight(0xffb457, 6.5, 11, 2);
    l.position.set(wx, 1.6, 2.6);
    lodge.add(l);
    const gl = glowSprite(0xffb457, 3.4, 0.75);
    gl.position.set(wx, 1.55, 2.25);
    lodge.add(gl);
  }
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 1 })
  );
  door.position.set(0, 0.9, 2.02);
  lodge.add(door);
  lodge.position.set(-2.2, 0, 0);
  scene.add(lodge);

  // 焚き火
  const fire = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x2e2117, roughness: 1 })
    );
    log.rotation.set(Math.PI / 2.4, (i / 5) * Math.PI * 2, 0);
    log.position.y = 0.16;
    fire.add(log);
  }
  const flame = glowSprite(EMBER, 2.6, 1);
  flame.position.y = 0.55;
  fire.add(flame);
  const fl = new THREE.PointLight(EMBER, 9, 9, 2);
  fl.position.y = 0.7;
  fire.add(fl);
  fire.position.set(3.1, 0, 1.6);
  scene.add(fire);

  // 針葉樹の影
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const h = 2.6 + r() * 2.4;
    const t = new THREE.Mesh(
      new THREE.ConeGeometry(0.75 + r() * 0.3, h, 5),
      new THREE.MeshStandardMaterial({ color: 0x16241f, roughness: 1, flatShading: true })
    );
    const ang = -0.6 + r() * 2.6;
    const dist = 11 + r() * 20;
    t.position.set(Math.cos(ang) * dist, h / 2, -Math.abs(Math.sin(ang)) * dist - 2);
    scene.add(t);
  }

  const motes = makeMotes(150, { x: 22, y: 9, z: 14 }, EMBER, 0.075, 5);
  scene.add(motes);

  return {
    scene, cam,
    update(t) {
      driftMotes(motes, t, 0.42);
      flame.scale.setScalar(2.4 + Math.sin(t * 7.3) * 0.22 + Math.sin(t * 3.1) * 0.14);
      fl.intensity = 8 + Math.sin(t * 9.1) * 2.2;
      cam.position.x = 0.8 + Math.sin(t * 0.16) * 1.1;
      cam.position.y = 4.6 + Math.sin(t * 0.11) * 0.3;
      cam.lookAt(0, -2.0, 0);
    }
  };
}

// ---------------------------------------------------------------- 深度／断面

function buildDescent(opts: { reached?: number; accent?: number } = {}): SceneDef {
  const { reached = 0.55, accent = EMBER } = opts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06080e);
  scene.fog = new THREE.FogExp2(0x06080e, 0.028);

  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  cam.position.set(0, 4, 15);
  cam.lookAt(0, -3, 0);

  scene.add(new THREE.AmbientLight(0x27304d, 0.9));
  const key = new THREE.DirectionalLight(0x8fa8ff, 0.5);
  key.position.set(5, 10, 8);
  scene.add(key);

  // 地層。上から土・岩・深層・深淵の4帯
  const bands = [
    { c: 0x4a3a2a, y: 0 }, { c: 0x333a4c, y: -7 },
    { c: 0x342b4e, y: -14 }, { c: 0x1c2947, y: -21 }
  ];
  bands.forEach((b, i) => {
    for (const side of [-1, 1]) {
      const w = rock(7, 7, 9, b.c, 200 + i * 7 + side);
      w.position.set(side * 6.4, b.y - 3.5, 0);
      scene.add(w);
    }
    const floor = rock(20, 0.5, 9, b.c, 300 + i);
    floor.position.set(0, b.y - 7, -3.6);
    scene.add(floor);
  });

  // 竪坑を照らす松明
  const depth = 28;
  for (let i = 0; i < 6; i++) {
    const y = -i * 4.6;
    const on = i / 6 < reached;
    const col = on ? accent : 0x2b3350;
    const l = new THREE.PointLight(col, on ? 7 : 0.8, 13, 2);
    l.position.set(i % 2 ? 2.6 : -2.6, y, 2.2);
    scene.add(l);
    const g = glowSprite(col, on ? 2.5 : 1.0, on ? 0.95 : 0.3);
    g.position.copy(l.position);
    scene.add(g);
  }

  // 到達した深さを示す光の帯
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, depth * reached, 8),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 })
  );
  beam.position.y = -depth * reached / 2 + 0.5;
  scene.add(beam);
  const head = glowSprite(accent, 3.4, 1);
  head.position.y = -depth * reached + 0.5;
  scene.add(head);

  const motes = makeMotes(180, { x: 16, y: 30, z: 10 }, 0x9fb6ff, 0.06, 21);
  motes.position.y = -26;
  scene.add(motes);

  return {
    scene, cam,
    update(t) {
      driftMotes(motes, t, 0.5);
      head.scale.setScalar(3.1 + Math.sin(t * 4.2) * 0.35);
      cam.position.x = Math.sin(t * 0.19) * 1.1;
      cam.position.y = 4 - reached * 6 + Math.sin(t * 0.14) * 0.3;
      cam.lookAt(0, -depth * reached * 0.55, 0);
    }
  };
}

// ---------------------------------------------------------------- 開封

function buildReveal(opts: { color?: number } = {}): SceneDef {
  const { color = 0xffc76b } = opts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060c);
  scene.fog = new THREE.FogExp2(0x05060c, 0.05);

  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  cam.position.set(0, 1.1, 11);
  cam.lookAt(0, -1.4, 0);

  scene.add(new THREE.AmbientLight(0x1a2038, 0.7));

  // 中心の遺物。八面体を2枚重ねて、内側を発光、外側をワイヤで包む
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.65,
      roughness: 0.22, metalness: 0.9, flatShading: true
    })
  );
  scene.add(core);
  const cage = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.9, 0),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.32 })
  );
  scene.add(cage);

  const halo = glowSprite(color, 6.5, 0.42);
  scene.add(halo);
  const l = new THREE.PointLight(color, 7, 22, 2);
  scene.add(l);

  // 破裂した紙片。板を放射状にばら撒く
  const shards = new THREE.Group();
  const r = rng(9);
  for (let i = 0; i < 130; i++) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07 + r() * 0.15, 0.07 + r() * 0.2),
      new THREE.MeshBasicMaterial({
        color: r() > 0.55 ? color : 0xffffff,
        side: THREE.DoubleSide, transparent: true, opacity: 0.35 + r() * 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    const a = r() * Math.PI * 2, b = (r() - 0.5) * Math.PI;
    const d = 2.2 + r() * 5.2;
    s.position.set(Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d * 0.8, Math.sin(a) * Math.cos(b) * d * 0.5);
    s.rotation.set(r() * 6, r() * 6, r() * 6);
    shards.add(s);
  }
  scene.add(shards);

  // 光条
  const rays = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const ray = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 13),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    ray.material.opacity = 0.06;
    ray.rotation.z = (i / 10) * Math.PI * 2;
    rays.add(ray);
  }
  scene.add(rays);

  const motes = makeMotes(120, { x: 12, y: 10, z: 8 }, color, 0.07, 31);
  motes.position.y = -5;
  scene.add(motes);

  return {
    scene, cam,
    update(t) {
      core.rotation.y = t * 0.55;
      core.rotation.x = Math.sin(t * 0.4) * 0.28;
      cage.rotation.y = -t * 0.32;
      cage.rotation.z = t * 0.16;
      rays.rotation.z = t * 0.09;
      shards.rotation.y = t * 0.07;
      halo.scale.setScalar(6.2 + Math.sin(t * 2.6) * 0.6);
      l.intensity = 6.5 + Math.sin(t * 3.7) * 1.4;
      driftMotes(motes, t, 0.34);
    }
  };
}

// ---------------------------------------------------------------- 台座（装備）

function buildPedestal(opts: { color?: number } = {}): SceneDef {
  const { color = 0xa77dff } = opts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070910);
  scene.fog = new THREE.FogExp2(0x070910, 0.06);

  // この画面の主役は一覧であって剣ではない。
  // 3D は「背後で何かが光っている」程度に沈め、被写体は画面下寄りに置く
  const cam = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  cam.position.set(0, 3.4, 13);
  cam.lookAt(0, 2.6, 0);

  scene.add(new THREE.AmbientLight(0x232b47, 1.0));
  const key = new THREE.SpotLight(0xdfe8ff, 90, 18, 0.7, 0.5, 1.6);
  key.position.set(2.6, 5.4, 4.6);
  key.target.position.set(0, 1.0, 0);
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.PointLight(color, 14, 16, 2);
  rim.position.set(-3.2, 2.2, -2.0);
  scene.add(rim);
  const fill = new THREE.PointLight(0x8ea6ff, 5, 16, 2);
  fill.position.set(3.2, 0.4, 3.0);
  scene.add(fill);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.3, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a3048, roughness: 0.92, flatShading: true })
  );
  dais.position.y = -0.9;
  scene.add(dais);

  // 剣。刃・鍔・柄・柄頭
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 3.1, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xcfd8ee, roughness: 0.22, metalness: 0.95 })
  );
  blade.position.y = 1.75;
  sword.add(blade);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0xcfd8ee, roughness: 0.22, metalness: 0.95 })
  );
  tip.position.y = 3.55;
  sword.add(tip);
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.16, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xb08a45, roughness: 0.4, metalness: 0.85 })
  );
  guard.position.y = 0.18;
  sword.add(guard);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.95 })
  );
  grip.position.y = -0.3;
  sword.add(grip);
  const pommel = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.17, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, metalness: 0.8, roughness: 0.3 })
  );
  pommel.position.y = -0.78;
  sword.add(pommel);
  sword.position.y = -0.1;
  scene.add(sword);

  const halo = glowSprite(color, 6, 0.5);
  halo.position.y = 0.9;
  scene.add(halo);

  const motes = makeMotes(90, { x: 7, y: 7, z: 5 }, color, 0.055, 41);
  motes.position.y = -1.4;
  scene.add(motes);

  return {
    scene, cam,
    update(t) {
      sword.rotation.y = t * 0.42;
      sword.position.y = -0.1 + Math.sin(t * 1.1) * 0.11;
      halo.scale.setScalar(5.6 + Math.sin(t * 2.1) * 0.5);
      driftMotes(motes, t, 0.26);
    }
  };
}

// ---------------------------------------------------------------- 実行系

export const SCENES = {
  // インベントリ・図鑑の背景。3Dは主役ではないので、
  // 台座の光量を落として「後ろで何かが光っている」程度に留める
  vault: () => buildPedestal({ color: FROST }),
  base: buildBase,
  dispatch: () => buildDescent({ reached: 0.34, accent: GOLD }),
  report: () => buildDescent({ reached: 0.78, accent: EMBER }),
  reveal: () => buildReveal({ color: 0xffc76b }),
  revealRare: () => buildReveal({ color: ARCANE }),
  pedestal: () => buildPedestal({ color: ARCANE }),
  pedestalFrost: () => buildPedestal({ color: FROST })
};

export interface Stage {
  load(name: SceneName): void;
  resize(w: number, h: number): void;
  renderAt(t: number): void;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  let current: SceneDef | null = null;
  let composer: EffectComposer | null = null;
  let w = 0, h = 0;

  function resize(nw: number, nh: number): void {
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    if (current) {
      current.cam.aspect = w / h;
      current.cam.updateProjectionMatrix();
    }
    if (composer) composer.setSize(w, h);
  }

  function load(name: SceneName): void {
    const f = SCENES[name];
    if (!f) throw new Error(`unknown scene: ${name}`);
    if (current) dispose();
    current = f();
    current.scene.environment = environment(renderer);
    current.scene.environmentIntensity = 0.32;
    current.cam.aspect = w / h || 1;
    current.cam.updateProjectionMatrix();
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(current.scene, current.cam));
    // 光をにじませる。3D 側の主役は「光」なので、ここは効かせる
    // 強度を上げすぎると画面全体が発光して文字まで溶ける。
    // 閾値を高く取り、「本当に光っているもの」だけを拾わせる
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w || 1, h || 1), 0.34, 0.75, 0.72));
    composer.setSize(w || 1, h || 1);
  }

  function renderAt(t: number): void {
    if (!current || !composer) return;
    current.update(t);
    composer.render();
  }

  /** 画面を離れるときにGPU資源を返す。放置すると遷移のたびに積み上がる。 */
  function dispose(): void {
    composer?.dispose();
    current?.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else if (mat) mat.dispose();
    });
    current = null;
    composer = null;
  }

  return { load, resize, renderAt, dispose };
}

export type SceneName = keyof typeof SCENES;
