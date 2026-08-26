// 指示書 §4-1 の植生パレット。種ごとにシルエットが違うことが大事なので、
// 汎用の「木」を色替えするのではなく、それぞれの特徴を形で作る。
//
//   ヤシ       湾のシルエットの主役。幹がしなり、葉は垂れる
//   アダン     細長い葉が放射状、幹から気根が地面へ伸びる
//   デイゴ     枝を広く張り、房状の真っ赤な花
//   月桃       笹に似た大きな葉、白とピンクの花が垂れる
//   マングローブ  水面から絡み合って突き出す支柱根
//   ソテツ     葉痕の残る太い幹に、硬い羽状の葉が放射状
//   ハイビスカス／ブーゲンビリア  彩りの花をつけた低木

import * as THREE from 'three';
import { Builder, hex, norm, addv, mul, shade, lerp3, cross3, type V3 } from './meshbuild';
import { makeRng } from './noise';

export type Species =
  | 'palm' | 'adan' | 'deigo' | 'gettou' | 'mangrove' | 'sotetsu'
  | 'hibiscus' | 'bougain' | 'bush' | 'tree';

const C = {
  palmBark: hex(0x8c7a5e),
  palmBarkDark: hex(0x6b5c45),
  palmLeaf: hex(0x4e8f37),
  palmLeafTip: hex(0x74ad4a),
  coconut: hex(0x6d5637),

  adanLeaf: hex(0x5d9247),
  adanLeafTip: hex(0x86b45c),
  adanRoot: hex(0x9a8d74),
  adanTrunk: hex(0x87795f),

  deigoBark: hex(0x6f6555),
  deigoLeaf: hex(0x37692f),
  deigoFlower: hex(0xd62a1c),

  gettouLeaf: hex(0x4f9440),
  gettouLeafTip: hex(0x76b053),
  gettouFlower: hex(0xf4ece4),
  gettouFlowerTip: hex(0xe79bad),

  mangroveRoot: hex(0x6e6250),
  mangroveBark: hex(0x5d5443),
  mangroveLeaf: hex(0x3d7c42),

  sotetsuTrunk: hex(0x6b5c47),
  sotetsuScar: hex(0x554736),
  sotetsuLeaf: hex(0x3d6f31),
  sotetsuLeafTip: hex(0x5e8e40),

  leafGeneric: hex(0x477f36),
  hibiscus: hex(0xdd3a2c),
  bougain: hex(0xd0327c)
};

/**
 * 羽状の葉。芯が弓なりに伸びて垂れ、その両側に細い小葉が並ぶ。
 *
 * 要点は小葉の向き。芯に対して真横に出すと団扇になってしまうので、
 * 芯まわりの角度 phi で「横」から「真下」へ寝かせていく。根元は横向き、
 * 先へ行くほど垂れる——これでヤシの葉に見える。ソテツは phi を小さく
 * 保ったまま使うと、硬く跳ねた羽状葉になる。
 */
function pinnate(
  b: Builder, origin: V3, az: number,
  opt: {
    len: number; seg: number; pitch0: number; pitch1: number; arc: number;
    leaflet: number; leaflets: number; rachis: number;
    phi0: number; phi1: number; back: number;
    col: V3; tip: V3; swayTip: number;
  }
): void {
  const dirH: V3 = [Math.cos(az), 0, Math.sin(az)];
  const S = opt.seg;
  const spine: V3[] = [origin];
  let p = origin;
  for (let i = 1; i <= S; i++) {
    const t = i / S;
    const ang = opt.pitch0 + (opt.pitch1 - opt.pitch0) * Math.pow(t, opt.arc);
    const step = opt.len / S;
    p = addv(p, [dirH[0] * Math.cos(ang) * step, Math.sin(ang) * step, dirH[2] * Math.cos(ang) * step]);
    spine.push(p);
  }
  // 葉軸。細く、先へ向かって絞る
  const w = spine.map((_, i) => opt.rachis * (1 - i / S) + 0.006);
  b.ribbon(spine, w, [0, 1, 0], opt.col, 0.15, opt.swayTip, opt.tip);

  // 小葉。芯の上を細かく刻んで左右へ垂らす
  const N = opt.leaflets;
  for (let k = 1; k < N; k++) {
    const t = k / N;
    const f = t * S;
    const i = Math.min(S - 1, Math.floor(f));
    const u = f - i;
    const a0 = lerp3(spine[i]!, spine[i + 1]!, u);
    const a1 = lerp3(spine[i]!, spine[i + 1]!, Math.min(1, u + (S / N) * 0.85));
    const fwd = norm([spine[i + 1]![0] - spine[i]![0], spine[i + 1]![1] - spine[i]![1], spine[i + 1]![2] - spine[i]![2]]);
    const side = norm([fwd[2], 0, -fwd[0]]);
    let dn = cross3(side, fwd);
    if (dn[1] > 0) dn = mul(dn, -1);          // 芯まわりの「下」
    const phi = opt.phi0 + (opt.phi1 - opt.phi0) * t;
    const span = Math.sin(Math.PI * Math.min(1, t * 1.12)) * opt.leaflet;
    const col = lerp3(opt.col, opt.tip, t);
    const sway = 0.18 + (opt.swayTip - 0.18) * t;
    for (const sgn of [1, -1]) {
      const d = norm(addv(
        addv(mul(side, sgn * Math.cos(phi)), mul(dn, Math.sin(phi))),
        mul(fwd, opt.back)));
      const tipPt = addv(a0, mul(d, span));
      b.tri(a0, a1, tipPt, shade(col, sgn > 0 ? 1.0 : 0.90), sway, 1);
    }
  }
}

