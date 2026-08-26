import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ModelSpec } from './models';
import { MODEL_HEIGHT, animateModel, buildItemModel, disposeModel } from './models';
import type { Mood } from './mood';

// Mood の定義は three.js に依存しない別ファイルに置いてある。
// 画面もテストも import できるようにするため（§6.6）。
export type { Mood, PlotMood, MoodElement } from './mood';
export { MOOD_ELEMENTS, elementIndex } from './mood';

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

/**
 * 星空（§3 Layer A）。
 *
 * 点を1つずつ Mesh にすると数百個で重くなるので Points 1つにまとめる。
 * 瞬きは attribute（大きさ）を書き換えて出す——
 * 個別の材質を持たせずに、1回の描画で全部揺らせる。
 */
function makeStars(count: number, seed: number): THREE.Points {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    // 空の高いところにだけ置く。地平より下の星は家の裏に埋まって見えない
    pos[o] = (r() - 0.5) * 190;
    pos[o + 1] = 12 + r() * 62;
    pos[o + 2] = -95 - r() * 40;
    size[i] = 0.32 + r() * 0.62;
    phase[i] = r() * Math.PI * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 0.7, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending,
    // **背景の層は霧に沈めない。** 近景用に密度 0.055 で置いた FogExp2 は、
    // 100m 先ではほぼ完全な不透明になる（exp(-(0.055×125)²) ≈ 0）。
    // 星も山も、置いたのに1つも見えていなかった。
    fog: false
  }));
  pts.userData = { phase, base: size };
  return pts;
}

/** 星を瞬かせる。毎フレーム呼ぶ。 */
function twinkle(pts: THREE.Points, t: number): void {
  const attr = pts.geometry.attributes.size as THREE.BufferAttribute | undefined;
  if (!attr) return;
  const out = attr.array as Float32Array;
  const { phase, base } = pts.userData as { phase: Float32Array; base: Float32Array };
  for (let i = 0; i < phase.length; i++) {
    const b = base[i] ?? 0.4;
    const ph = phase[i] ?? 0;
    out[i] = b * (0.62 + 0.38 * Math.sin(t * 1.4 + ph));
  }
  attr.needsUpdate = true;
  // PointsMaterial は size 属性を見ないので、全体の大きさで代表させる。
  // 個々の瞬きは opacity のうねりで感じさせる
  const m = pts.material as THREE.PointsMaterial;
  m.opacity = 0.72 + Math.sin(t * 0.8) * 0.12;
}

