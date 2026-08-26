import * as THREE from 'three';
import { Env } from './env';
import { createSky } from './sky';
import { createTerrain } from './terrain';
import { createWater } from './water';
import { createFoliage } from './foliage';
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
scene.add(createFoliage(env, field));

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

function fmtTime(t: number): string {
  const h = Math.floor(t) % 24;
  const m = Math.floor((t - Math.floor(t)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

let last = performance.now();
let frames = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  walker.update(dt);
  env.update(still === null ? dt : 0);
  if (still !== null) { env.clock = still; env.update(0); }
  (env.uniforms.uCamPos!.value as THREE.Vector3).copy(camera.position);
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
