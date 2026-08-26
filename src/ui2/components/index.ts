import type { Item, Rarity } from '../../sim/types';
import { baseDef } from '../../data/bases';
import { affixDef } from '../../data/affixes';
import { uniqueDef } from '../../data/uniques';
import { dominantElement, sellValue } from '../../sim/items';
import { each, esc, num, when } from '../dom';

// 共通UIコンポーネント（docs/UI-SPEC.md §3.2）。
//
// すべて「HTML文字列を返す純関数」。状態を持たない。
// 同じ入力から必ず同じ出力になるので、表明で確かめられる。

// ---------------------------------------------------------------- レアリティ

export const RARITY_CLASS: Record<Rarity, string> = {
  common: 'common', fine: 'fine', rare: 'rare', relic: 'relic'
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: '並', fine: '上質', rare: '稀少', relic: '遺物'
};
const RARITY_EN: Record<Rarity, string> = {
  common: 'Common', fine: 'Fine', rare: 'Rare', relic: 'Relic'
};

const ELEM_LABEL: Record<string, string> = {
  physical: '物理', fire: '炎', lightning: '雷', poison: '毒', ice: '氷'
};
const ELEM_CLASS: Record<string, string> = {
  physical: 'phys', fire: 'fire', lightning: 'bolt', poison: 'pois', ice: 'ice'
};

export function elementLabel(e: string): string { return ELEM_LABEL[e] ?? e; }
export function elementClass(e: string): string { return ELEM_CLASS[e] ?? 'phys'; }

/** 強さの唯一の指標。武器は秒間火力、防具は防御（§3.3）。 */
export function itemScore(it: Item): number {
  return it.slot === 'weapon' ? Math.round(it.power * it.speed) : it.power;
}

export function itemName(it: Item): string {
  const base = baseDef(it.baseId).name;
  if (it.unique) return `${uniqueDef(it.unique).name}の${base}`;
  if (it.slot === 'weapon') {
    const dom = dominantElement(it.element);
    if (dom !== 'physical') return `${elementLabel(dom)}の${base}`;
  }
  return base;
}

export function itemIcon(it: Item): string {
  return it.slot === 'weapon' ? '⚔' : '🛡';
}

function affixText(a: Item['affixes'][number]): string {
  const def = affixDef(a.kind);
  const el = a.element ? elementLabel(a.element) : '';
  if (a.kind === 'elementFlat') return `${el}ダメージ追加`;
  if (a.kind === 'resistPct') return `${el}耐性`;
  return def.name;
}

function stars(tier: number): string {
  return '★'.repeat(tier) + '☆'.repeat(Math.max(0, 5 - tier));
}

// ---------------------------------------------------------------- TopBar

export interface TopBarProps {
  title: string;
  back?: string;
  gold?: number;
  tier?: number;
  running?: number;
  meta?: string;
}

/** L1。全画面で同じ位置・同じ順序（§1）。 */
export function topBar(p: TopBarProps): string {
  return `
  <header class="topbar" data-role="topbar">
    ${when(p.back, `<button class="back" data-tap data-role="back" data-act="${esc(p.back ?? '')}">‹</button>`)}
    <h1>${esc(p.title)}</h1>
    <div class="spacer"></div>
    ${when(p.meta, `<span class="pill">${esc(p.meta ?? '')}</span>`)}
    ${when(p.tier && p.tier > 1, `<span class="pill warn">難易度+${(p.tier ?? 1) - 1}</span>`)}
    ${when(p.running, `<span class="pill live">潜行 ${p.running}</span>`)}
    ${when(p.gold !== undefined,
      `<span class="stat gold" data-role="gold"><i class="dot"></i>${num(p.gold ?? 0)}</span>`)}
  </header>`;
}

// ---------------------------------------------------------------- Panel

export function panel(label: string, body: string, cls = ''): string {
  return `
  <section class="panel ${cls}">
    ${when(label, `<header><span class="micro">${esc(label)}</span><i class="hr"></i></header>`)}
    <div class="body">${body}</div>
  </section>`;
}

// ---------------------------------------------------------------- Button

