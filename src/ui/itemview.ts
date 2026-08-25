import type { Affix, Element, Item, Rarity } from '../sim/types';
import { baseDef } from '../data/bases';
import { affixDef } from '../data/affixes';
import { uniqueDef } from '../data/uniques';
import { dominantElement, sellValue } from '../sim/items';
import { drawNineSlice, drawSpr, drawSprOr, fillRect, hasSpr, strokeRect1 } from '../render/draw';
import { drawText, drawTextRight, textWidth } from '../render/font';
import { THEME } from './theme';

// 全画面で共有するアイテム表示。装備は画面のどこに出ても同じ見え方であること。

export const RARITY_COLOR: Record<Rarity, string> = {
  common: THEME.dim,
  fine: THEME.blue,
  rare: THEME.gold,
  relic: THEME.red
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '並', fine: '上質', rare: '稀少', relic: '遺物'
};

const ELEM_LABEL: Record<Element, string> = {
  physical: '物理', fire: '炎', lightning: '雷', poison: '毒', ice: '氷'
};

export function elementLabel(e: Element): string {
  return ELEM_LABEL[e];
}

/** ベースタイプのアイコン名（無ければ v1 のアイコンで代替する）。 */
export function itemIconName(item: Item): string {
  const name = `base_${item.baseId}`;
  if (hasSpr(name)) return name;
  const fallback: Record<string, string> = {
    dagger: 'icon_W2', sword: 'icon_W1', greatsword: 'icon_W3',
    spear: 'icon_W4', bow: 'icon_W4', staff: 'icon_T1',
    light: 'icon_A2', medium: 'icon_A3', heavy: 'icon_A1'
  };
  return fallback[item.baseId] ?? 'icon_W1';
}

export function elementIconName(e: Element): string {
  return `elem_${e}`;
}

/** 表示名。遺物はユニーク名を冠し、属性が乗っていれば接頭辞を付ける。 */
export function itemName(item: Item): string {
  const base = baseDef(item.baseId).name;
  if (item.unique) return `${uniqueDef(item.unique).name}の${base}`;
  if (item.slot === 'weapon') {
    const dom = dominantElement(item.element);
    if (dom !== 'physical') return `${ELEM_LABEL[dom]}の${base}`;
  }
  return base;
}

/** アフィックス1行の文言。数値は出さず5段階のティアで表す（§5.6）。 */
export function affixLine(a: Affix): string {
  const def = affixDef(a.kind);
  const elem = a.element ? `${ELEM_LABEL[a.element]}` : '';
  switch (a.kind) {
    case 'elementFlat': return `${elem}ダメージ追加`;
    case 'resistPct': return `${elem}耐性`;
    default: return def.name;
  }
}

export function tierStars(tier: number): string {
  return '★'.repeat(tier) + '☆'.repeat(5 - tier);
}

/** レアリティ枠。専用スプライトが無ければ色枠で代替する。 */
export function drawRarityFrame(
  ctx: CanvasRenderingContext2D, rarity: Rarity,
  x: number, y: number, w: number, h: number
): void {
  const name = `rarity_${rarity === 'common' ? 'common' : rarity === 'fine' ? 'fine' : rarity === 'rare' ? 'rare' : 'relic'}`;
  if (hasSpr(name)) {
    drawNineSlice(ctx, name, x, y, w, h);
  } else {
    drawNineSlice(ctx, 'button', x, y, w, h);
    strokeRect1(ctx, x, y, w, h, RARITY_COLOR[rarity]);
  }
}

export interface ItemCellOptions {
  selected?: boolean;
  showSellValue?: boolean;
  /** 比較対象。装備中との差を ▲▼ で示す */
  compareTo?: Item | null;
  dim?: boolean;
}

/**
 * 一覧用のアイテム1マス（幅 w × 高さ 34 想定）。
 * アイコン・名前・レアリティ・要点だけを出し、詳細はタップで開く。
 */
