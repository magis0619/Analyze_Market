import type { Shop } from '../game/shop';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, fillRect } from '../render/draw';
import { drawText, drawTextCentered, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { LOOT, lootDef } from '../data/loot';
import { sfx } from '../render/audio';
import { hitBtn, drawBtn, type Btn } from './widgets';

// 図鑑：納品された戦利品と「誰が持ち帰ったか」の記録（仕様 §3.4）。

export class CompendiumOverlay {
  private page = 0;
  private closeBtn: Btn = { x: VW - 76, y: VH - 48, w: 64, h: 28, label: '閉じる' };
  private prevBtn: Btn = { x: 12, y: VH - 48, w: 44, h: 28, label: '◀' };
  private nextBtn: Btn = { x: 60, y: VH - 48, w: 44, h: 28, label: '▶' };

  constructor(private shop: Shop) {}

  private entries(): { lootId: string; count: number; foundBy: string; generation: number; runIndex: number }[] {
    const map = new Map<string, { count: number; foundBy: string; generation: number; runIndex: number }>();
    for (const e of this.shop.compendium) {
      const cur = map.get(e.lootId);
      if (cur) cur.count++;
      else map.set(e.lootId, { count: 1, foundBy: e.foundBy, generation: e.generation, runIndex: e.runIndex });
    }
    // 図鑑順（LOOT定義順）
    return LOOT.filter(l => map.has(l.id)).map(l => {
      const m = map.get(l.id);
      if (!m) throw new Error('unreachable');
      return { lootId: l.id, ...m };
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(13,10,18,0.82)';
    ctx.fillRect(0, 0, VW, VH);
    drawNineSlice(ctx, 'frame', 6, 24, VW - 12, VH - 84);
    const all = this.entries();
    drawTextCentered(ctx, `図鑑 ${all.length}/${LOOT.length}`, VW / 2, 36, 12, THEME.gold);

    const perPage = 6;
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    const slice = all.slice(this.page * perPage, this.page * perPage + perPage);

    if (all.length === 0) {
      drawTextCentered(ctx, 'まだ何も納品されていない', VW / 2, 200, 12, THEME.dim);
    }
    slice.forEach((e, i) => {
      const y = 58 + i * 78;
      const def = lootDef(e.lootId);
      fillRect(ctx, 16, y, VW - 32, 72, THEME.panel);
      drawSpr(ctx, `loot_${e.lootId}`, 24, y + 8, 2);
      drawText(ctx, def.name + (def.rare ? ' ★' : ''), 66, y + 8, 12, def.rare ? THEME.gold : THEME.text);
      drawText(ctx, `×${e.count}`, VW - 56, y + 8, 8, THEME.dim);
      drawTextWrapped(ctx, def.note, 66, y + 26, VW - 100, 8, THEME.dim, 2);
      drawText(ctx, `初納品：${e.foundBy}（第${e.generation}代・${e.runIndex}回目）`, 66, y + 52, 8, THEME.faint);
    });

    drawText(ctx, `${this.page + 1}/${pages}`, 116, VH - 40, 8, THEME.dim);
    drawBtn(ctx, this.prevBtn, 8);
    drawBtn(ctx, this.nextBtn, 8);
    drawBtn(ctx, this.closeBtn, 8);
  }

  /** true を返したら閉じる。 */
  pointerDown(x: number, y: number): boolean {
    if (hitBtn(this.closeBtn, x, y)) { sfx('tap'); return true; }
    if (hitBtn(this.prevBtn, x, y)) { this.page = Math.max(0, this.page - 1); sfx('tap'); return false; }
    if (hitBtn(this.nextBtn, x, y)) { this.page++; sfx('tap'); return false; }
    return false;
  }
}