/** ヤシ。幹のしなりと葉の垂れ具合を variant で変える */
function palm(variant: number): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(3300 + variant * 17);
  const H = [6.6, 8.2, 5.6][variant % 3]!;
  const bend = [0.34, 0.16, 0.52][variant % 3]!;     // 幹のしなり
  const droop = [-1.20, -0.95, -1.40][variant % 3]!; // 葉先の垂れ
  const az0 = rng() * Math.PI * 2;

  // 幹。根元が太く、上へ細る。しなりは片側へ、上ほど強く
  const seg = 12;
  const path: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const off = bend * H * 0.52 * Math.pow(t, 1.65);
    // ごく浅い S 字。根元だけ逆へ振ると、地面から生えている感じが出る
    const s0 = -bend * H * 0.06 * Math.sin(t * Math.PI);
    path.push([off + s0, t * H, 0]);
    radii.push(0.155 - 0.055 * t + 0.115 * Math.exp(-t * 7.5));
  }
  b.tube(path, radii, 8, C.palmBark, 0.28, 0, 0.26);
  const top = path[seg]!;

  // 葉。放射状に、1枚ずつ立ち上がり方と垂れ方を変える
  const n = 10 + (variant % 3);
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * Math.PI * 2 + rng() * 0.24;
    const k = 0.80 + rng() * 0.42;
    // 立ち上がりの角度に幅を持たせる。上を向く若い葉と、垂れた古い葉が混ざる
    const rise = 0.20 + rng() * 0.85;
    pinnate(b, top, az, {
      len: 3.0 * k, seg: 12, arc: 1.85,
      pitch0: rise, pitch1: droop - rng() * 0.30,
      leaflet: 0.52 * k, leaflets: 26, rachis: 0.038,
      phi0: 0.30, phi1: 1.22, back: 0.30,
      col: C.palmLeaf, tip: C.palmLeafTip, swayTip: 1.0
    });
  }
  // 葉柄の付け根と実
  b.blob(addv(top, [0, -0.10, 0]), [0.24, 0.20, 0.24], 0, C.palmBarkDark, 0.28, 0);
  for (let i = 0; i < 3; i++) {
    const a = az0 + i * 2.1;
    b.blob(addv(top, [Math.cos(a) * 0.26, -0.30, Math.sin(a) * 0.26]),
      [0.15, 0.13, 0.15], 0, C.coconut, 0.30, 0);
  }
  return b.build();
}

