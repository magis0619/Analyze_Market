import type { GameScreen, Nav } from '../game/app';
import type { Rarity } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { drawBtn, hitBtn, type Btn } from './widgets';
import { BASE_TYPES } from '../data/bases';
import { UNIQUES } from '../data/uniques';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { RARITY_COLOR, RARITY_LABEL, drawRarityFrame } from './itemview';

// 図鑑（§7.4）。初回入手と、どのステージで出たかを記録する。

const RARITIES: readonly Rarity[] = ['common', 'fine', 'rare', 'relic'];
const LIST_Y = 56;
const LIST_H = VH - LIST_Y - 52;
const ROW_H = 30;

export class CompendiumScreen implements GameScreen {
  private scroll = 0;
  private dragY: number | null = null;
  private tab: 0 | 1 = 0;
  private backBtn: Btn = { x: 8, y: 4, w: 56, h: 20, label: '戻る' };

  constructor(private nav: Nav) {}

  update(): void {}

  private rows(): { key: string; label: string; sub: string; color: string; icon: string; rarity: Rarity | null }[] {
    const out: { key: string; label: string; sub: string; color: string; icon: string; rarity: Rarity | null }[] = [];
    if (this.tab === 0) {
      for (const b of BASE_TYPES) {
        for (const r of RARITIES) {
          out.push({
            key: `${b.id}|${r}`,
            label: `${RARITY_LABEL[r]}の${b.name}`,
            sub: b.slot === 'weapon' ? '武器' : '防具',
            color: RARITY_COLOR[r],
            icon: `base_${b.id}`,
            rarity: r
          });
        }
      }
    } else {
      for (const u of UNIQUES) {
        out.push({
          key: `unique:${u.kind}`,
          label: u.name,
          sub: u.text,
          color: THEME.red,
          icon: 'base_greatsword',
          rarity: 'relic'
        });
      }
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawBtn(ctx, this.backBtn, 8);
    drawTextCentered(ctx, '図鑑', VW / 2, 8, 12, THEME.text);

    const rows = this.rows();
    const found = rows.filter(r => st.data.compendium[r.key]).length;
    drawTextRight(ctx, `${found}/${rows.length}`, VW - 8, 8, 12, THEME.gold);

    // タブ
    const tabs = ['装備', 'ユニーク効果'];
    tabs.forEach((label, i) => {
      const w = 120, x = 8 + i * (w + 4);
      const sel = this.tab === i;
      fillRect(ctx, x, 30, w, 20, sel ? THEME.panelLight : THEME.panel);
      if (sel) strokeRect1(ctx, x, 30, w, 20, THEME.gold);
      drawTextCentered(ctx, label, x + w / 2, 36, 8, sel ? THEME.gold : THEME.dim);
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(8, LIST_Y, VW - 16, LIST_H);
    ctx.clip();
    const first = Math.max(0, Math.floor(this.scroll / ROW_H));
    const last = Math.min(rows.length - 1, first + Math.ceil(LIST_H / ROW_H) + 1);
    for (let i = first; i <= last; i++) {
      const row = rows[i];
      if (!row) continue;
      const y = LIST_Y + i * ROW_H - this.scroll;
      const entry = st.data.compendium[row.key];
      if (row.rarity) drawRarityFrame(ctx, row.rarity, 8, y, VW - 16, ROW_H - 2);
      else fillRect(ctx, 8, y, VW - 16, ROW_H - 2, THEME.panel);

      if (entry) {
        drawSprOr(ctx, row.icon, 'icon_W1', 12, y + 5);
        drawText(ctx, row.label, 32, y + 4, 8, row.color);
        // §7.4「初回入手」「どのステージで出たか」
        const from = row.sub.length > 12
          ? row.sub
          : `${row.sub}／初出: ${entry.firstStage > 0 ? stageDef(entry.firstStage).name : '初期装備'}`;
        drawText(ctx, from, 32, y + 16, 8, THEME.dim);
        drawTextRight(ctx, `×${entry.count}`, VW - 14, y + 9, 8, THEME.dim);
      } else {
        fillRect(ctx, 12, y + 5, 16, 16, THEME.outline);
        drawTextCentered(ctx, '?', 20, y + 8, 8, THEME.faint);
        drawText(ctx, '未発見', 32, y + 9, 8, THEME.faint);
      }
    }
    ctx.restore();

    if (this.tab === 1) {
      const sel = rows.find(r => st.data.compendium[r.key]);
      if (sel) {
        drawTextWrapped(ctx, '', 0, 0, 10, 8, THEME.dim, 1);
      }
    }
    drawTextCentered(ctx, 'ドラッグでスクロール', VW / 2, VH - 40, 8, THEME.dim);
  }

  pointerDown(px: number, py: number): void {
    this.dragY = py;
    if (hitBtn(this.backBtn, px, py)) { sfx('tap'); this.nav.goBase(); return; }
    for (let i = 0; i < 2; i++) {
      const w = 120, x = 8 + i * (w + 4);
      if (px >= x && px < x + w && py >= 30 && py < 50) {
        this.tab = i === 0 ? 0 : 1;
        this.scroll = 0;
        sfx('tap');
        return;
      }
    }
  }

  pointerMove(_px: number, py: number): void {
    if (this.dragY === null) return;
    const dy = this.dragY - py;
    const maxScroll = Math.max(0, this.rows().length * ROW_H - LIST_H);
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll + dy));
    this.dragY = py;
  }

  pointerUp(): void {
    this.dragY = null;
  }
}
