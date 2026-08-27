import * as THREE from 'three';
import { Env } from './env';
import { createSky } from './sky';
import { createTerrain } from './terrain';
import { createWater } from './water';
import { createFoliage, createLineup, FIRE_POS } from './foliage';
import { createCampfire } from './campfire';
import { sampleHeight } from './heightfield';
import { Walker, VIEWS, type ViewName } from './walker';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// 色は参考画像の実測値に合わせてシェーダ側で作っているので、
// トーンマッピングで持っていかれないよう素通しにする。
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20000);

const env = new Env();
env.time = Number(params.get('time') ?? 11.5);
env.weather = Number(params.get('weather') ?? 0);

const { mesh: terrain, field } = createTerrain(env);
scene.add(terrain);
scene.add(createSky(env));
scene.add(createWater(env));
// ?lineup=1 で、種を1体ずつ並べただけの検分用シーンにする
const lineup = params.get('lineup') === '1';
scene.add(lineup ? createLineup(env, field) : createFoliage(env, field));

// 焚き火（指示書 §5）。薪山・石・焦げ跡は createFoliage 側の常設物として
// 既に置いてあるので、ここでは炎・火の粉・煙・光だけを重ねる。
const campfire = createCampfire(env);
campfire.group.position.set(FIRE_POS.x, sampleHeight(field, FIRE_POS.x, FIRE_POS.z), FIRE_POS.z);
scene.add(campfire.group);

const walker = new Walker(camera, field);
const view = (params.get('view') ?? 'beach') as ViewName;
walker.applyView(view in VIEWS ? view : 'beach');
walker.attach(canvas);

// --- HUD ---
const hud = document.getElementById('hud')!;
const timeEl = document.getElementById('time') as HTMLInputElement;
const weatherEl = document.getElementById('weather') as HTMLInputElement;
const timeVal = document.getElementById('timeval')!;
const weatherVal = document.getElementById('weatherval')!;

// 時計の数字は出さない（指示書の「数字を見せない」）。
// 何時何分かではなく、いまが一日のどのあたりかだけ分かればいい。
function fmtTime(t: number): string {
  const h = ((t % 24) + 24) % 24;
  if (h < 4.0) return '真夜中';
  if (h < 5.6) return '夜明け前';
  if (h < 7.2) return '朝焼け';
  if (h < 10.0) return '朝';
  if (h < 14.0) return '真昼';
  if (h < 16.4) return '昼下がり';
  if (h < 18.0) return '夕方';
  if (h < 19.4) return '夕焼け';
  if (h < 21.0) return '宵';
  return '夜';
}
const WEATHER_NAMES = ['快晴', '晴れ', 'うすぐもり', 'くもり', '雨もよう'];
function fmtWeather(w: number): string {
  return WEATHER_NAMES[Math.min(WEATHER_NAMES.length - 1, Math.floor(w * WEATHER_NAMES.length))]!;
}

function syncHud() {
  timeEl.value = String(env.time);
  weatherEl.value = String(env.weather);
  timeVal.textContent = fmtTime(env.time);
  weatherVal.textContent = fmtWeather(env.weather);
}
timeEl.addEventListener('input', () => { env.time = Number(timeEl.value); syncHud(); });
weatherEl.addEventListener('input', () => { env.weather = Number(weatherEl.value); syncHud(); });
for (const b of Array.from(document.querySelectorAll('#hud button'))) {
  b.addEventListener('click', () => walker.applyView(b.getAttribute('data-view') as ViewName));
}
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'h') hud.classList.toggle('hidden');
});
if (params.get('hud') === '0') hud.classList.add('hidden');
syncHud();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  env.uniforms.uPixelRatio!.value = renderer.getPixelRatio();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// スクリーンショット用に時間を止められるようにしておく（批評の再現性のため）
const still = params.get('still') !== null ? Number(params.get('still')) : null;

// --- 到着と、帰り道 -------------------------------------------------------
// 「行って、帰ってくる」をひとつの体験にする。スクリーンショットのときだけは
// 演出を飛ばして、色の突き合わせが到着途中の色に引きずられないようにする。
const arriveParam = params.get('arrive');
if (arriveParam !== null) {
  // 到着の途中の色を撮るための固定値（自己批評用）
  env.arrive = Math.max(0, Math.min(1, Number(arriveParam)));
  env.arriveTarget = env.arrive;
} else if (still !== null) {
  env.arrive = 1;
  env.arriveTarget = 1;
}
document.addEventListener('visibilitychange', () => {
  env.arriveTarget = document.hidden ? 0 : 1;
});
window.addEventListener('blur', () => { env.arriveTarget = 0; });
window.addEventListener('focus', () => { env.arriveTarget = 1; });

let last = performance.now();
let frames = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  walker.update(dt);
  env.update(still === null ? dt : 0);
  if (still !== null) { env.clock = still; env.update(0); }
  (env.uniforms.uCamPos!.value as THREE.Vector3).copy(camera.position);
  campfire.update();
  renderer.render(scene, camera);
  frames++;
  if (frames === 2) document.getElementById('boot')!.classList.add('done');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window { __island?: unknown }
}
window.__island = { env, walker, camera, renderer, scene, VIEWS, frames: () => frames };