export interface ButtonProps {
  label: string;
  act: string;
  primary?: boolean;
  disabled?: boolean;
  block?: boolean;
  role?: string;
}

export function button(p: ButtonProps): string {
  const cls = ['btn', p.primary ? 'primary' : '', p.block ? 'block' : ''].filter(Boolean).join(' ');
  return `<button class="${cls}" data-tap data-act="${esc(p.act)}"` +
    `${when(p.role, ` data-role="${esc(p.role ?? '')}"`)}` +
    `${p.disabled ? ' disabled' : ''}>${esc(p.label)}</button>`;
}

/** 画面下端の主要動線（親指到達域・§2.0）。 */
export function actionBar(inner: string, hint?: string): string {
  return `
  <footer class="actionbar" data-role="actionbar">
    ${when(hint, `<div class="hint">${esc(hint ?? '')}</div>`)}
    ${inner}
  </footer>`;
}

export function tag(label: string, element: string): string {
  return `<span class="tag ${elementClass(element)}">${esc(label)}</span>`;
}

export function progress(ratio: number, threshold?: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  return `<div class="progress"><i style="width:${(r * 100).toFixed(1)}%"></i>` +
    `${when(threshold, `<u style="left:${((threshold ?? 0) * 100).toFixed(0)}%"></u>`)}</div>`;
}

export function tabs(items: readonly string[], selected: number, act: string): string {
  return `<div class="tabs">${each(items, (label, i) =>
    `<div class="tab ${i === selected ? 'on' : ''}" data-tap data-act="${esc(act)}" data-i="${i}">${esc(label)}</div>`
  )}</div>`;
}

export function figures(cells: ReadonlyArray<[string, string, string?]>): string {
  return `<div class="figs">${each(cells, ([label, value, color]) =>
    `<div class="fig"><div class="micro">${esc(label)}</div>` +
    `<div class="v"${when(color, ` style="color:var(--${color})"`)}>${esc(value)}</div></div>`
  )}</div>`;
}

export function toasts(list: readonly string[]): string {
  if (list.length === 0) return '';
  return `<div class="toasts">${each(list, t =>
    `<div class="toast gold" data-role="toast">${esc(t)}</div>`)}</div>`;
}

// ---------------------------------------------------------------- ItemRow

export interface ItemRowProps {
  item: Item;
  /** 装備中との比較。差を ▲▼ で出す */
  compareTo?: Item | null;
  /** 売値を出す（比較が無いとき） */
  showSell?: boolean;
  selected?: boolean;
  act?: string;
  extra?: string;
}

export function itemRow(p: ItemRowProps): string {
  const it = p.item;
  const sub = it.slot === 'weapon' ? `秒間${itemScore(it)}` : `防御${it.power}`;
  const meta = [RARITY_LABEL[it.rarity], sub, it.affixes.length > 0 ? `効果${it.affixes.length}` : '']
    .filter(Boolean).join(' ・ ');

  let right = '';
  if (p.compareTo) {
    const d = itemScore(it) - itemScore(p.compareTo);
    if (d !== 0) {
      right = `<div class="rr" style="color:var(--${d > 0 ? 'up' : 'down'})">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</div>`;
    }
  } else if (p.showSell) {
    right = `<div class="rr" style="color:var(--faint)">${num(sellValue(it))}G</div>`;
  }

  return `<div class="item ${RARITY_CLASS[it.rarity]} ${p.selected ? 'on' : ''}"` +
    `${when(p.act, ` data-tap data-act="${esc(p.act ?? '')}" data-id="${esc(it.id)}"`)}>` +
    `<div class="ic">${itemIcon(it)}</div>` +
    `<div class="tx"><div class="n">${esc(itemName(it))}${when(it.locked, ' 🔒')}</div>` +
    `<div class="m">${esc(meta)}</div></div>` +
    `${right}${p.extra ?? ''}</div>`;
}

// ---------------------------------------------------------------- EquipCard

export interface StatLine {
  label: string;
  value: string;
  tone?: string;
  delta?: number;
  unit?: string;
}