/** アダン。放射状の細長い葉と、幹から地面へ伸びる気根 */
function adan(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(4711);
  const trunkH = 2.0;
  b.tube([[0, 0.1, 0], [0.14, trunkH * 0.6, 0.06], [0.24, trunkH, 0.10]],
    [0.34, 0.29, 0.26], 7, C.adanTrunk, 0.10);

  // 気根（支柱根）。幹の途中から放射状に地面へ降りる。これがアダンの顔
  const roots = 9;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rng() * 0.4;
    const h = 0.55 + rng() * 1.15;
    const reach = 0.75 + rng() * 0.75;
    const from: V3 = [Math.cos(a) * 0.16, h, Math.sin(a) * 0.16];
    const mid: V3 = [Math.cos(a) * reach * 0.75, h * 0.45, Math.sin(a) * reach * 0.75];
    const to: V3 = [Math.cos(a) * reach, -0.08, Math.sin(a) * reach];
    b.tube([from, mid, to], [0.095, 0.078, 0.068], 5, C.adanRoot, 0.04);
  }

  // 葉。細長い帯が放射状に出て、先が垂れる
  const heads: [number, number][] = [[trunkH, 1.0], [trunkH - 0.55, 0.80], [trunkH - 1.0, 0.58]];
  for (const [hy, scale] of heads) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rng() * 0.3;
      const len = (2.05 + rng() * 0.5) * scale;
      const spine: V3[] = [];
      const widths: number[] = [];
      const S = 7;
      let p: V3 = [Math.cos(az) * 0.12, hy, Math.sin(az) * 0.12];
      const pitch0 = 0.95 - rng() * 0.35;
      spine.push(p); widths.push(0.185 * scale);
      for (let s = 1; s <= S; s++) {
        const t = s / S;
        // 垂れすぎると蜘蛛のように見える。反り返って弓なりに留める
        const ang = pitch0 + (-0.95 - pitch0) * Math.pow(t, 1.7);
        const step = len / S;
        p = addv(p, [Math.cos(az) * Math.cos(ang) * step, Math.sin(ang) * step, Math.sin(az) * Math.cos(ang) * step]);
        spine.push(p);
        widths.push(0.185 * scale * (1 - t * 0.86));
      }
      b.ribbon(spine, widths, [0, 1, 0], C.adanLeaf, 0.12, 0.85, C.adanLeafTip);
    }
  }
  return b.build();
}

/** デイゴ。枝を広く張り、先に真っ赤な房をつける */
function deigo(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(908);
  b.tube([[0, 0, 0], [0.1, 1.5, 0.05], [0.15, 2.6, 0.1]], [0.42, 0.34, 0.30], 7, C.deigoBark, 0.06);
  const fork: V3 = [0.15, 2.6, 0.1];
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng() * 0.4;
    const reach = 2.6 + rng() * 1.5;
    const rise = 1.5 + rng() * 1.0;
    const mid = addv(fork, [Math.cos(a) * reach * 0.45, rise * 0.65, Math.sin(a) * reach * 0.45]);
    const end = addv(fork, [Math.cos(a) * reach, rise, Math.sin(a) * reach]);
    b.tube([fork, mid, end], [0.20, 0.13, 0.07], 6, C.deigoBark, 0.30);
    // 葉は疎らに。花を目立たせたいので茂らせすぎない
    for (let k = 0; k < 5; k++) {
      const t = 0.42 + k * 0.15;
      const c = addv(fork, [Math.cos(a) * reach * t, rise * t + 0.15, Math.sin(a) * reach * t]);
      b.blob(c, [0.80, 0.66, 0.80], 1, C.deigoLeaf, 0.55, 1,
        (j) => 0.72 + 0.55 * (((j * 13) % 9) / 8));
    }
    // 真っ赤な房。枝先に房状に垂れる
    for (let k = 0; k < 6; k++) {
      const t = 0.74 + k * 0.055;
      const jx = (rng() - 0.5) * 0.55, jz = (rng() - 0.5) * 0.55;
      const c = addv(fork, [Math.cos(a) * reach * t + jx, rise * t + 0.30 - rng() * 0.3, Math.sin(a) * reach * t + jz]);
      b.blob(c, [0.32, 0.20, 0.32], 0, C.deigoFlower, 0.75, 1);
    }
  }
  return b.build();
}

