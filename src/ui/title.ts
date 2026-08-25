import type { GameScreen, Nav } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered } from '../render/font';
import { drawSpr, drawSprOr, fillRect, hasSpr, strokeRect1 } from '../render/draw';
import { THEME } from './theme';
import { COLORS } from '../render/palette';
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

    // 夜空
    for (let i = 0; i < 90; i++) {
      const h = ((i * 2654435761) >>> 0);
      if ((h >> 20) % 3 !== 0) continue;
      fillRect(ctx, h % VW, (h >> 9) % 250, 1, 1, THEME.dim);
    }

    // ロゴはビットマップフォントを3倍に伸ばして組む。
    // スプライトのロゴタイプは v1 の "OUTFITTER" の字形しか持っておらず、
    // D/L/V/S の字が無い。フォント側には既に全字あるうえ、
    // imageSmoothingEnabled=false なので3倍でもドットは崩れない。
    ctx.save();
    ctx.translate(VW / 2, 70);
    ctx.scale(3, 3);
    drawTextCentered(ctx, 'DELVERS', 1, -5, 12, THEME.outline);
    drawTextCentered(ctx, 'DELVERS', 0, -6, 12, THEME.gold);
    ctx.restore();
    drawTextCentered(ctx, '― 潜る者たち ―', VW / 2, 116, 12, THEME.dim);

    // --- 地表と、そこから下へ抜ける竪坑 ---
    //
    // 以前はここに同じタイルを5行×4層ベタ敷きしていただけで、
    // 画面の42%が空白、下半分には構図が無かった。
    // このゲームが何をするものか（地表から潜っていく）を1枚で見せる。
    const groundY = 250;

    if (hasSpr('tree_pine')) {
      for (const [tx, dy] of [[142, 2], [300, -2], [330, 3]] as const) {
        drawSpr(ctx, 'tree_pine', tx, groundY - 38 + dy);
      }
    }
    if (hasSpr('lodge')) {
      drawSpr(ctx, 'lodge', 26, groundY - 60);
    }
    if (hasSpr('fence')) {
      for (let col = 0; col < Math.ceil(VW / 16); col++) {
        drawSpr(ctx, 'fence', col * 16, groundY - 14);
      }
    }

    // 地層の断面。上から順に土・岩・深層・深淵
    const bands = [COLORS.woodDark, COLORS.stoneDark, COLORS.panel2, COLORS.abyss];
    const bandH = Math.ceil((VH - groundY) / bands.length);
    bands.forEach((c, i) => {
      const y0 = groundY + i * bandH;
      fillRect(ctx, 0, y0, VW, Math.min(bandH, VH - y0), c);
      for (let k = 0; k < 40; k++) {
        const h = (((i * 977 + k) * 2654435761) >>> 0);
        fillRect(ctx, h % VW, y0 + ((h >> 8) % bandH), 2, 1, THEME.outline);
      }
    });
    fillRect(ctx, 0, groundY, VW, 2, COLORS.greenDark);

    // 竪坑と梯子。画面下端まで抜けていく
    const shaftX = VW / 2 - 8;
    fillRect(ctx, shaftX - 2, groundY + 2, 20, VH - groundY - 2, THEME.outline);
    for (let y = groundY + 4; y < VH; y += 16) drawSpr(ctx, 'ladder', shaftX, y);

    // 深いところに敵の気配
    if (hasSpr('ev_chest')) drawSpr(ctx, 'ev_chest', 60, groundY + 104);
    drawSprOr(ctx, 'skull', 'icon_skull_small', 292, groundY + 152);

    // 坑口に3人。等倍で描く（拡大するとアウトラインだけ太くなる）
    const jobs = ['job_swordsman', 'job_guardian', 'job_skirmisher'];
    jobs.forEach((j, i) => {
      const bob = Math.floor(this.t * 2 + i * 3) % 2;
      drawSprOr(ctx, j, 'portrait', 206 + i * 26, groundY - 38 - bob);
    });

    if (Math.floor(this.t * 2) % 2 === 0) {
      const w = 200, bx = Math.floor((VW - w) / 2);
      fillRect(ctx, bx, VH - 66, w, 26, THEME.outline);
      strokeRect1(ctx, bx, VH - 66, w, 26, THEME.gold);
      drawTextCentered(ctx, 'タップして始める', VW / 2, VH - 60, 12, THEME.text);
    }
    drawText(ctx, `seed:${this.nav.state.data.seed.toString(16)}`, 4, VH - 12, 8, THEME.faint);
  }

  pointerDown(): void {
    unlockAudio();
    sfx('confirm');
    this.nav.goBase();
  }
}
