import type { Item } from '../sim/types';
import { baseDef } from '../data/bases';
import { uniqueDef } from '../data/uniques';
import { sellValue } from '../sim/items';
import { drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextRight, textWidth, wrapText } from '../render/font';
import { THEME } from './theme';
import { BORDER, ROLE, SPACE, TEXT } from './tokens';
import {
  RARITY_COLOR, RARITY_LABEL, affixLine, drawRarityFrame,
  itemIconName, itemName, itemScore, tierStars
} from './itemview';

// 装備カード（Balatro型UI設計書 Phase 4「Equipment Card を最優先で完成させる」）。
//
// 設計書 §3 が「カードには原則としてアイコン／名前／レアリティ／主要数値／
// 特殊効果／状態を持たせる」と定め、§4 が優先順位を
//   アイコン → 名前 → 主要数値 → レアリティ → 特殊効果 → 詳細説明
// と決めている。ここはその順に上から積む。
//
// ただし仕様書 §9.3 が「1画面に3種類以上のフォントサイズ」を禁止しているので、
// 優先順位は文字サイズだけでは表さない。サイズ（2段）に加えて
// 色（ROLE の役割色）・位置（上ほど重要）・区切り線を重ねて段を作る。

/** 主要数値の1行。ラベルと値、そして比較時の差分。 */
interface StatRow {
  label: string;
  value: string;
  color: string;
  /** 比較対象との差。undefined なら差分を出さない */
  delta?: number;
  /** 差分の単位（`%` など） */
  unit?: string;
  /** 大きいほうが良いか。false なら小さいほうが良い */
  higherIsBetter?: boolean;
}

/** その装備の主要数値。武器と防具で並びが違う。 */
function statsOf(item: Item, cmp?: Item | null): StatRow[] {
  const rows: StatRow[] = [];
  if (item.slot === 'weapon') {
    // 秒間火力を先頭に置く。威力はベースタイプが違うと比較にならないため、
    // 「どちらが強いか」を判断できる唯一の数字がこれ（§18 判断を速くする）。
    rows.push({
      label: '秒間火力', value: `${itemScore(item)}`, color: ROLE.attack,
      delta: cmp ? itemScore(item) - itemScore(cmp) : undefined, higherIsBetter: true
    });
    rows.push({
      label: '威力', value: `${item.power}`, color: THEME.dim,
      delta: cmp ? item.power - cmp.power : undefined, higherIsBetter: true
    });
    rows.push({
      label: '速度', value: item.speed.toFixed(2), color: ROLE.speed,
      delta: cmp ? Math.round((item.speed - cmp.speed) * 100) : undefined,
      unit: '', higherIsBetter: true
    });
    rows.push({
      label: '会心', value: `${item.crit.toFixed(1)}%`, color: ROLE.crit,
      delta: cmp ? Math.round((item.crit - cmp.crit) * 10) / 10 : undefined,
      unit: '%', higherIsBetter: true
    });
  } else {
    rows.push({
      label: '防御', value: `${item.power}`, color: ROLE.defense,
      delta: cmp ? item.power - cmp.power : undefined, higherIsBetter: true
    });
  }
  return rows;
}

const ROW_H = 13;
const HEAD_H = 40;

export interface EquipCardOptions {
  /** 比較対象（装備中の品）。渡すと主要数値に差分が付く */
  compareTo?: Item | null;
  /** カード上端の見出し（「装備中」「新しい品」など） */
  label?: string;
  /** 選択中として枠を強調する */
  selected?: boolean;
  /** 売却額を出す */
  showSellValue?: boolean;
  /** 縦の跳ね（§15 の取得フィードバック） */
  bounce?: number;
}

