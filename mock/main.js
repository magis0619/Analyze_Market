import { createStage } from './scenes.js';
import { SCREENS } from './screens.js';

// モックの入口。?s=base のように画面を選ぶ。
// スクリーンショットのために、時間は外から固定できるようにしてある。

const canvas = document.getElementById('gl');
const ui = document.getElementById('ui');
const stage = createStage(canvas);

function fit() {
  stage.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', fit);
fit();

let t = 0;
let paused = false;

function show(name) {
  const s = SCREENS[name];
  if (!s) throw new Error(`unknown screen: ${name}`);
  ui.innerHTML = s.html;
  // 撮影スクリプトがここを読んで「撮れている画面」を確認する。
  // 座標決め打ちのスクリプトが別画面を撮り続けた事故への対策（UI-SPEC §7.2）
  document.documentElement.dataset.screen = name;
  stage.load(s.scene);
  fit();
}

const params = new URLSearchParams(location.search);
show(params.get('s') ?? 'base');
const t0 = parseFloat(params.get('t') ?? '0');
if (Number.isFinite(t0) && t0 > 0) { t = t0; paused = true; stage.renderAt(t); }

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) { t += dt; stage.renderAt(t); }
}
requestAnimationFrame(loop);

// スクショ用の外部API
window.__mock = {
  show,
  renderAt(v) { t = v; paused = true; stage.renderAt(v); },
  screens: Object.keys(SCREENS)
};