export function drawItemRow(
  ctx: CanvasRenderingContext2D, item: Item,
  x: number, y: number, w: number, h: number,
  opts: ItemCellOptions = {}
): void {
  drawRarityFrame(ctx, item.rarity, x, y, w, h);
  if (opts.selected) strokeRect1(ctx, x, y, w, h, THEME.text);

  drawSprOr(ctx, itemIconName(item), 'icon_W1', x + 5, y + Math.floor((h - 16) / 2));

  const nameX = x + 25;
  drawText(ctx, itemName(item), nameX, y + 5, 8, RARITY_COLOR[item.rarity]);

  // 2段目：要点（武器＝威力と速度、防具＝防御）とアフィックス数
  const sub = item.slot === 'weapon'
    ? `秒間${Math.round(item.power * item.speed)}`
    : `防御${item.power}`;
  drawText(ctx, sub, nameX, y + h - 13, 8, THEME.dim);

  // アフィックス枠を点で示す（レアリティ＝枠数、§5.7）
  let px = nameX + textWidth(sub, 8) + 6;
  for (const a of item.affixes) {
    fillRect(ctx, px, y + h - 11, 3, 3, a.tier >= 4 ? THEME.gold : THEME.dim);
    px += 5;
  }
  if (item.unique) drawText(ctx, '遺', px + 1, y + h - 13, 8, THEME.red);

  // 装備中との比較（§10 担当5の観点）
  if (opts.compareTo) {
    const val = (i: Item): number => i.slot === 'weapon' ? Math.round(i.power * i.speed) : i.power;
    const d = val(item) - val(opts.compareTo);
    if (d !== 0) {
      drawTextRight(ctx, `${d > 0 ? '▲' : '▼'}${Math.abs(d)}`,
        x + w - (item.locked ? 22 : 6), y + 5, 8, d > 0 ? THEME.green : THEME.red);
    }
  } else if (opts.showSellValue) {
    drawTextRight(ctx, `${sellValue(item)}G`, x + w - (item.locked ? 22 : 6), y + 5, 8, THEME.goldDark);
  }

  if (item.locked) {
    drawSprOr(ctx, 'icon_lock', 'icon_A3', x + w - 20, y + Math.floor((h - 16) / 2));
  }
  if (opts.dim) {
    ctx.fillStyle = 'rgba(26,20,32,0.55)';
    ctx.fillRect(x, y, w, h);
  }
}

/** 詳細パネル。使用した高さを返す。 */
export function drawItemDetail(
  ctx: CanvasRenderingContext2D, item: Item,
  x: number, y: number, w: number
): number {
  const lines = item.affixes.length + (item.unique ? 2 : 0);
  const h = 62 + lines * 12;
  drawRarityFrame(ctx, item.rarity, x, y, w, h);
  drawSprOr(ctx, itemIconName(item), 'icon_W1', x + 6, y + 6, 2);
  drawText(ctx, itemName(item), x + 44, y + 8, 12, RARITY_COLOR[item.rarity]);
  drawText(ctx, `${RARITY_LABEL[item.rarity]}／${baseDef(item.baseId).name}`, x + 44, y + 24, 8, THEME.dim);

  let ly = y + 40;
  if (item.slot === 'weapon') {
    // 威力はベースタイプによって桁が違い、単独では比較できない。
    // 比較可能な「秒間火力（威力×速度）」を主役にして併記する。
    drawText(ctx, `秒間火力 ${Math.round(item.power * item.speed)}`, x + 8, ly, 8, THEME.gold);
    drawText(ctx, `威力${item.power} 速${item.speed.toFixed(2)} 会心${item.crit.toFixed(1)}%`,
      x + 96, ly, 8, THEME.dim);
    ly += 12;
    // 属性配分
    let ex = x + 8;
    for (const [k, v] of Object.entries(item.element)) {
      if (v === undefined || v <= 0) continue;
      const e = k as Element;
      if (hasSpr(elementIconName(e))) drawSpr(ctx, elementIconName(e), ex, ly - 1);
      drawText(ctx, `${ELEM_LABEL[e]}${Math.round(v * 100)}%`, ex + (hasSpr(elementIconName(e)) ? 10 : 0), ly, 8, THEME.dim);
      ex += 52;
    }
    ly += 12;
  } else {
    drawText(ctx, `防御 ${item.power}`, x + 8, ly, 8, THEME.text);
    ly += 12;
  }

  for (const a of item.affixes) {
    drawText(ctx, affixLine(a), x + 8, ly, 8, THEME.text);
    drawTextRight(ctx, tierStars(a.tier), x + w - 8, ly, 8, a.tier >= 4 ? THEME.gold : THEME.dim);
    ly += 12;
  }
  if (item.unique) {
    const u = uniqueDef(item.unique);
    drawText(ctx, `《${u.name}》`, x + 8, ly, 8, THEME.red);
    ly += 12;
    drawText(ctx, u.text, x + 8, ly, 8, THEME.gold);
    ly += 12;
  }
  return h;
}

/** ソート順（§10 担当5）。 */
export type SortKey = 'power' | 'rarity' | 'slot' | 'recent';

export function sortItems(items: Item[], key: SortKey): Item[] {
  const rank = (r: Rarity): number => ['common', 'fine', 'rare', 'relic'].indexOf(r);
  const arr = [...items];
  switch (key) {
    case 'power': arr.sort((a, b) => b.power - a.power); break;
    case 'rarity': arr.sort((a, b) => rank(b.rarity) - rank(a.rarity) || b.power - a.power); break;
    case 'slot': arr.sort((a, b) => a.slot.localeCompare(b.slot) || b.power - a.power); break;
    case 'recent': arr.reverse(); break;
  }
  return arr;
}
