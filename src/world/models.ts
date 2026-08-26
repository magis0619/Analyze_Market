import * as THREE from 'three';

// 装備の3Dモデル（docs/UI-SPEC.md §6）。
//
// World層なので、ここも**文字を一切持たない**。形と色だけで
// 「何を手にしたか」を伝える。名前・数値は必ず DOM 側が出す。
//
// 外部のモデルファイルは読まない。9種のベース × 4レアリティ × 5属性 =
// 180通りをアセットで持つと、追加のたびに作り直しになるし、
// 読み込みの失敗という新しい壊れ方が増える。ここでは箱と円柱から組む——
// 低ポリの平面シェーディングは、この作品の他の3Dと同じ言葉で喋る。
//
// 見せている場所:
//   開封のカットイン … 開けた品そのもの
//   所持品の明細     … 選んでいる品
//
// 形の狙いは**一目でベースが分かること**。短剣と両手剣が同じ形だと、
// モデルを出す意味がない。刃渡り・幅・柄の長さで6種を描き分ける。

export type ModelRarity = 'common' | 'fine' | 'rare' | 'relic';
export type ModelElement = 'physical' | 'fire' | 'lightning' | 'poison' | 'ice';

export interface ModelSpec {
  baseId: string;
  rarity: ModelRarity;
  element: ModelElement;
}

/** 属性の色。UI-SPEC §4.3 の役割色と揃える（DOM 側の .ic と同じ意味） */
const ELEMENT_COLOR: Record<ModelElement, number> = {
  physical: 0xc3ccdf,
  fire: 0xff8348,
  lightning: 0xe9be74,
  poison: 0x7ddc8a,
  ice: 0x6fc7ff
};

/** レアリティの色。DOM 側の --r-* と同じ値 */
const RARITY_COLOR: Record<ModelRarity, number> = {
  common: 0x8d97b0,
  fine: 0x5aa9ff,
  rare: 0xa77dff,
  relic: 0xffc76b
};

/**
 * レアリティで変えるのは**素材の質**であって形ではない。
 * 形が変わると「同じ短剣なのに別物」に見えて、比較の助けにならない。
 */
interface Finish {
  /** 刃・板金の金属らしさ */
  metalness: number;
  roughness: number;
  /** 装飾（宝珠・縁取り）の自己発光 */
  emissive: number;
  /** 装飾を足す数。並は0、遺物は3 */
  ornaments: number;
}

// metalness を 1 に寄せるほど「磨いた」ではなく「鏡」になる。
// 鏡が映すのは暗い部屋なので、上位ほど**黒く沈む**——
// 実際、遺物の短剣が並より暗く見えていた。拡散反射を残す。
const FINISH: Record<ModelRarity, Finish> = {
  common: { metalness: 0.42, roughness: 0.68, emissive: 0.0, ornaments: 0 },
  fine: { metalness: 0.58, roughness: 0.48, emissive: 0.45, ornaments: 1 },
  rare: { metalness: 0.70, roughness: 0.36, emissive: 0.85, ornaments: 2 },
  relic: { metalness: 0.80, roughness: 0.26, emissive: 1.3, ornaments: 3 }
};

const WOOD = 0x3a2418;
const LEATHER = 0x2b2118;

/**
 * 鋼。
 *
 * `dim` は面の広さに対する補正。刃1枚のために組んだ明るさで
 * 鎧の胴を照らすと、受ける光の量が桁違いで真っ白に飛ぶ——
 * 実際、中鎧と重鎧が形の分からない光の塊になっていた。
 */
function steel(spec: ModelSpec, dim = 1, rough = 0): THREE.MeshStandardMaterial {
  const f = FINISH[spec.rarity];
  // 物理は素の鋼、属性持ちは刃そのものに色が乗る
  const base = spec.element === 'physical' ? 0xcfd8ee : ELEMENT_COLOR[spec.element];
  const tint = new THREE.Color(base).multiplyScalar(dim).getHex();
  return new THREE.MeshStandardMaterial({
    color: tint,
    metalness: f.metalness,
    roughness: Math.min(0.96, f.roughness + rough),
    emissive: spec.element === 'physical' ? 0x000000 : ELEMENT_COLOR[spec.element],
    emissiveIntensity: spec.element === 'physical' ? 0 : f.emissive * 0.16,
    flatShading: true
  });
}

function plain(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, flatShading: true });
}

/**
 * 縁取り。**面積が大きいので光らせすぎない。**
 *
 * 鎧の襟と腰帯は剣の鍔よりずっと広い。同じ強さで光らせたら
 * ブルームが拾って画面が真っ白になり、鎧の形が消えていた。
 * 強く光ってよいのは宝珠（点）だけにする。
 */
