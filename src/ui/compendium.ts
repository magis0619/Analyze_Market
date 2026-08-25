import type { GameScreen, Nav } from '../game/app';
import type { Rarity } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { drawHeader, drawTabs, hitHeaderBack, hitTab } from './components';

const TAB_LABELS = ['装備', 'ユニーク効果'] as const;
import { BASE_TYPES } from '../data/bases';
import { UNIQUES } from '../data/uniques';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { RARITY_COLOR, RARITY_LABEL, drawRarityFrame } from './itemview';

// 図鑑（§7.4）。初回入手と、どのステージで出たかを記録する。
// 未発見は影だけを見せて「まだ埋まっていない枠」が分かるようにする。

const RARITIES: readonly Rarity[] = ['common', 'fine', 'rare', 'relic'];

/** レアリティ＝アフィックスの枠数（§5.7）。マスに点で出して差を見せる。 */
const AFFIX_SLOTS: Record<Rarity, number> = {
  common: 0, fine: 2, rare: 4, relic: 3
};

const GRID_Y = 78;
const CELL = 40;
const COLS = 8;
const GRID_X = Math.floor((VW - COLS * CELL) / 2);
/** グリッドに使う最大の高さ。中身が少なければその分だけ縮める */
const GRID_H_MAX = 300;

interface Entry {
  key: string;
  name: string;
  sub: string;
  icon: string;
  rarity: Rarity;
  flavor: string;
}

export class CompendiumScreen implements GameScreen {
  private scroll = 0;
  private dragY: number | null = null;
  private dragged = false;
  private tab: 0 | 1 = 0;
  private selected = 0;

  constructor(private nav: Nav) {}

  update(): void {}

  private entries(): Entry[] {
    if (this.tab === 0) {
      const out: Entry[] = [];
      for (const b of BASE_TYPES) {
        for (const r of RARITIES) {
          out.push({
            key: `${b.id}|${r}`,
            name: `${RARITY_LABEL[r]}の${b.name}`,
            sub: b.slot === 'weapon' ? '武器' : '防具',
            icon: `base_${b.id}`,
            rarity: r,
            flavor: r === 'relic' ? 'ルールを書き換える力を宿している'
              : r === 'rare' ? 'アフィックスを3〜4枠持つ'
              : r === 'fine' ? 'アフィックスを1〜2枠持つ'
              : 'アフィックスを持たない素の品'
          });
        }
      }
      return out;
    }
    return UNIQUES.map(u => ({
      key: `unique:${u.kind}`,
      name: u.name,
      sub: 'ユニーク効果',
      icon: 'base_greatsword',
      rarity: 'relic' as Rarity,
      flavor: u.text
    }));
  }

  private gridRows(n: number): number {
    return Math.ceil(n / COLS);
  }

