import { Screen } from './render/screen';
import { initSprites } from './render/sprites';
import { App } from './game/app';
import { GameState, debugLoot } from './game/state';
import { TitleScreen } from './ui/title';
import { BaseScreen } from './ui/base';
import { DispatchScreen } from './ui/dispatch';
import { InventoryScreen } from './ui/inventory';
import { CompendiumScreen } from './ui/compendium';
import { OpeningScreen } from './ui/opening';
import { ReportScreen } from './ui/report';

// ブート。描画は 360×640 の内部解像度 → 整数倍スケール。

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null ? (parseInt(seedParam, 16) >>> 0) : (Date.now() >>> 0);

initSprites();

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas not found');
const screen = new Screen(canvas);

if (params.get('reset') === '1') {
  try { localStorage.removeItem('delvers.save.v1'); } catch { /* 続行 */ }
}

const state = new GameState(seed, Date.now());

// 開発用: インベントリに任意個の装備を積む（?devitems=200）。
// C10（200個所持時の操作性）の確認と、画面の詰まり具合を実機で見るために使う。
const devItems = parseInt(params.get('devitems') ?? '0', 10);
if (Number.isFinite(devItems) && devItems > 0) {
  const n = Math.min(2000, devItems);
  for (let i = 0; i < n; i++) {
    const stageId = 1 + (i % 10);
    state.data.inventory.push(...debugLoot(seed ^ (i * 7919), stageId, 1)
      .map(it => ({ ...it, id: `dev-${i}`, identified: true })));
  }
  state.data.gold += 50000;
  state.save();
}
const app = new App(state, {
  base: nav => new BaseScreen(nav),
  dispatch: nav => new DispatchScreen(nav),
  inventory: nav => new InventoryScreen(nav),
  compendium: nav => new CompendiumScreen(nav),
  opening: (nav, items) => new OpeningScreen(nav, items),
  report: (nav, id) => new ReportScreen(nav, id)
}, nav => new TitleScreen(nav));

// 実時間の倍率（開発時の確認用。本番は 1）。
const ts = parseFloat(params.get('timescale') ?? '1');
app.timeScale = Number.isFinite(ts) && ts >= 1 ? Math.min(20000, ts) : 1;

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  const p = screen.toInternal(e.clientX, e.clientY);
  dragging = true;
  app.screen.pointerDown?.(p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = screen.toInternal(e.clientX, e.clientY);
  app.screen.pointerMove?.(p.x, p.y);
});
const endDrag = (e: PointerEvent): void => {
  if (!dragging) return;
  dragging = false;
  const p = screen.toInternal(e.clientX, e.clientY);
  app.screen.pointerUp?.(p.x, p.y);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// フレーム計測（C軸のfps検査用に window へ公開）
const frameStats = { frames: 0, over17_5: 0, over33_4: 0, worst: 0 };
(window as unknown as { __delvers: unknown }).__delvers = { app, state, frameStats };

let last = performance.now();
function loop(now: number): void {
  const dtMs = now - last;
  last = now;
  if (dtMs > 0 && dtMs < 1000) {
    frameStats.frames++;
    if (dtMs > 17.5) frameStats.over17_5++;
    if (dtMs > 33.4) frameStats.over33_4++;
    frameStats.worst = Math.max(frameStats.worst, dtMs);
  }
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  app.screen.update(dt);
  app.screen.draw(screen.ctx);
  screen.present();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