/** 月桃。笹に似た大きな葉の株と、垂れ下がる花穂 */
function gettou(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(6120);
  const stems = 8;
  for (let i = 0; i < stems; i++) {
    const az = (i / stems) * Math.PI * 2 + rng() * 0.5;
    const lean = 0.18 + rng() * 0.26;
    const h = 1.5 + rng() * 0.6;
    const top: V3 = [Math.cos(az) * h * lean, h, Math.sin(az) * h * lean];
    b.tube([[0, 0, 0], [top[0] * 0.5, h * 0.5, top[2] * 0.5], top], [0.055, 0.042, 0.032], 5,
      shade(C.gettouLeaf, 0.72), 0.45);
    // 葉は茎に沿って互い違いに、大きく長い
    const leaves = 5;
    for (let k = 0; k < leaves; k++) {
      const t = 0.30 + k * 0.16;
      const base: V3 = [top[0] * t, h * t, top[2] * t];
      const la = az + (k % 2 === 0 ? 0.9 : -0.9) + rng() * 0.3;
      const len = 1.15 + rng() * 0.45;
      const S = 6;
      const spine: V3[] = [base];
      const widths = [0.05];
      let p = base;
      const pitch0 = 0.55;
      for (let s = 1; s <= S; s++) {
        const tt = s / S;
        const ang = pitch0 + (-0.85 - pitch0) * Math.pow(tt, 1.4);
        const step = len / S;
        p = addv(p, [Math.cos(la) * Math.cos(ang) * step, Math.sin(ang) * step, Math.sin(la) * Math.cos(ang) * step]);
        spine.push(p);
        // 笹に似た幅の広い葉。細いと竜舌蘭に見えてしまう
        widths.push(0.26 * Math.sin(Math.PI * Math.min(1, tt * 1.18)) + 0.03);
      }
      b.ribbon(spine, widths, [0, 1, 0], C.gettouLeaf, 0.3, 0.9, C.gettouLeafTip);
    }
  }
  // 花穂。白からピンクへ、垂れ下がる
  for (let f = 0; f < 2; f++) {
    const az = rng() * Math.PI * 2;
    const base: V3 = [Math.cos(az) * 0.3, 1.65, Math.sin(az) * 0.3];
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const c = addv(base, [Math.cos(az) * (0.16 + t * 0.42), -t * 0.72, Math.sin(az) * (0.16 + t * 0.42)]);
      const col: V3 = [
        C.gettouFlower[0] + (C.gettouFlowerTip[0] - C.gettouFlower[0]) * t,
        C.gettouFlower[1] + (C.gettouFlowerTip[1] - C.gettouFlower[1]) * t,
        C.gettouFlower[2] + (C.gettouFlowerTip[2] - C.gettouFlower[2]) * t
      ];
      b.blob(c, [0.075, 0.065, 0.075], 0, col, 0.85, 1);
    }
  }
  return b.build();
}

/** マングローブ。絡み合う支柱根が水面から突き出す */
function mangrove(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(2255);
  const trunkTop = 2.1;
  b.tube([[0, 0.6, 0], [0.05, 1.4, 0.03], [0.1, trunkTop, 0.05]], [0.24, 0.20, 0.17], 6, C.mangroveBark, 0.12);

  // 支柱根。幹と低い枝から弓なりに降りて、水面下へ刺さる
  const roots = 14;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rng() * 0.55;
    const h = 0.7 + rng() * 1.5;
    const reach = 0.6 + rng() * 0.95;
    const from: V3 = [Math.cos(a) * 0.1, h, Math.sin(a) * 0.1];
    const mid: V3 = [Math.cos(a) * reach * 0.8, h * 0.42, Math.sin(a) * reach * 0.8];
    const to: V3 = [Math.cos(a) * reach * 1.05, -0.5, Math.sin(a) * reach * 1.05];
    b.tube([from, mid, to], [0.062, 0.052, 0.045], 5, C.mangroveRoot, 0.03);
  }
  // 枝と葉群。濃く密な葉
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng() * 0.4;
    const reach = 1.0 + rng() * 0.8;
    const end: V3 = [Math.cos(a) * reach, trunkTop + 0.7 + rng() * 0.5, Math.sin(a) * reach];
    b.tube([[0.1, trunkTop, 0.05], end], [0.11, 0.06], 5, C.mangroveBark, 0.35);
    b.blob(end, [0.85, 0.60, 0.85], 1, C.mangroveLeaf, 0.6, 1,
      (j) => 0.78 + 0.42 * (((j * 11) % 7) / 6));
  }
  b.blob([0.1, trunkTop + 0.9, 0.05], [1.15, 0.75, 1.15], 1, C.mangroveLeaf, 0.5, 1,
    (j) => 0.80 + 0.38 * (((j * 17) % 9) / 8));
  return b.build();
}