  /** 中身の行数からグリッドの高さを決める。余った縦は詳細に回す。 */
  private gridH(count: number): number {
    return Math.max(CELL * 2, Math.min(GRID_H_MAX, this.gridRows(count) * CELL));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const rows = this.entries();
    const GRID_H = this.gridH(rows.length);
    const DETAIL_Y = GRID_Y + GRID_H + 8;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    const found = rows.filter(r => st.data.compendium[r.key]).length;
    drawHeader(ctx, VW, {
      title: '図鑑', back: true,
      gold: st.data.gold, meta: `${found}/${rows.length}`
    });
    drawTabs(ctx, 8, 32, VW - 16, 22, TAB_LABELS, this.tab);

    // グリッド（未発見は影）
    ctx.save();
    ctx.beginPath();
    ctx.rect(GRID_X, GRID_Y, COLS * CELL, GRID_H);
    ctx.clip();
    const firstRow = Math.max(0, Math.floor(this.scroll / CELL));
    const lastRow = Math.min(this.gridRows(rows.length) - 1, firstRow + Math.ceil(GRID_H / CELL) + 1);
    for (let r = firstRow; r <= lastRow; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const e = rows[i];
        if (!e) continue;
        const x = GRID_X + c * CELL;
        const y = GRID_Y + r * CELL - this.scroll;
        const entry = st.data.compendium[e.key];
        if (entry) {
          drawRarityFrame(ctx, e.rarity, x + 1, y + 1, CELL - 2, CELL - 2);
          drawSprOr(ctx, e.icon, 'icon_W1', x + CELL / 2 - 8, y + CELL / 2 - 11);
          // 同じベースは並・上質・稀少で絵が完全に同じになる。枠の色だけでは
          // 何が違うのか読み取れないので、レアリティの正体である
          // 「アフィックスの枠数」（§5.7）を点で見せる。
          const slots = AFFIX_SLOTS[e.rarity];
          for (let k = 0; k < slots; k++) {
            fillRect(ctx, x + 5 + k * 5, y + CELL - 8, 3, 3,
              e.rarity === 'relic' ? THEME.gold : THEME.dim);
          }
          if (e.rarity === 'relic') drawText(ctx, '遺', x + CELL - 12, y + CELL - 10, 8, THEME.gold);
          drawTextRight(ctx, `${entry.count}`, x + CELL - 4, y + 3, 8, THEME.faint);
        } else {
          fillRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, THEME.panel);
          strokeRect1(ctx, x + 1, y + 1, CELL - 2, CELL - 2, THEME.outline);
          drawTextCentered(ctx, '?', x + CELL / 2, y + CELL / 2 - 8, 12, THEME.faint);
        }
        if (i === this.selected) strokeRect1(ctx, x, y, CELL, CELL, THEME.text);
      }
    }
    ctx.restore();
    strokeRect1(ctx, GRID_X, GRID_Y, COLS * CELL, GRID_H, THEME.outline);

    // 選択中の詳細
    const sel = rows[this.selected];
    drawNineSlice(ctx, 'frame', 8, DETAIL_Y, VW - 16, VH - DETAIL_Y - 8);
    if (sel) {
      const entry = st.data.compendium[sel.key];
      if (entry) {
        drawSprOr(ctx, sel.icon, 'icon_W1', 18, DETAIL_Y + 10, 2);
        drawText(ctx, sel.name, 56, DETAIL_Y + 8, 12, RARITY_COLOR[sel.rarity]);
        drawText(ctx, `${sel.sub}／${RARITY_LABEL[sel.rarity]}`, 56, DETAIL_Y + 26, 8, THEME.dim);
        // §7.4「初回入手」「どのステージで出たか」
        drawText(ctx,
          `初出: ${entry.firstStage > 0 ? stageDef(entry.firstStage).name : '初期装備'}　×${entry.count}`,
          56, DETAIL_Y + 40, 8, THEME.gold);
        drawTextWrapped(ctx, sel.flavor, 18, DETAIL_Y + 58, VW - 36, 8, THEME.dim, 2);
      } else {
        drawTextCentered(ctx, '未発見', VW / 2, DETAIL_Y + 16, 12, THEME.dim);
        drawTextCentered(ctx, `${sel.sub}／${RARITY_LABEL[sel.rarity]}`,
          VW / 2, DETAIL_Y + 38, 8, THEME.faint);
        drawTextCentered(ctx, '派遣で見つけると記録される', VW / 2, DETAIL_Y + 54, 8, THEME.faint);
      }
    }
  }

  pointerDown(px: number, py: number): void {
    this.dragY = py;
    this.dragged = false;
    if (hitHeaderBack(px, py)) { sfx('tap'); this.nav.goBase(); return; }
    const tab = hitTab(8, 32, VW - 16, 22, TAB_LABELS.length, px, py);
    if (tab >= 0) {
      this.tab = tab === 0 ? 0 : 1;
      this.scroll = 0;
      this.selected = 0;
      sfx('tap');
      return;
    }
  }

  pointerMove(_px: number, py: number): void {
    if (this.dragY === null) return;
    const dy = this.dragY - py;
    if (Math.abs(dy) > 3) this.dragged = true;
    const n = this.entries().length;
    const maxScroll = Math.max(0, this.gridRows(n) * CELL - this.gridH(n));
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll + dy));
    this.dragY = py;
  }

  pointerUp(px: number, py: number): void {
    const wasDragging = this.dragged;
    this.dragY = null;
    this.dragged = false;
    if (wasDragging) return;
    if (px < GRID_X || px >= GRID_X + COLS * CELL) return;
    if (py < GRID_Y || py >= GRID_Y + this.gridH(this.entries().length)) return;
    const c = Math.floor((px - GRID_X) / CELL);
    const r = Math.floor((py - GRID_Y + this.scroll) / CELL);
    const i = r * COLS + c;
    if (i >= 0 && i < this.entries().length) {
      this.selected = i;
      sfx('tap');
    }
  }
}
