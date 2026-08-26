import * as THREE from 'three';
import type { ModelSpec } from './models';
import { buildItemModel, disposeModel } from './models';

// 一覧に出す装備のサムネイル（改善指示書 §1「所有実感」）。
//
// 指示書は「32x32のドット絵アイコン」と書いているが、ドット絵は
// three.js への移行で破棄した（UI-SPEC §8.2）。同じ狙い——
// **持っている物が何なのか、行を読まずに分かること**——を満たすなら、
// 実物のモデルをそのまま小さく焼くほうが忠実で、しかも品を追加しても
// アイコンを描き足す必要がない。
//
// 焼くのは (ベース × レアリティ × 属性) の組み合わせごとに一度きり。
// 200個持っていても、実際に現れる組み合わせは数十しかない。
//
// **同期では焼かない。** 一覧の並べ替えは1フレーム（16.7ms）以内という
// 約束がある（§7.1 U9）。焼けていない品は文字のまま出しておいて、
// 焼き上がったら差し替える。待たせるより、少し遅れて良くなるほうがよい。

const SIZE = 96;
/** 1フレームに焼く上限。まとめて焼くとスクロールが引っかかる */
const PER_FRAME = 2;

const cache = new Map<string, string>();
const queue: ModelSpec[] = [];
const queued = new Set<string>();
const listeners = new Set<() => void>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let cam: THREE.PerspectiveCamera | null = null;
let scheduled = false;

export function thumbKey(spec: ModelSpec): string {
  return `${spec.baseId}|${spec.rarity}|${spec.element}`;
}

function setup(): void {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  // 台座のシーンと同じ向きの光。一覧と明細で同じ物に見えないと、
  // 「これのことか」が繋がらない
  scene.add(new THREE.AmbientLight(0x3a4468, 2.0));
  const key = new THREE.DirectionalLight(0xdfe8ff, 3.2);
  key.position.set(1.4, 2.0, 2.2);
  scene.add(key);
  // 逆光。刃の縁を光らせて、暗い枠の中でも輪郭が残るようにする
  const rim = new THREE.DirectionalLight(0xa8beff, 2.0);
  rim.position.set(-1.8, 0.6, -1.4);
  scene.add(rim);

  cam = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  cam.position.set(0, 0, 7.4);
  cam.lookAt(0, 0, 0);
}

/** 1つ焼く。モデルは焼き終わったら必ず捨てる（積み上がると GPU が尽きる）。 */
function bake(spec: ModelSpec): void {
  setup();
  if (!renderer || !scene || !cam) return;
  const model = buildItemModel(spec);
  // **武器は斜めに寝かせる。** 剣は本来ただの縦線なので、まっすぐ立てて
  // 32px に焼くと幅1pxの筋にしかならない。斜めにすると同じ長さで
  // 縦横の両方を使い、小さくても形が残る（RPGの持ち物欄が一様にそうしている理由）。
  // 鎧は元から幅があるので立てたままでよい。
  const flat = spec.baseId === 'light' || spec.baseId === 'medium' || spec.baseId === 'heavy';
  if (flat) model.rotation.set(0.1, -0.5, 0);
  else model.rotation.set(0.08, -0.55, 0.66);
  scene.add(model);
  renderer.render(scene, cam);
  scene.remove(model);
  disposeModel(model);
  cache.set(thumbKey(spec), renderer.domElement.toDataURL('image/png'));
}

function pump(): void {
  scheduled = false;
  let n = 0;
  while (queue.length > 0 && n < PER_FRAME) {
    const spec = queue.shift();
    if (!spec) break;
    const k = thumbKey(spec);
    queued.delete(k);
    if (!cache.has(k)) {
      try { bake(spec); } catch { cache.set(k, ''); }
      n++;
    }
  }
  if (n > 0) for (const cb of listeners) cb();
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

/**
 * サムネイルの data URL。まだ焼けていなければ null を返し、裏で焼き始める。
 *
 * 呼ぶ側は null のときの見た目（文字のアイコン）を必ず持つこと。
 */
export function thumbFor(spec: ModelSpec): string | null {
  const k = thumbKey(spec);
  const hit = cache.get(k);
  if (hit !== undefined) return hit === '' ? null : hit;
  if (!queued.has(k)) {
    queued.add(k);
    queue.push(spec);
    schedule();
  }
  return null;
}

/** 焼き上がったときに呼ばれる。画面を描き直すために使う。 */
export function onThumbReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** テスト用。今までに焼いた枚数。 */
export function thumbCount(): number {
  return cache.size;
}