function trim(spec: ModelSpec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: RARITY_COLOR[spec.rarity],
    metalness: 0.72, roughness: 0.38,
    emissive: RARITY_COLOR[spec.rarity],
    emissiveIntensity: FINISH[spec.rarity].emissive * 0.16,
    flatShading: true
  });
}

/** 宝珠。レアリティが上がるほど数が増え、強く光る。 */
function gem(spec: ModelSpec, size: number): THREE.Mesh {
  const c = RARITY_COLOR[spec.rarity];
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.5 + FINISH[spec.rarity].emissive * 0.7,
      metalness: 0.7, roughness: 0.18
    })
  );
}

function box(w: number, h: number, d: number, m: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.y = y;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.y = y;
  return mesh;
}

// ---------------------------------------------------------------- 武器

/**
 * 刃物の共通形。刃渡り・刃幅・鍔幅・柄長で6種を描き分ける。
 * 数字は data/bases.ts の性格と合わせてある——
 * 短剣は短く速そうに、両手剣は長く重そうに見えること。
 */
function bladed(spec: ModelSpec, p: {
  blade: number; width: number; guard: number; grip: number; taper?: number;
}): THREE.Group {
  const g = new THREE.Group();
  const mat = steel(spec);
  const f = FINISH[spec.rarity];

  const gripTop = p.grip * 0.5;
  g.add(box(p.width, p.blade, p.width * 0.28, mat, gripTop + p.blade / 2));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(p.width * (p.taper ?? 0.62), p.blade * 0.16, 4), mat);
  tip.position.y = gripTop + p.blade + p.blade * 0.08;
  g.add(tip);

  // 血溝。刃の中心に一段暗い線を入れると、板ではなく刃に見える
  g.add(box(p.width * 0.24, p.blade * 0.86, p.width * 0.34,
    plain(0x59637d, 0.5), gripTop + p.blade / 2));

  g.add(box(p.guard, p.width * 0.7, p.width * 0.7, trim(spec), gripTop));
  g.add(cyl(p.width * 0.42, p.width * 0.46, p.grip, 8, plain(LEATHER), 0));
  const pommel = gem(spec, p.width * 0.75);
  pommel.position.y = -p.grip * 0.5 - p.width * 0.5;
  g.add(pommel);

  // 鍔の宝珠。上位ほど増える
  for (let i = 0; i < f.ornaments; i++) {
    const s = gem(spec, p.width * 0.36);
    const side = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1);
    s.position.set(side * p.guard * 0.42, gripTop + (i === 0 ? p.width * 0.55 : 0), 0);
    g.add(s);
  }
  return g;
}

function buildDagger(spec: ModelSpec): THREE.Group {
  return bladed(spec, { blade: 1.25, width: 0.20, guard: 0.62, grip: 0.46, taper: 0.7 });
}

function buildSword(spec: ModelSpec): THREE.Group {
  return bladed(spec, { blade: 2.35, width: 0.22, guard: 1.05, grip: 0.62 });
}

function buildGreatsword(spec: ModelSpec): THREE.Group {
  return bladed(spec, { blade: 3.15, width: 0.38, guard: 1.62, grip: 1.15, taper: 0.55 });
}

/** 槍。穂先は小さく、長い柄で「間合いが長い」を形にする。 */
function buildSpear(spec: ModelSpec): THREE.Group {
  const g = new THREE.Group();
  const mat = steel(spec);
  g.add(cyl(0.075, 0.085, 3.5, 8, plain(WOOD), 0.55));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.95, 4), mat);
  head.position.y = 2.72;
  g.add(head);
  g.add(box(0.34, 0.1, 0.1, trim(spec), 2.22));
  const butt = gem(spec, 0.15);
  butt.position.y = -1.24;
  g.add(butt);
  for (let i = 0; i < FINISH[spec.rarity].ornaments; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 4, 8), trim(spec));
    r.rotation.x = Math.PI / 2;
    r.position.y = 1.5 - i * 0.6;
    g.add(r);
  }
  return g;
}

