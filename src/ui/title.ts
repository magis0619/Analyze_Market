import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered } from '../render/font';
import { drawSpr } from '../render/draw';
import { fillRect } from '../render/draw';
import { THEME } from './theme';
import { unlockAudio, sfx } from '../render/audio';

export class TitleScreen implements GameScreen {
  private t = 0;

  constructor(private app: App) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    // 地層のイメージ帯
    for (let i = 0; i < 4; i++) {
      fillRect(ctx, 0, 420 + i * 56, VW, 56, ['#7c5836', '#5f574f', '#473c58', '#263148'][i] ?? '#000');
    }
    ctx.save();
    ctx.translate(VW / 2, 180);
    ctx.scale(3, 3);
    drawTextCentered(ctx, 'OUTFITTER', 0, -6, 12, THEME.gold);
    ctx.restore();
    drawTextCentered(ctx, '― 装備屋 ―', VW / 2, 226, 12, THEME.dim);
    drawSpr(ctx, 'portrait', VW / 2 - 16, 300, 2);
    if (Math.floor(this.t * 2) % 2 === 0) {
      drawTextCentered(ctx, 'タップで開店', VW / 2, 380, 12, THEME.text);
    }
    drawText(ctx, `seed:${this.app.shop.seed.toString(16)}`, 4, VH - 12, 8, THEME.faint);
  }

  pointerDown(): void {
    unlockAudio();
    sfx('confirm');
    this.app.gotoNegotiation();
  }
}
