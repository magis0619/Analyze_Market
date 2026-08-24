import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawSpr, drawSprFlipped, fillRect } from '../render/draw';
import { drawTextCentered } from '../render/font';
import { THEME } from './theme';
import { estimateTilt } from '../game/estimate';

// 見送りフェーズ（3秒）：天秤アニメで成功見込みを暗示する。数値は出さない。

export class SendoffScreen implements GameScreen {
  private t = 0;
  private readonly tilt: number;

  constructor(private app: App) {
    const run = app.run;
    this.tilt = run ? estimateTilt(run.adv, run.equipment) : 0;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.t >= 3) this.app.gotoSpectate();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    // 店の床と入口
    fillRect(ctx, 0, 400, VW, 240, '#5a3c22');
    fillRect(ctx, 0, 396, VW, 4, THEME.outline);
    fillRect(ctx, VW - 72, 240, 60, 160, '#0c0810');
    fillRect(ctx, VW - 74, 238, 64, 2, THEME.panelLight);

    const name = this.app.run?.adv.name ?? '';
    // 冒険者が右の戸口へ歩く
    const hx = Math.min(VW - 70, 60 + this.t * 110);
    const frame = Math.floor(this.t * 6) % 4;
    drawSprFlipped(ctx, `hero_walk_${frame}`, hx, 356, 3);

    // 天秤：傾きは段階的（回転は使わない。皿の高さ差で表す）
    const cx = 110, cy = 500;
    const settle = Math.min(1, this.t / 1.6);
    const wobble = this.t < 1.6 ? Math.round(Math.sin(this.t * 9) * (1 - settle) * 3) : 0;
    const dy = Math.round(this.tilt * 4 * settle) + wobble;
    drawSpr(ctx, 'balance', cx - 32, cy - 32, 2);
    // 皿（左＝期待、右＝不安）を上下させる
    fillRect(ctx, cx - 58, cy + 6 - dy, 28, 4, THEME.gold);
    fillRect(ctx, cx - 52, cy + 2 - dy, 16, 4, THEME.goldDark);
    fillRect(ctx, cx + 30, cy + 6 + dy, 28, 4, THEME.dim);
    fillRect(ctx, cx + 36, cy + 2 + dy, 16, 4, THEME.faint);

    drawTextCentered(ctx, `……${name}を見送った`, VW / 2, 580, 12, THEME.dim);
  }
}
