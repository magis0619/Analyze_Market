import type { GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawTextCentered } from '../render/font';
import { drawSpr, fillRect } from '../render/draw';
import { THEME } from './theme';
import { unlockAudio, sfx } from '../render/audio';

// v1 の商談・観戦を削除した後の暫定タイトル。DELVERS 本体は後続コミットで実装する。

export class TitleScreen implements GameScreen {
  private t = 0;

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    for (let s = 0; s < 4; s++) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < Math.ceil(VW / 16); col++) {
          const h = ((s * 61 + row * 31 + col) * 2654435761) >>> 0;
          const v = (h & 1) === 0 ? 'a' : 'b';
          drawSpr(ctx, `tile_s${s}_${v}`, col * 16, 420 + s * 56 + row * 16);
        }
      }
    }
    ctx.save();
    ctx.translate(VW / 2, 180);
    ctx.scale(3, 3);
    drawTextCentered(ctx, 'DELVERS', 0, -6, 12, THEME.gold);
    ctx.restore();
    drawTextCentered(ctx, '― 潜る者たち ―', VW / 2, 226, 12, THEME.dim);
    drawSpr(ctx, 'portrait', VW / 2 - 16, 300, 2);
    if (Math.floor(this.t * 2) % 2 === 0) {
      drawTextCentered(ctx, '準備中', VW / 2, 380, 12, THEME.text);
    }
  }

  pointerDown(): void {
    unlockAudio();
    sfx('confirm');
  }
}