/** 上下に消えていく帯のテクスチャ。硬い境目を溶かすのに使う。 */
function verticalFade(color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const x = c.getContext('2d');
  if (!x) throw new Error('2d context unavailable');
  const hex = new THREE.Color(color);
  const rgb = `${(hex.r * 255) | 0},${(hex.g * 255) | 0},${(hex.b * 255) | 0}`;
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.55, `rgba(${rgb},0.92)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
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

interface SceneDef {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  update(t: number): void;
  /** 状態を受け取る。持たないシーンは undefined */
  setMood?(m: Mood): void;
  /** 装備モデルを載せる場所。持たないシーンは undefined */
  mount?: THREE.Object3D;
  /** 何も載っていないときに見せるもの。載せたら隠す */
  placeholder?: THREE.Object3D;
  /**
   * DOM 側に当たり判定を置いてほしい 3D 物体。見えていないときは非表示にする。
   *
   * **World層は当たり判定を持たない**（§6.2）。Raycaster で 3D を直接叩けば
   * 早いが、そうすると「押せるものが押せるか」を DOM から測れなくなり、
   * U3（44px 以上）も U11（本当に押せるか）も素通りする。
   * ここでは位置だけを渡し、透明なボタンは Interface 層が置く。
   */
  hotspot?: THREE.Object3D;
}

function buildBase(): SceneDef {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070910);
  // 霧を薄くする。0.055 だと 30m 先のカメラから見た小屋まで曇り、
  // 形は出ているのに何も見えない画面になっていた
  scene.fog = new THREE.FogExp2(0x0a0d18, 0.026);

  // 縦画面は水平画角が極端に狭くなる（垂直FOV×アスペクト0.46）。
  // 17m まで寄ると小屋だけで横幅が埋まり、屋根を見下ろす絵になっていた。
  // 引いて画角を広げ、さらに視点を地面より下に向けて被写体を画面上半分へ押し上げる。
  // 下半分は情報パネルが覆うので、見せたいものは必ず上に置く。
  const cam = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  cam.position.set(0.8, 4.6, 30);
  cam.lookAt(0, -2.0, 0);

  // 夜の静けさは保ちつつ、置いたものが見える程度には照らす。
  // 「暗い」と「何も見えない」は別で、後者はただの黒い画面
  scene.add(new THREE.AmbientLight(0x36436c, 1.62));
  const moon = new THREE.DirectionalLight(0xb2c2ff, 1.45);
  moon.position.set(-7, 11, 4);
  scene.add(moon);
  // 手前からの返し。小屋の正面が真っ黒に落ちるのを防ぐ
  const bounce = new THREE.DirectionalLight(0x6b7fb8, 0.7);
  bounce.position.set(4, 3, 12);
  scene.add(bounce);

  // ---- Layer A: 星空（§3 共通基盤方針）。最も遠く、最もゆっくり
  const stars = makeStars(280, 3);
  scene.add(stars);

  // ---- Layer B: 遠景の山。視差でごく僅かに動く
  //
  // **空より暗く、数を多く、重ねる。** 最初は3列7個を明るめの紺で置いたが、
  // ほぼ黒い夜空の上では切り絵のように浮いて、山ではなく三角形に見えた。
  // 奥ほど暗くし、間隔を詰めて稜線が重なるようにする。
  const ridges = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const rr = rng(200 + k);
    const shade = [0x0c1222, 0x080d18, 0x05080f][k] ?? 0x080d18;
    for (let i = 0; i < 12; i++) {
      const h = 10 + rr() * 16 - k * 1.5;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(7 + rr() * 7, h, 5),
        // 星と同じ理由で霧の外に置く（§Layer A/B は近景の霧に属さない）
        new THREE.MeshBasicMaterial({ color: shade, fog: false })
      );
      m.rotation.y = rr() * 3;
      m.position.set(-70 + i * 12 + rr() * 6, h / 2 - 4.5, -54 - k * 15);
      ridges.add(m);
    }
  }
  scene.add(ridges);

  // 地平の靄。山の裾と地面の境目に出る硬い線を溶かす。
  // **単色の板ではなく縦のグラデーション。** 一様な板を置くと、
  // 硬い線が1本増えるだけで何も溶けない（実際そうなった）
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(230, 20),
    new THREE.MeshBasicMaterial({
      map: verticalFade(0x121b2e), transparent: true, opacity: 0.85,
      depthWrite: false, fog: false
    })
  );
  haze.position.set(0, 0.5, -40);
  scene.add(haze);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x27304a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // 小屋。切妻屋根＋石の基礎＋煙突
  const lodge = new THREE.Group();
  const wall = rock(5.2, 2.6, 4.0, 0x5e4a38, 11);
  wall.position.y = 1.3;
  lodge.add(wall);
  const base = rock(5.6, 0.5, 4.4, 0x2b3040, 12);
  base.position.y = 0.25;
  lodge.add(base);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.3, 1.9, 4),
    new THREE.MeshStandardMaterial({ color: 0x67332f, roughness: 0.88, flatShading: true })
  );
  roof.position.y = 3.55;
  roof.rotation.y = Math.PI / 4;
  lodge.add(roof);
  const chim = rock(0.6, 1.5, 0.6, 0x333a4c, 13);
  chim.position.set(1.6, 4.0, 0.7);
  lodge.add(chim);

  // 煙突の煙。ゆっくり昇って消える
  const smoke = makeMotes(46, { x: 1.0, y: 7.0, z: 1.0 }, 0x8d9ab5, 0.30, 91);
  smoke.position.set(1.6, 4.8, 0.7);
  (smoke.material as THREE.PointsMaterial).opacity = 0.20;
  lodge.add(smoke);

  // 窓の灯り。板＋にじみで「中に人がいる」感を出す。
  // **点光源は窓ごとに置かない**（§3 パフォーマンス方針）——
  // 家全体を照らす1灯にまとめて、窓ごとの表情はスプライトで作る
  interface Window { pane: THREE.Mesh; glow: THREE.Sprite; phase: number }
  const windows: Window[] = [];
  for (const [i, wx] of [-1.5, 1.5].entries()) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffcf82, transparent: true })
    );
    pane.position.set(wx, 1.55, 2.02);
    lodge.add(pane);
    const glow = glowSprite(0xffb457, 3.4, 0.75);
    glow.position.set(wx, 1.55, 2.25);
    lodge.add(glow);
    windows.push({ pane, glow, phase: i * 2.7 });
  }
  const hearth = new THREE.PointLight(0xffb457, 9, 14, 2);
  hearth.position.set(0, 1.7, 3.0);
  lodge.add(hearth);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 1 })
  );
  door.position.set(0, 0.9, 2.02);
  lodge.add(door);
  lodge.position.set(-2.2, 0, 0);
  scene.add(lodge);

  // 温室（薬草園）。小屋の右手に建てる。
  // 夜の紺の中でここだけ緑に灯り、「命が育っている」対比を作る
  const green = new THREE.Group();
  const gGlass = new THREE.MeshStandardMaterial({
    color: 0x9fd8c0, transparent: true, opacity: 0.13,
    roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide
  });
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 2.6), gGlass);
  gBody.position.y = 0.95;
  green.add(gBody);
  const gRoof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 0.9, 4), gGlass);
  gRoof.position.y = 2.3;
  gRoof.rotation.y = Math.PI / 4;
  green.add(gRoof);
  const gFrame = new THREE.MeshStandardMaterial({ color: 0x3b4a3f, roughness: 0.9, flatShading: true });
  for (const gx of [-1.7, 1.7]) {
    for (const gz of [-1.3, 1.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), gFrame);
      post.position.set(gx, 0.95, gz);
      green.add(post);
    }
  }
  // 中の株。**メニューを開かなくても成長段階が分かるようにする**
  // （指示書「拠点（3Dシーン）」）。以前はここも常に6本の同じ苗だったので、
  // 何も植えていない拠点と満作の拠点が同じ絵だった。
  const gPlots: Array<{ root: THREE.Group; slot: PlantSlot; marker: THREE.Object3D }> = [];
  for (let i = 0; i < 6; i++) {
    const root = new THREE.Group();
    root.position.set(-1.2 + (i % 3) * 1.2, 0.2, i < 3 ? -0.6 : 0.6);
    root.scale.setScalar(0.72);       // 拠点は引きの絵。畑の画面より小さく置く
    const slot = new PlantSlot();
    root.add(slot.group);
    const marker = bedMarker();
    marker.scale.setScalar(0.8);
    root.add(marker);
    root.visible = false;
    green.add(root);
    gPlots.push({ root, slot, marker });
  }
  const gGlow = glowSprite(0x9be08a, 2.6, 0.5);
  gGlow.position.y = 1.0;
  green.add(gGlow);
  const gLight = new THREE.PointLight(0x9be08a, 5.5, 9, 2);
  gLight.position.set(0, 1.2, 1.2);
  green.add(gLight);
  green.position.set(4.8, 0, 1.2);
  scene.add(green);

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
      new THREE.MeshStandardMaterial({ color: 0x22392f, roughness: 1, flatShading: true })
    );
    const ang = -0.6 + r() * 2.6;
    const dist = 11 + r() * 20;
    t.position.set(Math.cos(ang) * dist, h / 2, -Math.abs(Math.sin(ang)) * dist - 2);
    scene.add(t);
  }

  const motes = makeMotes(150, { x: 22, y: 9, z: 14 }, EMBER, 0.075, 5);
  scene.add(motes);

  // 誰かが潜っている間は家が静かになる（§3-1「一部消灯で留守を表現」）。
  // 1 = 全員在宅、0 = 全員潜行中
  let presence = 1;
  let gReady = 0;

  return {
    scene, cam,
    setMood(m) {
      if (m.presence !== undefined) presence = Math.max(0, Math.min(1, m.presence));
      if (m.intensity !== undefined) gReady = Math.max(0, Math.min(1, m.intensity));
      if (m.slots) {
        for (const [i, gp] of gPlots.entries()) {
          const slot = m.slots[i];
          gp.root.visible = slot !== undefined;
          if (!slot) continue;
          gp.slot.set(slot.kind, slot.ratio);
          gp.marker.visible = slot.kind < 0;
        }
      }
    },
    update(t) {
      driftMotes(motes, t, 0.42);
      driftMotes(smoke, t, 0.55);
      twinkle(stars, t);
      flame.scale.setScalar(2.4 + Math.sin(t * 7.3) * 0.22 + Math.sin(t * 3.1) * 0.14);
      fl.intensity = (8 + Math.sin(t * 9.1) * 2.2) * (0.55 + presence * 0.45);

      // ロウソクの揺らぎ。周期の違う波を重ねると、規則正しさが消える
      for (const [i, w] of windows.entries()) {
        const flick = 0.82 + Math.sin(t * 6.1 + w.phase) * 0.09 + Math.sin(t * 2.3 + w.phase) * 0.06;
        // 留守のときは片方だけ消える。全部消すと「誰もいない家」になり、
        // 帰る場所という温度感が失われる
        const lit = i === 1 && presence < 0.5 ? 0.14 : 1;
        (w.pane.material as THREE.MeshBasicMaterial).opacity = flick * lit;
        w.glow.scale.setScalar(3.2 * flick * lit + 0.4);
      }
      hearth.intensity = (7.5 + Math.sin(t * 5.3) * 1.2) * (0.4 + presence * 0.6);
      // 温室は在宅と無関係にずっと灯っている。植物は待たない。
      // 採り頃のものがあるぶんだけ明るくして、遠目にも「そろそろ」を伝える
      gLight.intensity = (5 + Math.sin(t * 0.9) * 0.8) * (1 + gReady * 0.7);
      gGlow.scale.setScalar((2.4 + Math.sin(t * 1.3) * 0.2) * (1 + gReady * 0.35));
      for (const [i, gp] of gPlots.entries()) if (gp.root.visible) gp.slot.update(t, i);

      cam.position.x = 0.8 + Math.sin(t * 0.16) * 1.1;
      cam.position.y = 4.6 + Math.sin(t * 0.11) * 0.3;
      cam.lookAt(0, -2.0, 0);
      // 視差。山は手前より遅く動く
      ridges.position.x = -cam.position.x * 0.22;
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

  // 竪坑を照らす松明。到達した深さまでが灯る（§3-4）
  const depth = 28;
  interface Torch { light: THREE.PointLight; at: number }
  const torches: Torch[] = [];
  const torchGlows: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const y = -i * 4.6;
    const on = i / 6 < reached;
    const col = on ? accent : 0x2b3350;
    const l = new THREE.PointLight(col, on ? 7 : 0.8, 13, 2);
    l.position.set(i % 2 ? 2.6 : -2.6, y, 2.2);
    scene.add(l);
    torches.push({ light: l, at: i / 6 });
    const g = glowSprite(col, on ? 2.5 : 1.0, on ? 0.95 : 0.3);
    g.position.copy(l.position);
    scene.add(g);
    torchGlows.push(g);
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

  // 帰還レポートは**その回の記録**を映す（§3-4）。
  // 派遣先の属性で色が変わり、HP が低かった回ほど赤く沈む。
  const lit = new THREE.Color(accent);
  const want = new THREE.Color(accent);
  /** 0〜1。その回の残り HP。低いほど画面が張り詰める */
  let strain = 0;
  let wantStrain = 0;

  return {
    scene, cam,
    setMood(m) {
      if (m.accent !== undefined) want.setHex(m.accent);
      // intensity は「どれだけ追い詰められたか」。1 で最も張り詰める
      if (m.intensity !== undefined) wantStrain = Math.max(0, Math.min(1, m.intensity));
    },
    update(t) {
      lit.lerp(want, 0.1);
      strain += (wantStrain - strain) * 0.06;

      for (const [i, tc] of torches.entries()) {
        if (tc.at >= reached) continue;
        tc.light.color.copy(lit);
        // 追い詰められた回ほど松明が不安定に揺れる
        const jitter = 1 + strain * Math.sin(t * (7 + i * 1.7)) * 0.55;
        tc.light.intensity = (6 + strain * 3) * jitter;
        torchGlows[i]?.material.color.copy(lit);
      }
      (beam.material as THREE.MeshBasicMaterial).color.copy(lit);
      head.material.color.copy(lit);

      driftMotes(motes, t, 0.5);
      head.scale.setScalar(3.1 + Math.sin(t * 4.2) * 0.35 + strain * 0.8);
      cam.position.x = Math.sin(t * 0.19) * 1.1;
      cam.position.y = 4 - reached * 6 + Math.sin(t * 0.14) * 0.3;
      cam.lookAt(0, -depth * reached * 0.55, 0);
    }
  };
}


// ---------------------------------------------------------------- ダンジョンの入口

/**
 * 派遣準備の背景（改善指示書 §3-2）。
 *
 * **これから潜る穴を覗き込む構図。** 派遣先を選び直すたびに、
 * 奥から漏れる光の色と塵の密度が変わる——「窓の外の景色が変わるように」。
 * 選ぶ行為そのものに下見の楽しさを持たせるのが狙い。
 *
 * 色は瞬間的に切り替えず、0.3秒かけて寄せる。パッと変わると
 * 「設定が切り替わった」に見えて、場所が変わった感じがしない。
 */
function buildGate(): SceneDef {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.045);

  // 被写体（穴）は画面の上から4割に。下半分は UI が覆う
  const cam = new THREE.PerspectiveCamera(44, 1, 0.1, 200);
  cam.position.set(0, 1.4, 16);
  cam.lookAt(0, -2.2, 0);

  scene.add(new THREE.AmbientLight(0x222b47, 1.0));

  const SUBJECT_Y = 3.4;

  // 岩壁。穴のまわりをぐるりと囲む
  const rim = new THREE.Group();
  const r = rng(404);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rad = 5.6 + r() * 1.3;
    const b = rock(2.0 + r() * 1.6, 2.0 + r() * 2.2, 1.8 + r(), 0x232a3e, 410 + i);
    b.position.set(Math.cos(a) * rad, SUBJECT_Y + Math.sin(a) * rad * 0.72, -1 - r() * 2);
    b.rotation.z = r() * 3;
    rim.add(b);
  }
  scene.add(rim);

  // 奥。円錐の内側を覗く形にすると、平らな穴より深く見える
  const throat = new THREE.Mesh(
    new THREE.ConeGeometry(5.2, 15, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x11162a, roughness: 1, side: THREE.BackSide, flatShading: true
    })
  );
  throat.rotation.x = Math.PI / 2;
  throat.position.set(0, SUBJECT_Y, -8);
  scene.add(throat);

  // 奥から漏れる光。派遣先の属性で色が変わる
  const glow = glowSprite(0xffffff, 9, 0.85);
  glow.position.set(0, SUBJECT_Y, -3.4);
  scene.add(glow);
  const deep = new THREE.PointLight(0xffffff, 30, 26, 2);
  deep.position.set(0, SUBJECT_Y, -5.5);
  scene.add(deep);

  // 漂う塵。深いほど濃くする
  const dust = makeMotes(200, { x: 14, y: 12, z: 10 }, 0xffffff, 0.06, 55);
  dust.position.y = SUBJECT_Y - 5;
  scene.add(dust);

  // 属性の粒。入口のまわりをゆっくり回る
  const halo = makeMotes(70, { x: 9, y: 7, z: 4 }, 0xffffff, 0.09, 56);
  halo.position.set(0, SUBJECT_Y, 0.5);
  scene.add(halo);

  const cur = new THREE.Color(GOLD);
  const target = new THREE.Color(GOLD);
  let intensity = 0.4;
  let wantIntensity = 0.4;

  return {
    scene, cam,
    setMood(m) {
      if (m.accent !== undefined) target.setHex(m.accent);
      if (m.intensity !== undefined) wantIntensity = Math.max(0, Math.min(1, m.intensity));
    },
    update(t) {
      // 0.3秒程度で寄せる（§3-2 のクロスフェード）。
      // 毎フレーム 12% ずつ詰めると 60fps で約0.3秒
      cur.lerp(target, 0.12);
      intensity += (wantIntensity - intensity) * 0.08;

      glow.material.color.copy(cur);
      deep.color.copy(cur);
      deep.intensity = 22 + intensity * 26 + Math.sin(t * 2.1) * 4;
      glow.scale.setScalar(8 + intensity * 3 + Math.sin(t * 1.7) * 0.7);
      (halo.material as THREE.PointsMaterial).color.copy(cur);
      (halo.material as THREE.PointsMaterial).opacity = 0.3 + intensity * 0.5;
      (dust.material as THREE.PointsMaterial).opacity = 0.08 + intensity * 0.34;

      driftMotes(dust, t, 0.2);
      driftMotes(halo, t, 0.34);
      halo.rotation.z = t * 0.12;
      rim.rotation.z = Math.sin(t * 0.08) * 0.02;
      cam.position.x = Math.sin(t * 0.13) * 0.5;
      cam.lookAt(0, -2.2, 0);
    }
  };
}


// ---------------------------------------------------------------- 薬草園・錬金

const LEAF = 0x9be08a;

// ---------------------------------------------------------------- 薬草の株
//
// **種類ごとに違う姿にする**（改善指示書 §6）。
// 最初は全部が同じ緑の円錐だったので、鉄草を植えても火苔を植えても
// 画面は何も変わらなかった——3D で育てて見せる意味がまるごと無かった。
//
// 色は**派遣先の属性色と同じ言葉**を使う。ここだけ新しい配色を作ると、
// せっかく覚えた「赤＝炎」がもう一度覚え直しになる。
//
// 形も変える。色だけだと、暗い温室の中では並んだ影が同じに見える
// （夜のシーンで彩度を上げすぎないのは他の画面と揃えた判断）。

interface PlantParts {
  group: THREE.Group;
  /** 育ちきったときだけ現れる部分（花・傘・結晶の穂先） */
  crown: THREE.Object3D;
  /** 種類ごとの粒（火苔の燠・雷根の火花）。無い種類は null */
  spark: THREE.Points | null;
  /** 発光させる材質。育つほど強くする */
  glow: THREE.MeshStandardMaterial[];
}

/** 鉄草。灰色がかった結晶の芽。金属質を少しだけ持たせて、他と手触りを変える */
function plantIron(): PlantParts {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8f9bb4, roughness: 0.35, metalness: 0.55, flatShading: true,
    emissive: 0x3d4a63, emissiveIntensity: 0.15
  });
  for (const [i, [x, z, h]] of ([[0, 0, 1.0], [-0.28, 0.18, 0.62], [0.3, -0.14, 0.72]] as const).entries()) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 4), mat);
    shard.position.set(x, h / 2, z);
    shard.rotation.set((i - 1) * 0.16, i * 0.7, (i - 1) * 0.2);
    group.add(shard);
  }
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), mat);
  crown.position.y = 1.06;
  group.add(crown);
  return { group, crown, spark: null, glow: [mat] };
}

/** 火苔。赤黒い苔の塊が内側から灯る。潰した多面体を寄せて「面ではなく塊」に見せる */
function plantEmber(): PlantParts {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4e1a14, roughness: 0.95, flatShading: true,
    emissive: EMBER, emissiveIntensity: 0.35
  });
  for (const [x, y, z, r] of [[0, 0.26, 0, 0.4], [-0.3, 0.18, 0.2, 0.26], [0.28, 0.2, -0.18, 0.3]] as const) {
    const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
    lump.position.set(x, y, z);
    lump.scale.y = 0.62;
    group.add(lump);
  }
  const crown = glowSprite(EMBER, 1.5, 0.55);
  crown.position.y = 0.42;
  group.add(crown);
  const spark = makeMotes(10, { x: 0.9, y: 1.0, z: 0.9 }, EMBER, 0.05, 31);
  spark.position.y = 0.2;
  group.add(spark);
  return { group, crown, spark, glow: [mat] };
}

/** 氷花。青い蕾。細い花弁を内へ倒して「まだ開いていない」形にする */
function plantFrost(): PlantParts {
  const group = new THREE.Group();
  const stem = new THREE.MeshStandardMaterial({ color: 0x35566b, roughness: 0.8, flatShading: true });
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0x7fd0ff, roughness: 0.3, flatShading: true,
    transparent: true, opacity: 0.85, emissive: FROST, emissiveIntensity: 0.3
  });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 5), stem);
  stalk.position.y = 0.35;
  group.add(stalk);
  const bud = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 4), petalMat);
    const a = (i / 5) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.09, 0.94, Math.sin(a) * 0.09);
    petal.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
    bud.add(petal);
  }
  group.add(bud);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), petalMat);
  crown.position.y = 1.22;
  group.add(crown);
  return { group, crown, spark: null, glow: [petalMat] };
}

/** 雷根。紫がかった捻れた根と、静電気のような火花 */
function plantStorm(): PlantParts {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6b4f9e, roughness: 0.7, flatShading: true,
    emissive: ARCANE, emissiveIntensity: 0.25
  });
  for (const [i, a] of [0.5, 2.6, 4.5].entries()) {
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.85, 4), mat);
    root.position.set(Math.cos(a) * 0.14, 0.42, Math.sin(a) * 0.14);
    root.rotation.set(Math.cos(a) * 0.3, i, Math.sin(a) * 0.3);
    group.add(root);
  }
  const crown = new THREE.Mesh(new THREE.TetrahedronGeometry(0.26), mat);
  crown.position.y = 0.94;
  group.add(crown);
  const spark = makeMotes(12, { x: 1.0, y: 1.3, z: 1.0 }, 0xd8c9ff, 0.055, 53);
  spark.position.y = 0.3;
  group.add(spark);
  return { group, crown, spark, glow: [mat] };
}

/** 毒茸。柄と傘。丸い傘は他の4種のどれとも輪郭が被らない */
function plantVenom(): PlantParts {
  const group = new THREE.Group();
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.9, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x59a05f, roughness: 0.75, flatShading: true,
    emissive: LEAF, emissiveIntensity: 0.22
  });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.62, 6), stalkMat);
  stalk.position.y = 0.31;
  group.add(stalk);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.position.y = 0.6;
  cap.scale.y = 0.8;
  group.add(cap);
  // 小さい方の傘。1本だけだと「きのこの絵」になるが、添えると群生に見える
  const crown = new THREE.Group();
  const small = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  small.position.set(0.3, 0.3, 0.16);
  const smallStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5), stalkMat);
  smallStalk.position.set(0.3, 0.15, 0.16);
  crown.add(small, smallStalk);
  group.add(crown);
  return { group, crown, spark: null, glow: [capMat] };
}

const PLANTS: ReadonlyArray<() => PlantParts> = [
  plantIron, plantEmber, plantFrost, plantStorm, plantVenom
];

/**
 * 育ちの段（指示書 3Dオブジェクト定義「種→芽→つぼみ→開花」）。
 *
 * 連続で伸ばすと「いつ採り頃になったか」が分からない。段にすると、
 * 温室を見ただけで「そろそろだ」が読める。
 */
function growthStage(ratio: number): number {
  if (ratio >= 1) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio >= 0.25) return 1;
  return 0;
}

/** 段ごとの背丈。種はほとんど土に埋まっている */
const STAGE_SCALE = [0.22, 0.5, 0.78, 1.0];

/**
 * 1枠ぶんの株。中身は差し替えられる。
 *
 * 毎フレーム作り直すと GPU 資源が積み上がるので、
 * **種類が変わったときだけ**中身を作り直し、段は scale で見せる。
 */
class PlantSlot {
  readonly group = new THREE.Group();
  /** 今**実際に**組み上がっている種類。検証はこちらを見る（意図ではなく結果） */
  built = -1;
  private kind = -2;
  private parts: PlantParts | null = null;
  private stage = -1;

  set(kind: number, ratio: number): void {
    if (kind !== this.kind) {
      if (this.parts) {
        this.parts.group.removeFromParent();
        disposeTree(this.parts.group);
      }
      this.parts = null;
      this.kind = kind;
      const make = PLANTS[kind];
      if (make) {
        this.parts = make();
        this.group.add(this.parts.group);
      }
      this.stage = -1;
      this.built = this.parts ? kind : -1;
    }
    if (!this.parts) return;
    const st = growthStage(ratio);
    if (st !== this.stage) {
      this.stage = st;
      this.parts.group.scale.setScalar(STAGE_SCALE[st] ?? 1);
      // 穂先と粒は「育ちきった／もうすぐ」の合図。早く出すと段の意味が消える
      this.parts.crown.visible = st >= 3;
      if (this.parts.spark) this.parts.spark.visible = st >= 2;
    }
  }

  /** 揺れと発光。育ちきった枠だけ強く光らせて、採り頃を目立たせる */
  update(t: number, i: number): void {
    if (!this.parts) return;
    this.parts.group.rotation.z = Math.sin(t * 0.8 + i * 1.3) * 0.045;
    const lit = this.stage >= 3 ? 0.55 + Math.sin(t * 1.6 + i) * 0.16 : 0.12 + this.stage * 0.05;
    for (const m of this.parts.glow) m.emissiveIntensity = lit;
    if (this.parts.spark?.visible) driftMotes(this.parts.spark, t, 0.3);
  }
}

/** 部分木の GPU 資源を返す。株の差し替えで積み上がるのを防ぐ */
function disposeTree(root: THREE.Object3D): void {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
    else if (mat) mat.dispose();
  });
}

/** 空き枠に立てる木の札。「土だけ」より「空いている」がはっきり読める */
function bedMarker(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b563c, roughness: 1, flatShading: true });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), wood);
  post.position.y = 0.35;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.06), wood);
  board.position.y = 0.66;
  board.rotation.z = 0.08;
  g.add(post, board);
  return g;
}

/**
 * 買っていない枠に置く「＋」（指示書 §7）。
 *
 * 専用のカードを常時出す代わりに、温室の空きスペースそのものを押させる。
 * **当たり判定はここには無い**——透明なボタンを DOM 側が重ねる（SceneDef.hotspot）。
 */
function expandPlus(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe8c8, transparent: true, opacity: 0.34, roughness: 0.4,
    emissive: LEAF, emissiveIntensity: 0.6
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.24), mat);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.5, 0.24), mat);
  g.add(bar, post);
  const halo = glowSprite(LEAF, 3.2, 0.24);
  g.add(halo);
  const plot = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.08, 2.2),
    new THREE.MeshStandardMaterial({
      color: LEAF, transparent: true, opacity: 0.10, emissive: LEAF, emissiveIntensity: 0.25
    })
  );
  plot.position.y = -0.9;
  g.add(plot);
  return g;
}


/**
 * 薬草園（新機能指示書「3Dオブジェクト定義」）。
 *
 * **拠点の夜に対する対比を作る。** 紺の夜空の中で、ここだけ緑〜黄緑に
 * ほんのり明るい——「命が育っている」場所として温度差を付ける。
 *
 * 収穫できるものがあるほど蛍が増えて明るくなる。
 * 何もせず眺めているだけで「そろそろ採り頃だ」が分かる。
 */
function buildGarden(): SceneDef {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070c10);
  scene.fog = new THREE.FogExp2(0x0a1410, 0.03);

  // 温室の全体が入る距離まで引く。近すぎると株だけが画面を埋めて、
  // 「ガラスの箱の中で育っている」という肝心の絵が消える
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  cam.position.set(0, 8.5, 30);
  cam.lookAt(0, -3.4, 0);

  scene.add(new THREE.AmbientLight(0x3d5a44, 1.9));
  const moon = new THREE.DirectionalLight(0xbfe8c8, 1.1);
  moon.position.set(-6, 10, 5);
  scene.add(moon);

  const stars = makeStars(160, 8);
  scene.add(stars);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: 0x1e2a22, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  scene.add(ground);

  // 温室。骨組みと半透明のガラス
  const house = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(11, 5.2, 7),
    new THREE.MeshStandardMaterial({
      color: 0x9fd8c0, transparent: true, opacity: 0.10,
      roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide
    })
  );
  glass.position.y = 2.6;
  house.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b4a3f, roughness: 0.9, flatShading: true });
  for (const [x, z] of [[-5.5, -3.5], [5.5, -3.5], [-5.5, 3.5], [5.5, 3.5]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.2, 0.24), frameMat);
    post.position.set(x, 2.6, z);
    house.add(post);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 0.22), frameMat);
  ridge.position.y = 5.3;
  house.add(ridge);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(7.6, 1.6, 4),
    new THREE.MeshStandardMaterial({
      color: 0x9fd8c0, transparent: true, opacity: 0.12, side: THREE.DoubleSide
    })
  );
  roof.position.y = 6.0;
  roof.rotation.y = Math.PI / 4;
  house.add(roof);
  scene.add(house);

  // 畑ベッドと株（改善指示書 §6）。
  //
  // **枠の数と画面の数を必ず合わせる。** 以前は常に6本の苗を描いていたので、
  // 「育成 2/2」と書いてある横で3本が育っているように見えていた。
  // 数字と絵が食い違うと、どちらを信じればよいのか分からなくなる。
  // ここでは Mood.slots の要素数がそのまま開いている枠の数になる。
  const BED_XZ: ReadonlyArray<readonly [number, number]> = [
    [-3.2, -1.6], [0, -1.6], [3.2, -1.6],
    [-3.2, 1.6], [0, 1.6], [3.2, 1.6]
  ];
  const beds = new THREE.Group();
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x33281d, roughness: 1, flatShading: true });
  interface Bed { root: THREE.Group; soil: THREE.Mesh; marker: THREE.Object3D; plant: PlantSlot }
  const bedList: Bed[] = [];
  for (const [x, z] of BED_XZ) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.2), soilMat);
    soil.position.y = 0.05;
    root.add(soil);
    const marker = bedMarker();
    marker.position.set(-0.85, 0.2, 0.7);
    root.add(marker);
    const plant = new PlantSlot();
    plant.group.position.y = 0.2;
    plant.group.scale.setScalar(1.5);   // 引きの絵なので株を少し大きく見せる
    root.add(plant.group);
    root.visible = false;
    // 検証用の印（§7.1 G14/G15）。「枠の数と絵の数が合っているか」は
    // 見た目の問題に見えて、実は数の問題なので、数で確かめられるようにする
    root.userData.role = 'bed';
    root.userData.plantKind = -1;
    beds.add(root);
    bedList.push({ root, soil, marker, plant });
  }
  scene.add(beds);

  // 買っていない枠の「＋」。押させるのは DOM 側の透明なボタン（hotspot）。
  //
  // **場所は固定する。** 「次に買える枠の位置」に置いていたが、
  // 手前の列（z が大きい）に回った途端に画面の下へ落ち、
  // 板の裏に隠れて押せなくなった（U11 が拾った）。
  // 温室の空きスペースのうち、板が絶対に来ない上側の帯に据える。
  const plus = expandPlus();
  plus.position.set(4.4, 2.9, -2.4);
  plus.visible = false;
  scene.add(plus);

  // 蛍。収穫できるものがあるほど増やす
  const fireflies = makeMotes(90, { x: 12, y: 5, z: 7 }, LEAF, 0.085, 71);
  fireflies.position.y = 1.6;
  scene.add(fireflies);

  const inner = new THREE.PointLight(LEAF, 16, 20, 2);
  inner.position.set(0, 2.6, 1);
  scene.add(inner);
  const bloom = glowSprite(LEAF, 7, 0.5);
  bloom.position.set(0, 2.2, 0.5);
  scene.add(bloom);

  let ready = 0;
  let wantReady = 0;
  const live: Bed[] = [];

  return {
    scene, cam, hotspot: plus,
    setMood(m) {
      if (m.intensity !== undefined) wantReady = Math.max(0, Math.min(1, m.intensity));
      if (m.slots) {
        live.length = 0;
        for (const [i, bed] of bedList.entries()) {
          const slot = m.slots[i];
          bed.root.visible = slot !== undefined;
          if (!slot) continue;
          live.push(bed);
          bed.plant.set(slot.kind, slot.ratio);
          // **意図ではなく結果を書く。** slot.kind をそのまま写すと、
          // 「渡した番号」が記録されるだけで、実際に別の株が組まれていても
          // 検証が通ってしまう（変異試験で素通りした）
          bed.root.userData.plantKind = bed.plant.built;
          // 空き枠は土と札だけ。何も植わっていないことが形で分かるようにする
          bed.marker.visible = slot.kind < 0;
        }
        // 開いている枠を画面の中央へ寄せる。2枠のときに左端へ固まっていると、
        // 温室の右3分の2が意味もなく空いた絵になる
        let sum = 0;
        for (let i = 0; i < m.slots.length; i++) sum += BED_XZ[i]?.[0] ?? 0;
        const mid = m.slots.length > 0 ? sum / m.slots.length : 0;
        beds.position.x = -mid * 0.8;
        plus.visible = m.slots.length < BED_XZ.length && m.canExpand === true;
      }
    },
    update(t) {
      ready += (wantReady - ready) * 0.06;
      twinkle(stars, t);
      driftMotes(fireflies, t, 0.16);
      (fireflies.material as THREE.PointsMaterial).opacity = 0.22 + ready * 0.6;
      inner.intensity = 11 + ready * 16 + Math.sin(t * 1.3) * 1.4;
      bloom.scale.setScalar(6 + ready * 3 + Math.sin(t * 1.1) * 0.4);
      for (const [i, bed] of live.entries()) bed.plant.update(t, i);
      if (plus.visible) {
        // ゆっくり息をする。動いているものは「押せそう」に見える
        plus.scale.setScalar(0.9 + Math.sin(t * 1.8) * 0.06);
        plus.rotation.y = Math.sin(t * 0.4) * 0.25;
      }
      cam.position.x = Math.sin(t * 0.12) * 0.7;
      cam.lookAt(0, -3.4, 0);
    }
  };
}

/**
 * 錬金工房（新機能指示書「錬金工房シーン」）。
 *
 * 大鍋ひとつ。選んでいる薬の色が液面に乗り、調合中は泡が立つ。
 * 完成の見せ方は開封のカットインに寄せて、画面ごとのトーンを揃える。
 */
function buildAlchemy(): SceneDef {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080709);
  scene.fog = new THREE.FogExp2(0x0b0a0d, 0.04);

  const SUBJECT_Y = 2.2;
  // 少し上から覗き込む。真横だと液面（色が変わる主役）が線になって消える
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  // 鍋の全体が入る距離まで引く。15 では鍋の内側だけで画面が埋まり、
  // 上に浮かせた内訳（§7）と液面が重なって、色が変わる主役が消えていた
  cam.position.set(0, SUBJECT_Y + 5.6, 21);
  cam.lookAt(0, SUBJECT_Y - 2.2, 0);

  scene.add(new THREE.AmbientLight(0x2c2838, 1.5));
  const key = new THREE.DirectionalLight(0xd8cfe8, 1.0);
  key.position.set(3, 6, 6);
  scene.add(key);

  // 大鍋
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 1.9, 2.2, 14, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2b2f3c, roughness: 0.7, metalness: 0.55,
      side: THREE.DoubleSide, flatShading: true
    })
  );
  pot.position.y = SUBJECT_Y;
  scene.add(pot);
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.14, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a5163, roughness: 0.5, metalness: 0.7, flatShading: true })
  );
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = SUBJECT_Y + 1.1;
  scene.add(rimRing);

  // 液面。色は Mood で変わる
  const brew = new THREE.Mesh(
    new THREE.CircleGeometry(2.42, 20),
    new THREE.MeshStandardMaterial({
      color: 0x6f7f9e, emissive: 0x6f7f9e, emissiveIntensity: 0.7,
      roughness: 0.25, metalness: 0.1
    })
  );
  brew.rotation.x = -Math.PI / 2;
  brew.position.y = SUBJECT_Y + 0.72;
  scene.add(brew);

  // 竈の火
  const fire = glowSprite(0xff8348, 3.4, 0.9);
  fire.position.set(0, SUBJECT_Y - 1.4, 0.6);
  scene.add(fire);

  // 泡。液面から立ちのぼる
  const bubbles = makeMotes(60, { x: 3.4, y: 5, z: 3.4 }, 0xffffff, 0.075, 88);
  bubbles.position.set(0, SUBJECT_Y + 0.8, 0);
  scene.add(bubbles);

  const potLight = new THREE.PointLight(0x6f7f9e, 16, 18, 2);
  potLight.position.set(0, SUBJECT_Y + 1.4, 0);
  scene.add(potLight);
  const halo = glowSprite(0x6f7f9e, 6, 0.55);
  halo.position.set(0, SUBJECT_Y + 1.0, 0);
  scene.add(halo);

  const cur = new THREE.Color(0x6f7f9e);
  const want = new THREE.Color(0x6f7f9e);
  let heat = 0.15;
  let wantHeat = 0.15;

  return {
    scene, cam,
    setMood(m) {
      if (m.accent !== undefined) want.setHex(m.accent);
      if (m.intensity !== undefined) wantHeat = Math.max(0, Math.min(1, m.intensity));
    },
    update(t) {
      cur.lerp(want, 0.12);
      heat += (wantHeat - heat) * 0.09;

      const bm = brew.material as THREE.MeshStandardMaterial;
      bm.color.copy(cur);
      bm.emissive.copy(cur);
      bm.emissiveIntensity = 0.35 + heat * 1.1 + Math.sin(t * 2.4) * 0.08;
      potLight.color.copy(cur);
      potLight.intensity = 8 + heat * 26;
      (halo.material as THREE.SpriteMaterial).color.copy(cur);
      halo.scale.setScalar(5 + heat * 3 + Math.sin(t * 1.9) * 0.35);
      (bubbles.material as THREE.PointsMaterial).color.copy(cur);
      (bubbles.material as THREE.PointsMaterial).opacity = 0.1 + heat * 0.6;
      // 煮立つほど泡が速い
      driftMotes(bubbles, t, 0.3 + heat * 1.4);
      fire.scale.setScalar(3 + heat * 1.2 + Math.sin(t * 8.1) * 0.25);
      cam.position.x = Math.sin(t * 0.11) * 0.4;
      cam.lookAt(0, SUBJECT_Y - 2.6, 0);
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
  // 台座と同じ組み方。中心を camera より 1.5 上に置いて、上から3割に見せる。
  // **見せ場の高さは1箇所で決める。** 光条・光輪・紙片・被写体を
  // 別々の数字で置いていたら、光が集まる点と品の位置がずれていた
  const SUBJECT_Y = 2.75;
  cam.position.set(0, SUBJECT_Y - 1.5, 10.6);
  cam.lookAt(0, SUBJECT_Y - 1.5, 0);

  scene.add(new THREE.AmbientLight(0x1a2038, 0.7));

  // 品を載せる場所。カットインでは DOM の明細板が画面の下半分を占めるので、
  // 3D 側の主役は上へ逃がす（両方が真ん中を取り合うと、どちらも損をする）
  const mount = new THREE.Group();
  mount.position.y = SUBJECT_Y;
  scene.add(mount);

  // 品が載るまでの仮の姿。八面体を2枚重ねて、内側を発光、外側をワイヤで包む
  const placeholder = new THREE.Group();
  placeholder.position.y = SUBJECT_Y;
  scene.add(placeholder);
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.65,
      roughness: 0.22, metalness: 0.9, flatShading: true
    })
  );
  placeholder.add(core);
  const cage = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.9, 0),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.32 })
  );
  placeholder.add(cage);

  const halo = glowSprite(color, 6.5, 0.42);
  halo.position.y = SUBJECT_Y;
  scene.add(halo);
  const l = new THREE.PointLight(color, 7, 22, 2);
  l.position.y = SUBJECT_Y;
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
    s.position.set(Math.cos(a) * Math.cos(b) * d, SUBJECT_Y + Math.sin(b) * d * 0.8, Math.sin(a) * Math.cos(b) * d * 0.5);
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
  rays.position.y = SUBJECT_Y;
  scene.add(rays);

  const motes = makeMotes(120, { x: 12, y: 10, z: 8 }, color, 0.07, 31);
  motes.position.y = -5;
  scene.add(motes);

  return {
    scene, cam, mount, placeholder,
    update(t) {
      for (const child of mount.children) animateModel(child, t);
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

  // 縦持ちなので、画面の下半分は必ず UI（明細板と ActionBar）が占める。
  // 被写体は**上から1割〜5割**に収める。
  //
  // カメラは水平に構える。傾けると「高さ→画面位置」が非線形になり、
  // 何度も勘で数字を動かす羽目になる。水平なら
  //   ndc_y = (y - camY) / (距離 × tan(画角/2))
  // で一意に決まるので、被写体の中心をどこに置けばよいかが計算できる。
  // 距離10.3・画角40°で半分の高さが 3.75 ワールド単位。
  // 中心を camera より 1.43 上に置くと、画面の +0.38（＝上から31%）に来る。
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  cam.position.set(0, 0.4, 10.3);
  cam.lookAt(0, 0.4, 0);
  const SUBJECT_Y = 1.83;

  // 台座は「背後で何かが光っている」程度に沈めていた名残で暗く、
  // 実際に品を載せてみると鎧が影の塊になった。被写体を見せる明るさに上げる
  // 鎧のような広い金属面は、強い一点光源で必ず白く飛ぶ。
  // 環境光を厚めに、直射を控えめにすると、形を残したまま明るくできる
  scene.add(new THREE.AmbientLight(0x33406e, 2.6));
  const key = new THREE.SpotLight(0xdfe8ff, 62, 24, 0.9, 0.6, 1.2);
  key.position.set(2.6, 5.6, 4.6);
  key.target.position.set(0, 1.6, 0);
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.PointLight(color, 18, 18, 2);
  rim.position.set(-3.2, 3.4, -1.2);
  scene.add(rim);
  const fill = new THREE.PointLight(0x8ea6ff, 9, 18, 2);
  fill.position.set(3.2, 1.4, 3.6);
  scene.add(fill);

  // 台座は飾りであって主役ではない。被写体を見せるために光を上げたとき、
  // 一番広い面であるここが真っ先に白く飛んで、載っている品と明るさを競っていた
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.3, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0x161b2c, roughness: 0.98, flatShading: true })
  );
  dais.position.y = SUBJECT_Y - MODEL_HEIGHT * 0.5 - 0.34;
  dais.scale.setScalar(0.78);
  scene.add(dais);

  // 台の上は空にしておく。何を載せるかは画面が決める（Stage.setModel）。
  // 品を選んでいないときのために、代わりの1本を置く
  const mount = new THREE.Group();
  mount.position.y = SUBJECT_Y;
  scene.add(mount);
  const placeholder = buildItemModel({ baseId: 'sword', rarity: 'common', element: 'physical' });
  placeholder.position.y = SUBJECT_Y;
  scene.add(placeholder);

  const halo = glowSprite(color, 6, 0.5);
  halo.position.y = SUBJECT_Y - 0.3;
  scene.add(halo);

  const motes = makeMotes(90, { x: 7, y: 7, z: 5 }, color, 0.055, 41);
  motes.position.y = -1.4;
  scene.add(motes);

  // 展示台の光はレアリティで変える（§3-3）。
  // 並=白／上質=青白／稀少=紫／遺物=金
  const lit = new THREE.Color(color);
  const want = new THREE.Color(color);
  let aura = 0.4;
  let wantAura = 0.4;

  return {
    scene, cam, mount, placeholder,
    setMood(m) {
      if (m.accent !== undefined) want.setHex(m.accent);
      if (m.intensity !== undefined) wantAura = Math.max(0, Math.min(1, m.intensity));
    },
    update(t) {
      // 選び直すたびに 0.2〜0.3 秒でにじり寄る（§3-3 の切替演出）
      lit.lerp(want, 0.14);
      aura += (wantAura - aura) * 0.1;
      rim.color.copy(lit);
      rim.intensity = 14 + aura * 26;
      (halo.material as THREE.SpriteMaterial).color.copy(lit);
      (motes.material as THREE.PointsMaterial).color.copy(lit);
      (motes.material as THREE.PointsMaterial).opacity = 0.18 + aura * 0.5;
      for (const child of mount.children) animateModel(child, t);
      if (placeholder.visible) animateModel(placeholder, t);
      halo.scale.setScalar(5.6 + aura * 2.4 + Math.sin(t * 2.1) * 0.5);
      driftMotes(motes, t, 0.26 + aura * 0.3);
    }
  };
}
// ---------------------------------------------------------------- 実行系

export const SCENES = {
  // インベントリ・図鑑の背景。3Dは主役ではないので、
  // 台座の光量を落として「後ろで何かが光っている」程度に留める
  vault: () => buildPedestal({ color: FROST }),
  base: buildBase,
  dispatch: buildGate,
  report: () => buildDescent({ reached: 0.78, accent: EMBER }),
  reveal: () => buildReveal({ color: 0xffc76b }),
  revealRare: () => buildReveal({ color: ARCANE }),
  pedestal: () => buildPedestal({ color: ARCANE }),
  garden: buildGarden,
  alchemy: buildAlchemy,
  pedestalFrost: () => buildPedestal({ color: FROST })
};

export interface Stage {
  load(name: SceneName): void;
  /** 3D 側に画面の状態を渡す（§3）。文字は渡さない */
  setMood(m: Mood): void;
  /**
   * 3D 側に載せる装備。null で仮の姿へ戻す。
   *
   * 画面ごとに作り直すのではなく、Stage が1点だけ持つ。
   * 開封で1個ずつ捲るたびに Group を作っては捨てるので、
   * 前のものを確実に返さないと GPU 資源が積み上がる。
   */
  setModel(spec: ModelSpec | null): void;
  /**
   * 3D 側の「押させたい物体」が今どこに映っているか。0〜1 の画面座標。
   * 見えていなければ null。**当たり判定そのものは DOM 側が置く**（§6.2）。
   */
  hotspot(): { x: number; y: number } | null;
  /**
   * 検証用。`?probe=1` のときだけ今のシーンを返す（それ以外は null）。
   *
   * 3D の「見た目」は測れないが、**数**は測れる——
   * 「畑が2枠なのに苗が3本立っている」は絵の good/bad ではなく食い違いで、
   * 目視ではなく表明で捕まえるべきものだった（改善指示書 §6）。
   */
  debugScene(): THREE.Scene | null;
  resize(w: number, h: number): void;
  renderAt(t: number): void;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  // 検証時だけ描画結果を読めるようにする（§7.1 U16）。
  // 常時 true にすると毎フレームのコピーが増えるので、URL で明示したときだけ。
  const readable = new URLSearchParams(location.search).get('probe') === '1';
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, preserveDrawingBuffer: readable
  });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  let current: SceneDef | null = null;
  let composer: EffectComposer | null = null;
  let w = 0, h = 0;
  /** 今載せている装備。シーンを跨いでも同じものを見せ続ける */
  let modelSpec: ModelSpec | null = null;
  let model: THREE.Group | null = null;

  function clearModel(): void {
    if (!model) return;
    model.removeFromParent();
    disposeModel(model);
    model = null;
  }

  /** 今のシーンに、今の装備を反映する。 */
  function applyModel(): void {
    clearModel();
    if (!current?.mount) return;
    if (modelSpec) {
      model = buildItemModel(modelSpec);
      current.mount.add(model);
    }
    if (current.placeholder) current.placeholder.visible = modelSpec === null;
  }

  function setMood(m: Mood): void {
    current?.setMood?.(m);
  }

  function setModel(spec: ModelSpec | null): void {
    const same = spec && modelSpec
      && spec.baseId === modelSpec.baseId
      && spec.rarity === modelSpec.rarity
      && spec.element === modelSpec.element;
    if (same || (!spec && !modelSpec)) return;
    modelSpec = spec;
    applyModel();
  }

  /**
   * 「＋」のような 3D の目印を、DOM が押せる場所へ翻訳する。
   *
   * Raycaster で canvas を直接叩けば短く書けるが、それをやると
   * 「押せるものが押せるか」を DOM から測れなくなり、
   * U3（44px 以上）も U11（本当に押せるか）も新しい操作を素通りする。
   * World層は座標だけを返し、透明なボタンは Interface 層が置く。
   */
  const projected = new THREE.Vector3();
  function hotspot(): { x: number; y: number } | null {
    const o = current?.hotspot;
    if (!o || !o.visible) return null;
    o.getWorldPosition(projected);
    projected.project(current!.cam);
    // カメラの後ろに回った物体は z > 1 になる。前に出たときだけ返す
    if (projected.z > 1) return null;
    const x = (projected.x + 1) / 2;
    const y = (1 - projected.y) / 2;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function debugScene(): THREE.Scene | null {
    return readable ? current?.scene ?? null : null;
  }

  function resize(nw: number, nh: number): void {
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    if (current) {
      current.cam.aspect = w / h;
      current.cam.updateProjectionMatrix();
    }
    if (composer) composer.setSize(w, h);
  }

  /**
   * シーンは**捨てずに取っておく**（§3 共通基盤方針）。
   *
   * 以前は遷移のたびに作り直していたので、拠点へ戻るたびに
   * 星も焚き火も塵も最初からやり直しになっていた。
   * 「裏で常駐している世界」に見せたいなら、作り直してはいけない。
   * 数は8つで、どれも点と低ポリだけなので抱えても軽い。
   */
  const cache = new Map<SceneName, SceneDef>();

  function load(name: SceneName): void {
    const f = SCENES[name];
    if (!f) throw new Error(`unknown scene: ${name}`);
    if (current) clearModel();
    const hit = cache.get(name);
    current = hit ?? f();
    if (!hit) cache.set(name, current);
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
    applyModel();
  }

  function renderAt(t: number): void {
    if (!current || !composer) return;
    current.update(t);
    composer.render();
  }

  /** 画面を離れるときにGPU資源を返す。放置すると遷移のたびに積み上がる。 */
  /** シーン1つぶんの資源を返す。 */
  function disposeScene(scene: THREE.Scene): void {
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else if (mat) mat.dispose();
    });
  }

  function dispose(): void {
    clearModel();
    // シーンは抱えたままなので、終うときに全部返す
    for (const def of cache.values()) disposeScene(def.scene);
    cache.clear();
    current = null;
    composer?.dispose();
    composer = null;
  }

  return { load, setMood, setModel, hotspot, debugScene, resize, renderAt, dispose };
}

export type SceneName = keyof typeof SCENES;