/** 描く前に高さを知る必要があるので、描画と同じ規則でここに一本化する。 */
export function equipCardHeight(item: Item, w: number, opts: EquipCardOptions = {}): number {
  let h = HEAD_H + statsOf(item, opts.compareTo).length * ROW_H + SPACE.md;
  if (item.affixes.length > 0) h += SPACE.sm + item.affixes.length * ROW_H;
  if (item.unique) {
    const u = uniqueDef(item.unique);
    h += SPACE.sm + ROW_H + wrapText(u.text, w - SPACE.md * 2, TEXT.body).length * ROW_H;
  }
  if (opts.showSellValue) h += ROW_H;
  return h + SPACE.md;
}

/**
 * 装備カード本体。使用した高さを返す。
 *
 * 情報量が増えてもカードそのものを巨大化させない（§3）ため、
 * 説明文は必ず折り返し、行数は中身から決める。
 */
export function drawEquipCard(
  ctx: CanvasRenderingContext2D, item: Item,
  x: number, y: number, w: number,
  opts: EquipCardOptions = {}
): number {
  const h = equipCardHeight(item, w, opts);
  const dy = opts.bounce ?? 0;
  y += dy;

  const rarity = RARITY_COLOR[item.rarity];
  drawRarityFrame(ctx, item.rarity, x, y, w, h);
  if (opts.selected) strokeRect1(ctx, x - 1, y - 1, w + 2, h + 2, THEME.text);

  if (opts.label) {
    drawText(ctx, opts.label, x + SPACE.md, y - 13, TEXT.body, THEME.dim);
  }

  // --- 1. アイコン ---
  drawSprOr(ctx, itemIconName(item), 'icon_W1', x + SPACE.md, y + SPACE.md, 2);

  // --- 2. レアリティ（アイコンの右上）---
  drawText(ctx, RARITY_LABEL[item.rarity], x + 46, y + SPACE.md, TEXT.body, rarity);

  // --- 3. 名前 ---
  const nameLines = wrapText(itemName(item), w - 52, TEXT.body, 2);
  nameLines.forEach((ln, i) => {
    drawText(ctx, ln, x + 46, y + 20 + i * ROW_H, TEXT.body, THEME.text);
  });
  drawText(ctx, baseDef(item.baseId).name, x + SPACE.md, y + 30, TEXT.body, THEME.faint);

  let ly = y + HEAD_H;
  fillRect(ctx, x + SPACE.md, ly - 3, w - SPACE.md * 2, BORDER.thin, THEME.panelLight);

  // --- 4. 主要数値（最重要。ここだけ見れば強さが分かる）---
  for (const s of statsOf(item, opts.compareTo)) {
    drawText(ctx, s.label, x + SPACE.md, ly, TEXT.body, THEME.dim);
    const hasDelta = s.delta !== undefined && s.delta !== 0;
    if (hasDelta && s.delta !== undefined) {
      // §8「数値変化をイベントとして扱う」。差分は必ず符号付きで出す。
      // 差分の幅は桁数で変わるので実測して避ける。固定値で逃がすと
      // 3桁になった瞬間に本体の数値へ食い込む（"191▲153" と繋がって読めない）
      const good = s.higherIsBetter === false ? s.delta < 0 : s.delta > 0;
      const txt = `${s.delta > 0 ? '▲' : '▼'}${Math.abs(s.delta)}${s.unit ?? ''}`;
      drawTextRight(ctx, txt, x + w - SPACE.md, ly, TEXT.body,
        good ? ROLE.positive : ROLE.negative);
      drawTextRight(ctx, s.value, x + w - SPACE.md - textWidth(txt, TEXT.body) - SPACE.sm,
        ly, TEXT.body, s.color);
    } else {
      drawTextRight(ctx, s.value, x + w - SPACE.md, ly, TEXT.body, s.color);
    }
    ly += ROW_H;
  }

  // --- 5. 特殊効果（アフィックス）---
  if (item.affixes.length > 0) {
    ly += SPACE.sm;
    for (const a of item.affixes) {
      fillRect(ctx, x + SPACE.md, ly + 4, 3, 3, a.tier >= 4 ? THEME.gold : THEME.dim);
      drawText(ctx, affixLine(a), x + SPACE.md + 7, ly, TEXT.body, THEME.text);
      drawTextRight(ctx, tierStars(a.tier), x + w - SPACE.md, ly, TEXT.body,
        a.tier >= 4 ? THEME.gold : THEME.dim);
      ly += ROW_H;
    }
  }

  // --- 6. ユニーク（ルールを書き換える1行）---
  if (item.unique) {
    const u = uniqueDef(item.unique);
    ly += SPACE.sm;
    fillRect(ctx, x + SPACE.md, ly - 2, w - SPACE.md * 2, BORDER.thin, THEME.goldDark);
    drawText(ctx, `《${u.name}》`, x + SPACE.md, ly + 1, TEXT.body, THEME.gold);
    ly += ROW_H;
    for (const ln of wrapText(u.text, w - SPACE.md * 2, TEXT.body)) {
      drawText(ctx, ln, x + SPACE.md, ly, TEXT.body, THEME.text);
      ly += ROW_H;
    }
  }

  if (opts.showSellValue) {
    drawTextRight(ctx, `売却 ${sellValue(item)}G`, x + w - SPACE.md, ly, TEXT.body, THEME.goldDark);
  }

  // --- 状態（§3 の6番目）---
  if (item.locked) {
    drawSprOr(ctx, 'icon_lock', 'icon_A3', x + w - 20, y + SPACE.md);
  }

  return h;
}

