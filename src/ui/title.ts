import type { GameScreen, Nav } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered } from '../render/font';
import { drawSpr, drawSprOr, fillRect, hasSpr } from '../render/draw';
import { spr } from '../render/sprites';
import { THEME } from './theme';
import { unlockAudio, sfx } from '../render/audio';

export class TitleScreen implements GameScreen {
  private t = 0;

  constructor(private nav: Nav) {}

  update(dt: number): void {
    this.t += dt;
    this.nav.state.tick(this.nav.now());
  }

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    // 地層の断面
    for (let s = 0; s < 4; s++) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < Math.ceil(VW / 16); col++) {
          const h = ((s * 61 + row * 31 + col) * 2654435761) >>> 0;
          drawSpr(ctx, `tile_s${s}_${(h & 1) === 0 ? 'a' : 'b'}`, col * 16, 340 + s * 80 + row * 16);
        }
      }
    }

    if (hasSpr('logo')) {
      const s = spr('logo');
      ctx.drawImage(s, Math.round(VW / 2 - s.width), 130, s.width * 2, s.height * 2);
    } else {
      ctx.save();
      ctx.translate(VW / 2, 150);
      ctx.scale(3, 3);
      drawTextCentered(ctx, 'DELVERS', 0, -6, 12, THEME.gold);
      ctx.restore();
    }
    drawTextCentered(ctx, '― 潜る者たち ―', VW / 2, 200, 12, THEME.dim);

    // 3人の冒険者
    const jobs = ['job_swordsman', 'job_guardian', 'job_skirmisher'];
    jobs.forEach((j, i) => {
      drawSprOr(ctx, j, 'portrait', VW / 2 - 72 + i * 48, 250, 2);
    });

    if (Math.floor(this.t * 2) % 2 === 0) {
      drawTextCentered(ctx, 'タップして始める', VW / 2, 306, 12, THEME.text);
    }
    drawText(ctx, `seed:${this.nav.state.data.seed.toString(16)}`, 4, VH - 12, 8, THEME.dim);
  }

  pointerDown(): void {
    unlockAudio();
    sfx('confirm');
    this.nav.goBase();
  }
}
