import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, fillRect } from '../render/draw';
import { drawText, drawTextCentered, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { sfx } from '../render/audio';
import { drawBtn, hitBtn, type Btn } from './widgets';
import { lootDef } from '../data/loot';
import { equipDef } from '../data/equipment';
import { CompendiumOverlay } from './compendium';

// 結果フェーズ（約10秒）：到達深度の確定、戦利品の納品、装備の消耗・喪失。
// 敗因・成功要因は手紙形式で1行だけ明示する（仕様 §3.4）。

export class ResultScreen implements GameScreen {
  private t = 0;
  private applied = false;
  private overlay: CompendiumOverlay | null = null;
  private nextBtn: Btn = { x: VW - 124, y: VH - 48, w: 112, h: 32, label: '次へ', accent: true };
  private bookBtn: Btn = { x: 12, y: VH - 48, w: 76, h: 32, label: '図鑑' };

  constructor(private app: App) {
    sfx('letter');
  }

  update(dt: number): void {
    this.t += dt;
    if (this.app.auto && this.t > 1.2) this.next();
  }

  private next(): void {
    if (this.applied) return;
    this.applied = true;
    const run = this.app.run;
    if (run?.outcome) {
      const survived = run.outcome.fate !== 'died';
      this.app.shop.applyOutcome(run.equipment, run.outcome);
      if (survived && this.app.shop.regular.runIndex > 1) sfx('levelup');
    }
    this.app.gotoNegotiation();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const run = this.app.run;
    const out = run?.outcome;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    if (!run || !out) return;

    const died = out.fate === 'died';
    drawTextCentered(ctx, died ? '報せが届いた' : `${run.adv.name}が戻った`, VW / 2, 20, 12,
      died ? THEME.red : THEME.text);

    // 手紙
    drawNineSlice(ctx, 'frame', 12, 44, VW - 24, 150);
    drawSpr(ctx, 'letter', 24, 60, 2);
    drawText(ctx, died ? '『同行者からの手紙』' : `『${run.adv.name}の手記』`, 100, 60, 8, THEME.dim);
    drawTextWrapped(ctx, `「${out.letterLine}」`, 100, 76, VW - 128, 12, THEME.text, 4);
    if (out.letterEquip) {
      drawSpr(ctx, `icon_${out.letterEquip}`, 24, 144);
      drawText(ctx, `${equipDef(out.letterEquip).name}が立役者だった`, 46, 150, 8, THEME.gold);
    }

    // 到達深度
    drawNineSlice(ctx, 'frame', 12, 202, VW - 24, 56);
    drawText(ctx, `到達深度 ${out.depth}`, 28, 216, 12, THEME.gold);
    drawText(ctx, `依頼は深度${out.questDepth}`, 28, 236, 8, THEME.dim);
    drawTextCentered(ctx, out.questMet ? '依頼達成' : '依頼未達',
      VW - 70, 222, 12, out.questMet ? THEME.green : THEME.red);

    // 納品
    drawNineSlice(ctx, 'frame', 12, 266, VW - 24, 150);
    drawText(ctx, '納品', 28, 276, 8, THEME.dim);
    if (out.lootIds.length === 0 && out.goldGained === 0) {
      drawText(ctx, died ? '荷は還らなかった' : '手ぶらだった', 28, 296, 12, THEME.faint);
    } else {
      out.lootIds.slice(0, 5).forEach((id, i) => {
        const def = lootDef(id);
        const y = 292 + i * 20;
        drawSpr(ctx, `loot_${id}`, 28, y);
        drawText(ctx, def.name + (def.rare ? ' ★' : ''), 52, y + 4, 8,
          def.rare ? THEME.gold : THEME.text);
        drawText(ctx, '→ 図鑑に登録', VW - 120, y + 4, 8, THEME.faint);
      });
      if (out.goldGained > 0) {
        drawSpr(ctx, 'coin', 30, 296 + Math.min(5, out.lootIds.length) * 20);
        drawText(ctx, `${out.goldGained}G`, 52, 294 + Math.min(5, out.lootIds.length) * 20, 8, THEME.gold);
      }
    }

    // 装備の消耗・喪失
    drawNineSlice(ctx, 'frame', 12, 424, VW - 24, 120);
    drawText(ctx, '装備', 28, 434, 8, THEME.dim);
    let ly = 450;
    if (died) {
      drawTextWrapped(ctx, '渡した装備はすべて失われた。あの棚に戻ることはない。', 28, ly, VW - 56, 8, THEME.red, 2);
      ly += 26;
      drawTextWrapped(ctx, `${run.adv.name}が二度と扉をくぐることもない。`, 28, ly, VW - 56, 8, THEME.faint, 2);
    } else {
      if (out.brokenEquip.length === 0 && out.consumedEquip.length === 0) {
        drawText(ctx, '手入れの必要もない。良い旅だった', 28, ly, 8, THEME.faint);
      }
      for (const id of out.brokenEquip) {
        drawSpr(ctx, `icon_${id}`, 28, ly - 4);
        drawText(ctx, `${equipDef(id).name}は傷んだ（次回は修理中）`, 50, ly, 8, THEME.dim);
        ly += 20;
      }
      for (const id of out.consumedEquip) {
        drawSpr(ctx, `icon_${id}`, 28, ly - 4);
        drawText(ctx, `${equipDef(id).name}は使い切った`, 50, ly, 8, THEME.dim);
        ly += 20;
      }
    }

    drawBtn(ctx, this.bookBtn, 12);
    drawBtn(ctx, this.nextBtn, 12);
    if (this.overlay) this.overlay.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.overlay) {
      if (this.overlay.pointerDown(x, y)) this.overlay = null;
      return;
    }
    if (hitBtn(this.bookBtn, x, y)) {
      sfx('tap');
      this.overlay = new CompendiumOverlay(this.app.shop);
      return;
    }
    if (hitBtn(this.nextBtn, x, y)) {
      sfx('confirm');
      this.next();
    }
  }
}