/** 比較表示の高さ。呼び出し側がレイアウトを組めるよう、描画と同じ規則で返す。 */
export function compareHeight(current: Item | null, next: Item, w: number): number {
  if (!current) return equipCardHeight(next, w);
  const colW = Math.floor((w - SPACE.md) / 2);
  return Math.max(
    equipCardHeight(current, colW),
    equipCardHeight(next, colW, { compareTo: current })
  ) + SPACE.sm + 16;
}

/**
 * 装備比較（設計書 §11「ハクスラでは新しい装備を拾った瞬間が重要」）。
 *
 *   CURRENT              NEW
 *   Iron Sword           Steel Sword
 *   ATK +38              ATK +46  ▲8
 *
 * 左に装備中、右に候補。差分は右のカードにだけ付ける。
 * 「装備するべきか」を一目で判断できることだけを狙う。
 */
export function drawCompare(
  ctx: CanvasRenderingContext2D,
  current: Item | null, next: Item,
  x: number, y: number, w: number
): number {
  if (!current) {
    return drawEquipCard(ctx, next, x, y, w, { label: '新しい品' });
  }
  const colW = Math.floor((w - SPACE.md) / 2);
  const hL = drawEquipCard(ctx, current, x, y, colW, { label: '装備中' });
  const hR = drawEquipCard(ctx, next, x + colW + SPACE.md, y, colW, {
    label: '候補', compareTo: current, selected: true
  });
  const h = Math.max(hL, hR);

  // 結論の1行。カードを2枚読ませてから判断させるのではなく、
  // 「差し引きどうなのか」をここで言い切る
  const diff = itemScore(next) - itemScore(current);
  const verdict = diff > 0 ? `この候補のほうが ${diff} 強い`
    : diff < 0 ? `装備中のほうが ${-diff} 強い`
    : '素の強さは互角。効果で選ぶ';
  const vy = y + h + SPACE.sm;
  const vw = textWidth(verdict, TEXT.body) + SPACE.lg * 2;
  const vx = x + Math.floor((w - vw) / 2);
  fillRect(ctx, vx, vy, vw, 16, ROLE.edge);
  strokeRect1(ctx, vx, vy, vw, 16, diff > 0 ? ROLE.positive : diff < 0 ? ROLE.negative : THEME.dim);
  drawText(ctx, verdict, vx + SPACE.lg, vy + 2, TEXT.body,
    diff > 0 ? ROLE.positive : diff < 0 ? ROLE.negative : THEME.dim);

  return h + SPACE.sm + 16;
}
