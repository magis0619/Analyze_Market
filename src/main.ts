import { Screen } from './render/screen';
import { initSprites } from './render/sprites';
import { App } from './game/app';
import { TitleScreen } from './ui/title';

// ブート。描画は 360×640 の内部解像度 → 整数倍スケール。

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null ? (parseInt(seedParam, 16) >>> 0) : (Date.now() >>> 0);

initSprites();

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas not found');
const screen = new Screen(canvas);
const app = new App(seed, new TitleScreen());

canvas.addEventListener('pointerdown', (e) => {
  const p = screen.toInternal(e.clientX, e.clientY);
  app.screen.pointerDown?.(p.x, p.y);
});

// フレーム計測（C軸のfps検査用に window へ公開）
const frameStats = { frames: 0, over17_5: 0, over33_4: 0, worst: 0 };
(window as unknown as { __delvers: unknown }).__delvers = { app, frameStats };

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
