import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered } from '../render/font';
import { drawSpr, fillRect } from '../render/draw';
import { spr } from '../render/sprites';
import { THEME } from './theme';
import { unlockAudio, sfx } from '../render/audio';

export class TitleScreen implements GameScreen {
  private t = 0;

  constructor(private app: App) {}

  update(dt: number): void {
    this.t += dt;
  }

  private hasLogo: boolean | null = null;

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    // 地層の断面（本編と同じタイルで描く）
    for (let s = 0; s < 4; s++) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < Math.ceil(VW / 16); col++) {
          const h = ((s * 61 + row * 31 + col) * 2654435761) >>> 0;
          const v = (h & 1) === 0 ? 'a' : 'b';
          drawSpr(ctx, `tile_s${s}_${v}`, col * 16, 420 + s * 56 + row * 16);
        }
      }
    }
    if (this.hasLogo === null) {
      try { spr('logo'); this.hasLogo = true; } catch { this.hasLogo = false; }
    }
    if (this.hasLogo) {
      const s = spr('logo');
      const scale = 2;
      ctx.drawImage(s, Math.round(VW / 2 - (s.width * scale) / 2), 150, s.width * scale, s.height * scale);
    } else {
      ctx.save();
      ctx.translate(VW / 2, 180);
      ctx.scale(3, 3);
      drawTextCentered(ctx, 'OUTFITTER', 0, -6, 12, THEME.gold);
      ctx.restore();
    }
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