/** 弓。曲げた腕と弦。矢は番えない（撃つ場面は見せない作品なので）。 */
function buildBow(spec: ModelSpec): THREE.Group {
  const g = new THREE.Group();
  const mat = steel(spec);
  // 弧。半径 R の円弧を 0〜SPAN まで描き、中央が +X を向くように回す
  const R = 1.35;
  const SPAN = Math.PI * 1.12;
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.075, 5, 16, SPAN),
    plain(WOOD, 0.85)
  );
  arc.rotation.z = -SPAN / 2;
  g.add(arc);

  // 弦と握りは**弧から計算する**。座標を手で置いていたときは
  // 握りが弓の反対側の空中に浮き、光る板が1枚漂っていた。
  // 弧の両端は回転後に (R cos(±SPAN/2), ∓R sin(SPAN/2))
  const endX = R * Math.cos(SPAN / 2);
  const endY = R * Math.sin(SPAN / 2);
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, endY * 2, 4),
    plain(0xd8dcea, 0.6)
  );
  string.position.x = endX;
  g.add(string);

  // 握りは弧の中央（＝+X の一番外）。ここだけ材質がレアリティで変わる
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.56, 0.19), mat);
  grip.position.x = R;
  g.add(grip);
  // 宝珠は弧の上に載せる。座標を決め打ちすると弧から浮いて、
  // 何もない空中で光る変な物体になっていた
  for (let i = 0; i < FINISH[spec.rarity].ornaments; i++) {
    const t = gem(spec, 0.13);
    const a = SPAN * (0.5 + (i - 1) * 0.3) - SPAN / 2;
    t.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    g.add(t);
  }
  // 弓は板のように平たい。台座の上でぐるりと回すと、半周のあいだ
  // 真横を向いて**ただの棒**になる。左右に振るだけにする
  g.userData.swing = true;
  return g;
}

/** 杖。頂きの結晶が主役。属性を最も強く出すベース。 */
function buildStaff(spec: ModelSpec): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.085, 0.1, 3.2, 7, plain(WOOD), 0.1));

  const c = ELEMENT_COLOR[spec.element];
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 0),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c,
      emissiveIntensity: 1.4 + FINISH[spec.rarity].emissive * 0.6,
      metalness: 0.3, roughness: 0.1
    })
  );
  core.position.y = 2.02;
  g.add(core);

  // 結晶を抱える爪
  for (let i = 0; i < 3; i++) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.62, 4), trim(spec));
    const a = (i / 3) * Math.PI * 2;
    claw.position.set(Math.cos(a) * 0.3, 1.76, Math.sin(a) * 0.3);
    claw.rotation.z = -Math.cos(a) * 0.4;
    claw.rotation.x = Math.sin(a) * 0.4;
    g.add(claw);
  }
  for (let i = 0; i < FINISH[spec.rarity].ornaments; i++) {
    const s = gem(spec, 0.11);
    const a = (i / 3) * Math.PI * 2 + 0.5;
    s.position.set(Math.cos(a) * 0.42, 2.02, Math.sin(a) * 0.42);
    g.add(s);
    s.userData.orbit = a;
  }
  g.userData.core = core;
  return g;
}

// ---------------------------------------------------------------- 防具

/**
 * 鎧。胴・肩・草摺の3つで軽/中/重を描き分ける。
 *
 * 円筒1本だと樽にしか見えなかったので、胸で広く腰で締める。
 * 重いほど肩が張り、草摺の板が増える。
 */
function buildArmor(spec: ModelSpec, p: {
  chest: number; depth: number; pauldron: number; plates: number; metal: boolean;
}): THREE.Group {
  const g = new THREE.Group();
  // 広い面は暗めに。ここを刃と同じ明るさにすると光の塊になる。
  // 剣は細いので同じ明るさでも飛ばないが、鎧の胴は面積が10倍あり、
  // 同じ設定だと形の分からない白い板になる
  // 鎧は面が広く平らなので、刃と同じ滑らかさだと正面を向いた瞬間に
  // 面ごと反射して白い板になる。磨きを落として拡散寄りにする
  const body = p.metal ? steel(spec, 0.55, 0.3) : plain(LEATHER, 0.95);
  const edge = p.metal ? steel(spec, 0.68, 0.26) : steel(spec, 0.4, 0.3);

  // 胴。胸で広く、腰で締める
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(p.chest * 0.96, p.chest * 0.66, 1.55, 10, 1, true),
    body
  );
  torso.material.side = THREE.DoubleSide;
  torso.position.y = 0.3;
  g.add(torso);

  // 胸当て。**1枚の平板にしない。** 正面を向いた平面は光を面ごと返すので、
  // そこだけ白く飛んで胸の形が消える。左右に振った2枚に割ると、
  // どちらかは必ず斜めになり、陰影で形が出る
  for (const side of [-1, 1]) {
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(p.chest * 0.62, 0.92, p.depth), edge
    );
    front.position.set(side * p.chest * 0.27, 0.5, p.chest * 0.66);
    front.rotation.set(-0.12, side * 0.34, 0);
    g.add(front);
  }

  // 襟
  g.add(cyl(p.chest * 0.46, p.chest * 0.58, 0.16, 8, trim(spec), 1.12));

  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(p.pauldron, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
      edge
    );
    pauldron.position.set(side * (p.chest * 0.92 + p.pauldron * 0.35), 0.86, 0);
    pauldron.rotation.z = side * 0.38;
    g.add(pauldron);
  }

  // 帯
  g.add(cyl(p.chest * 0.7, p.chest * 0.7, 0.2, 10, trim(spec), -0.5));

  // 草摺。枚数と垂れ具合で重さを見せる
  for (let i = 0; i < p.plates; i++) {
    const n = p.plates;
    const a = (i / n) * Math.PI * 1.55 + Math.PI * 0.22;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(p.chest * 1.5 / n, 0.62, p.depth * 0.7), body
    );
    plate.position.set(Math.cos(a) * p.chest * 0.68, -0.92, Math.sin(a) * p.chest * 0.5);
    plate.rotation.y = -a + Math.PI / 2;
    g.add(plate);
  }

  for (let i = 0; i < FINISH[spec.rarity].ornaments; i++) {
    const s = gem(spec, 0.15);
    s.position.set(0, 0.72 - i * 0.42, p.chest * 0.7 + p.depth * 0.6);
    g.add(s);
  }
  return g;
}