/** ソテツ。葉痕の残る太い幹に、硬い羽状の葉 */
function sotetsu(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(7788);
  const H = 1.35;
  // 幹。葉痕を段で表す（輪切りごとに色を変える）
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const y0 = (i / rings) * H, y1 = ((i + 1) / rings) * H;
    const r = 0.40 - 0.06 * (i / rings);
    b.tube([[0, y0, 0], [0, y1, 0]], [r, r * 0.97], 9,
      i % 2 === 0 ? C.sotetsuTrunk : C.sotetsuScar, 0.02, 0, 0.16);
  }
  // 葉。垂れずに硬く跳ね上がる
  const n = 18;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rng() * 0.2;
    const k = 0.88 + rng() * 0.28;
    // ソテツは垂れない。phi を小さく保つと、硬く跳ねた羽状葉になる
    pinnate(b, [Math.cos(az) * 0.20, H, Math.sin(az) * 0.20], az, {
      len: 1.75 * k, seg: 8, arc: 1.30,
      pitch0: 0.92, pitch1: -0.28,
      leaflet: 0.26 * k, leaflets: 22, rachis: 0.030,
      phi0: 0.10, phi1: 0.42, back: 0.55,
      col: C.sotetsuLeaf, tip: C.sotetsuLeafTip, swayTip: 0.30
    });
  }
  return b.build();
}

/** 花をつけた低木。ハイビスカスとブーゲンビリアは花色だけ違う */
function flowerBush(flower: V3, seed: number): THREE.BufferGeometry {
  const b = new Builder();
  const rng = makeRng(seed);
  const lumps: [V3, V3][] = [
    [[0, 0.62, 0], [0.72, 0.58, 0.72]],
    [[0.48, 0.40, 0.20], [0.50, 0.42, 0.50]],
    [[-0.36, 0.36, -0.34], [0.46, 0.38, 0.46]]
  ];
  for (const [c, r] of lumps) {
    b.blob(c, r, 1, C.leafGeneric, 0.55, 1, (j) => 0.80 + 0.40 * (((j * 13) % 9) / 8));
  }
  // 花は葉の面より少し外に出す。埋もれると色が見えない
  for (let i = 0; i < 20; i++) {
    const a = rng() * Math.PI * 2, e = rng() * 0.95 + 0.05;
    const r = 0.74;
    const c: V3 = [Math.cos(a) * r * Math.cos(e), 0.56 + Math.sin(e) * r * 0.78, Math.sin(a) * r * Math.cos(e)];
    b.blob(c, [0.165, 0.105, 0.165], 0, flower, 0.7, 1);
  }
  return b.build();
}

/** 汎用の低木。岬の面をひととおり埋めるための量産品 */
function bush(): THREE.BufferGeometry {
  const b = new Builder();
  const lumps: [V3, V3][] = [
    [[0, 0.58, 0], [0.66, 0.52, 0.66]],
    [[0.44, 0.34, 0.18], [0.46, 0.36, 0.46]],
    [[-0.32, 0.32, -0.30], [0.42, 0.34, 0.42]]
  ];
  for (const [c, r] of lumps) {
    b.blob(c, r, 1, C.leafGeneric, 0.55, 1, (j) => 0.78 + 0.44 * (((j * 13) % 9) / 8));
  }
  return b.build();
}

/** 汎用の木。遠景の緑の量感を作る */
function tree(): THREE.BufferGeometry {
  const b = new Builder();
  b.tube([[0, 0, 0], [0.06, 1.4, 0.03], [0.12, 2.6, 0.06]], [0.24, 0.16, 0.13], 6, hex(0x6b5b46), 0.20);
  const lumps: [V3, V3][] = [
    [[0.12, 3.4, 0.06], [1.5, 1.15, 1.5]],
    [[0.95, 2.7, 0.40], [1.0, 0.80, 1.0]],
    [[-0.62, 2.85, -0.55], [0.92, 0.72, 0.92]],
    [[0.22, 4.35, -0.20], [0.85, 0.62, 0.85]]
  ];
  for (const [c, r] of lumps) {
    b.blob(c, r, 1, C.leafGeneric, 0.7, 1, (j) => 0.76 + 0.46 * (((j * 17) % 11) / 10));
  }
  return b.build();
}

export function buildFlora(): Record<Species, THREE.BufferGeometry[]> {
  return {
    palm: [palm(0), palm(1), palm(2)],
    adan: [adan()],
    deigo: [deigo()],
    gettou: [gettou()],
    mangrove: [mangrove()],
    sotetsu: [sotetsu()],
    hibiscus: [flowerBush(C.hibiscus, 331)],
    bougain: [flowerBush(C.bougain, 977)],
    bush: [bush()],
    tree: [tree()]
  };
}