function statsOf(it: Item, cmp?: Item | null): StatLine[] {
  if (it.slot === 'weapon') {
    return [
      { label: '秒間火力', value: `${itemScore(it)}`, tone: 'atk',
        delta: cmp ? itemScore(it) - itemScore(cmp) : undefined },
      { label: '威力', value: `${it.power}`,
        delta: cmp ? it.power - cmp.power : undefined },
      { label: '速度', value: it.speed.toFixed(2), tone: 'spd',
        delta: cmp ? Math.round((it.speed - cmp.speed) * 100) : undefined },
      { label: '会心', value: `${it.crit.toFixed(1)}%`, tone: 'crit',
        delta: cmp ? Math.round((it.crit - cmp.crit) * 10) / 10 : undefined, unit: '' }
    ];
  }
  return [{
    label: '防御', value: `${it.power}`, tone: 'def',
    delta: cmp ? it.power - cmp.power : undefined
  }];
}

/**
 * 数値の1行。**値と差分は必ず別要素にする。**
 * 同じ要素に押し込むと、桁が増えたときに重なっているかどうかを
 * 表明で確かめられなくなる（U1）。
 */
function statRow(s: StatLine): string {
  const d = s.delta !== undefined && s.delta !== 0
    ? `<b class="d ${s.delta > 0 ? 'up' : 'dn'}">${s.delta > 0 ? '▲' : '▼'}${Math.abs(s.delta)}${s.unit ?? ''}</b>`
    : '';
  return `<div class="row"><span class="l">${esc(s.label)}</span>` +
    `<span class="r"><span class="v"${when(s.tone, ` style="color:var(--${s.tone})"`)}>${esc(s.value)}</span>${d}</span></div>`;
}

export interface EquipCardProps {
  item: Item;
  compareTo?: Item | null;
  label?: string;
  showSell?: boolean;
}

/** 装備カード。順序は §3.3 で固定（画面ごとに入れ替えない）。 */
export function equipCard(p: EquipCardProps): string {
  const it = p.item;
  return `
  ${when(p.label, `<div class="micro" style="margin-bottom:var(--sp-1)">${esc(p.label ?? '')}</div>`)}
  <div class="card ${RARITY_CLASS[it.rarity]}">
    <div class="micro tier">${RARITY_EN[it.rarity]}</div>
    <div class="nm">${esc(itemName(it))}</div>
    <div class="base">${esc(baseDef(it.baseId).name)}</div>
    <div style="margin-top:var(--sp-2)">
      ${each(statsOf(it, p.compareTo), statRow)}
    </div>
    ${when(it.affixes.length > 0, `<div class="fx">${each(it.affixes, a =>
      `<div><span>${esc(affixText(a))}</span><span>${stars(a.tier)}</span></div>`)}</div>`)}
    ${when(it.unique, (() => {
      const u = it.unique ? uniqueDef(it.unique) : null;
      return u ? `<div class="uq"><b>《${esc(u.name)}》</b><span>${esc(u.text)}</span></div>` : '';
    })())}
    ${when(p.showSell, `<div class="row" style="margin-top:var(--sp-2)">` +
      `<span class="l">売却</span><span class="r"><span class="v" style="color:var(--gold)">${num(sellValue(it))}G</span></span></div>`)}
  </div>`;
}

/** 装備比較（§2.4）。「差し引きどちらが強いか」を必ず1行で言い切る。 */
export function compareView(current: Item | null, next: Item): string {
  if (!current) {
    return `<div>${equipCard({ item: next, label: '新しい品' })}</div>`;
  }
  const diff = itemScore(next) - itemScore(current);
  const verdict = diff > 0 ? `この候補のほうが ${diff} 強い`
    : diff < 0 ? `装備中のほうが ${-diff} 強い`
    : '素の強さは互角。効果で選ぶ';
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'dim';
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
    <div>${equipCard({ item: current, label: 'Current' })}</div>
    <div>${equipCard({ item: next, compareTo: current, label: 'Candidate' })}</div>
  </div>
  <div class="verdict" data-role="verdict"
       style="border-color:color-mix(in srgb, var(--${tone}) 35%, transparent);
              background:color-mix(in srgb, var(--${tone}) 10%, transparent);
              color:var(--${tone})">${esc(verdict)}</div>`;
}