// ---------------------------------------------------------------- 組み立て

type Builder = (s: ModelSpec) => THREE.Group;

const BUILDERS: Record<string, Builder> = {
  dagger: buildDagger,
  sword: buildSword,
  greatsword: buildGreatsword,
  spear: buildSpear,
  bow: buildBow,
  staff: buildStaff,
  light: s => buildArmor(s, { chest: 0.72, depth: 0.14, pauldron: 0.3, plates: 3, metal: false }),
  medium: s => buildArmor(s, { chest: 0.8, depth: 0.2, pauldron: 0.42, plates: 4, metal: true }),
  heavy: s => buildArmor(s, { chest: 0.9, depth: 0.3, pauldron: 0.56, plates: 5, metal: true })
};

/**
 * 台座に載せたときの**見た目の背丈**。1.0 が基準（両手剣）。
 *
 * 実寸をそのまま出すと、短剣は豆粒・槍は画面外になる。かといって全部同じ
 * 高さに正規化すると、短剣と両手剣が同じ大きさに見えて、
 * ベースの違いという実際の情報が消える。両者の中間を取る。
 */
const READ_SIZE: Record<string, number> = {
  dagger: 0.62, sword: 0.86, greatsword: 1.0, spear: 0.98,
  bow: 0.88, staff: 0.94,
  light: 0.80, medium: 0.86, heavy: 0.92
};

/** 画面に収める基準の高さ（ワールド単位）。カメラ側の画角と対で決めてある */
export const MODEL_HEIGHT = 3.0;

/**
 * 装備1点のモデルを作る。
 *
 * 知らないベースが来たら**落とさずに片手剣で代用する**。
 * 3Dは飾りなので、データが増えたときに画面が真っ暗になるより、
 * 形が合っていないほうがまだよい。
 *
 * 返す Group は必ず**原点中心・既知の高さ**に整えてある。
 * 形ごとに手で位置と倍率を書いていたときは、モデルを1つ足すたびに
 * 台座からはみ出したり埋まったりして、そのたびに数字を探し直していた。
 * 実際の境界箱から決めれば、9種でも180種でも同じ枠に収まる。
 */
export function buildItemModel(spec: ModelSpec): THREE.Group {
  const make = BUILDERS[spec.baseId] ?? buildSword;
  const g = make(spec);

  const box3 = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box3.getSize(size);
  box3.getCenter(center);

  const want = MODEL_HEIGHT * (READ_SIZE[spec.baseId] ?? 0.9);
  // 一番長い辺で合わせる。弓のように横長のものを高さで合わせると
  // 画面からはみ出す
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = want / longest;

  g.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  g.scale.setScalar(scale);

  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.userData.spin = g;
  wrap.userData.swing = g.userData.swing === true;
  return wrap;
}

/** モデルが持っている資源を返す。シーンを離れるときに必ず呼ぶ。 */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
    else if (mat) mat.dispose();
  });
}

/** 台座の上でゆっくり回す。毎フレーム呼ぶ。 */
export function animateModel(root: THREE.Object3D, t: number): void {
  root.rotation.y = root.userData.swing === true
    ? Math.sin(t * 0.5) * 0.6
    : t * 0.42;
  root.position.y = Math.sin(t * 1.1) * 0.11;
  const spin = root.userData.spin as THREE.Object3D | undefined;
  const core = spin?.userData.core as THREE.Object3D | undefined;
  if (core) {
    core.rotation.x = t * 0.9;
    core.rotation.y = t * 1.3;
  }
}
