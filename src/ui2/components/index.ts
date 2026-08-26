import type { Item, Rarity, StageDef } from '../../sim/types';
import type { ModelSpec } from '../../world/models';
import { thumbFor } from '../../world/thumbs';
import { baseDef } from '../../data/bases';
import { affixDef } from '../../data/affixes';
import { uniqueDef } from '../../data/uniques';
import { dominantElement, sellValue } from '../../sim/items';
import { affinityKind, affinityText, effectiveScore } from '../affinity';
export { affinityKind, effectiveScore } from '../affinity';
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

/**
 * 一覧の左に置く1文字（§3.5）。
 *
 * 以前は ⚔ / 🛡 の絵文字だったが、環境によっては細い×印に潰れて
 * どの行も同じ見た目になっていた。**属性は戦績を左右する情報**（耐性・弱点）なのに
 * 「炎の短剣」のように名前へ出るのは非物理のときだけなので、ここで必ず見せる。
 */
export function itemIcon(it: Item): string {
  if (it.slot !== 'weapon') return '盾';
  return ELEM_LABEL[dominantElement(it.element)]?.slice(0, 1) ?? '物';
}

/** itemIcon の色分けに使うクラス。 */
export function itemIconClass(it: Item): string {
  return it.slot === 'weapon' ? elementClass(dominantElement(it.element)) : 'def';
}

/** その品の3Dモデル仕様。一覧のサムネと台座で同じものを指す。 */
export function itemModelSpec(it: Item): ModelSpec {
  return {
    baseId: it.baseId, rarity: it.rarity,
    element: it.slot === 'weapon' ? dominantElement(it.element) : 'physical'
  };
}

/**
 * 一覧の左に置く枠（§1 所有実感）。
 *
 * モデルのサムネが焼けていればそれを、まだなら属性の1文字を出す。
 * **待たない。** 焼き上がるまで行を出さないと、200件の一覧が
 * 一瞬空白になる。少し遅れて良くなるほうがよい。
 */
export function itemThumb(it: Item): string {
  const url = thumbFor(itemModelSpec(it));
  const cls = `${RARITY_CLASS[it.rarity]} ${itemIconClass(it)}`;
  if (url) return `<div class="ic ${cls} shot"><img src="${url}" alt=""></div>`;
  return `<div class="ic ${cls}">${itemIcon(it)}</div>`;
}

export function affixText(a: Item['affixes'][number]): string {
  const def = affixDef(a.kind);
  const el = a.element ? elementLabel(a.element) : '';
  if (a.kind === 'elementFlat') return `${el}ダメージ追加`;
  if (a.kind === 'resistPct') return `${el}耐性`;
  // データ側の名前は '防御'。素の防御値の行と同じ語になり、
  // 同じ数字を二度出しているように見えるので、表示だけ言い分ける
  if (a.kind === 'defensePct') return '防御強化';
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

/**
 * ボタンの段（§3.3）。
 *
 *   primary   … いま押すべきもの。1画面にたかだか1つ、必ず ActionBar に置く
 *   secondary … 同じ場面で選べる別の道
 *   quiet     … 戻る・閉じる・やめる
 *   danger    … 取り消せない操作。**確認の中以外では primary にしない**
 */
export type ButtonTier = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  act: string;
  tier?: ButtonTier;
  disabled?: boolean;
  block?: boolean;
  role?: string;
  /** 未処理の件数。段は上げず、件数だけを言う（§3.3 規則4） */
  badge?: number;
}

export function button(p: ButtonProps): string {
  const tier = p.tier ?? 'secondary';
  const cls = ['btn', tier, p.block ? 'block' : ''].filter(Boolean).join(' ');
  // 段を検証できるように属性へ出す。見た目のクラスだけだと、
  // 「primary が2つある」を表明で確かめられない（§7.1 U13）
  return `<button class="${cls}" data-tap data-tier="${tier}" data-act="${esc(p.act)}"` +
    `${when(p.role, ` data-role="${esc(p.role ?? '')}"`)}` +
    `${p.disabled ? ' disabled' : ''}>${esc(p.label)}` +
    `${when(p.badge, `<span class="badge">${p.badge}</span>`)}</button>`;
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

export interface ProgressMark {
  at: number;
  kind: string;
  /** 通過済みか。まだなら印を出さない（先の出来事は伏せる） */
  passed: boolean;
}

export function progress(
  ratio: number, threshold?: number, marks: readonly ProgressMark[] = []
): string {
  const r = Math.max(0, Math.min(1, ratio));
  return `<div class="progress"><i style="width:${(r * 100).toFixed(1)}%"></i>` +
    `${when(threshold, `<u style="left:${((threshold ?? 0) * 100).toFixed(0)}%"></u>`)}` +
    each(marks.filter(m => m.passed), m =>
      `<b class="mk mk-${esc(m.kind)}" style="left:${(m.at * 100).toFixed(1)}%"></b>`) +
    `</div>`;
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

/** 一度に見せる通知の上限。積み上がると帯が画面を食う（§5） */
const TOAST_MAX = 2;

export function toasts(list: readonly string[]): string {
  if (list.length === 0) return '';
  // 出したぶんを全部並べると、派遣中に4件・5件と伸びて
  // 一覧を押し出していた。新しいものだけ残す
  const shown = list.slice(-TOAST_MAX);
  return `<div class="toasts">${each(shown, t =>
    `<div class="toast gold" data-role="toast">${esc(t)}</div>`)}</div>`;
}

// ---------------------------------------------------------------- ItemRow

export interface ItemRowProps {
  item: Item;
  /** 装備中との比較。差を ▲▼ で出す */
  compareTo?: Item | null;
  /**
   * 派遣先。渡すと、素の強さではなく**その派遣先での実効値**で語る。
   * 属性が3倍の開きを生むのに素の数字しか出していなかったので、
   * 「一番大きい数字を装備する」以外の選択が生まれなかった（指示書 §2）。
   */
  stage?: StageDef | null;
  /** 売値を出す（比較が無いとき） */
  showSell?: boolean;
  selected?: boolean;
  act?: string;
  extra?: string;
}

export function itemRow(p: ItemRowProps): string {
  const it = p.item;
  const score = p.stage ? effectiveScore(it, p.stage) : itemScore(it);
  const sub = it.slot === 'weapon' ? `秒間${score}` : `防御${score}`;
  const kind = p.stage ? affinityKind(it, p.stage) : null;
  const meta = [
    RARITY_LABEL[it.rarity], sub,
    p.stage && kind !== 'even' ? affinityText(it, p.stage) : '',
    it.affixes.length > 0 ? `効果${it.affixes.length}` : ''
  ].filter(Boolean).join(' ・ ');

  let right = '';
  if (p.compareTo) {
    const base = p.stage ? effectiveScore(p.compareTo, p.stage) : itemScore(p.compareTo);
    const d = score - base;
    if (d !== 0) {
      right = `<div class="rr" style="color:var(--${d > 0 ? 'up' : 'down'})">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</div>`;
    }
  } else if (p.showSell) {
    right = `<div class="rr" style="color:var(--faint)">${num(sellValue(it))}G</div>`;
  }

  return `<div class="item ${RARITY_CLASS[it.rarity]} ${p.selected ? 'on' : ''}"` +
    `${when(p.act, ` data-tap data-act="${esc(p.act ?? '')}" data-id="${esc(it.id)}"`)}>` +
    itemThumb(it) +
    `<div class="tx"><div class="n">${esc(itemName(it))}${when(it.locked, ' 🔒')}</div>` +
    `<div class="m${when(kind && kind !== 'even', ` aff-${kind}`)}">${esc(meta)}</div></div>` +
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
      // 値と同じ桁で出す。100倍した整数（1.26→1.14 で「12」）を並べると、
      // 何の12なのか読み手には分からない
      { label: '速度', value: it.speed.toFixed(2), tone: 'spd',
        delta: cmp ? Math.round((it.speed - cmp.speed) * 100) / 100 : undefined },
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
  /** 派遣先。渡すと先頭に「対〈ステージ〉」の実効値が入る */
  stage?: StageDef | null;
}

/** 装備カード。順序は §3.3 で固定（画面ごとに入れ替えない）。 */
export function equipCard(p: EquipCardProps): string {
  const it = p.item;
  // 等倍なら「対〈ステージ〉」は素の値と同じ数字になる。
  // 同じ数字を2行並べても情報は増えず、目が滑るだけなので出さない
  const same = p.stage ? affinityKind(it, p.stage) === 'even' : true;
  const eff = p.stage && !same ? effectiveScore(it, p.stage) : null;
  const effCmp = p.stage && !same && p.compareTo ? effectiveScore(p.compareTo, p.stage) : null;
  return `
  ${when(p.label, `<div class="micro" style="margin-bottom:var(--sp-1)">${esc(p.label ?? '')}</div>`)}
  <div class="card ${RARITY_CLASS[it.rarity]}">
    <div class="micro tier">${RARITY_EN[it.rarity]}</div>
    <div class="nm">${esc(itemName(it))}</div>
    ${when(itemName(it) !== baseDef(it.baseId).name,
      `<div class="base">${esc(baseDef(it.baseId).name)}</div>`)}
    <div style="margin-top:var(--sp-2)">
      ${when(eff !== null, statRow({
        label: p.stage ? `対 ${p.stage.name}` : '',
        value: `${eff}`, tone: it.slot === 'weapon' ? 'atk' : 'def',
        delta: effCmp !== null ? (eff ?? 0) - effCmp : undefined
      }))}
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
export interface CompareProps {
  stage?: StageDef | null;
  /**
   * 実測の言い切り（例「実測で 2 階層ぶん深く潜れる」）。
   *
   * 解析値は「どれを見るか」を決めるためのもので、
   * 「どれを選ぶか」はシミュレーションで決める。渡さなければ解析値だけで語る。
   */
  measured?: string | null;
}

export function compareView(current: Item | null, next: Item, p: CompareProps = {}): string {
  if (!current) {
    return `<div>${equipCard({ item: next, label: '新しい品' })}</div>`;
  }
  const st = p.stage ?? null;
  // 派遣先が分かっているなら、素の強さではなく**そこでの実効値**で言い切る。
  // 素の数字だけを見せていたので、耐性で半減する武器が「一番強い」と表示され、
  // プレイヤーが騙されていた
  const cur = st ? effectiveScore(current, st) : itemScore(current);
  const cand = st ? effectiveScore(next, st) : itemScore(next);
  const diff = cand - cur;
  const where = st ? `${st.name}では` : '';
  const verdict = diff > 0 ? `${where}この候補のほうが ${diff} 強い`
    : diff < 0 ? `${where}装備中のほうが ${-diff} 強い`
    : `${where}互角。効果で選ぶ`;
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'dim';
  const kind = st ? affinityKind(next, st) : null;
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
    <div>${equipCard({ item: current, label: 'Current', stage: st })}</div>
    <div>${equipCard({ item: next, compareTo: current, label: 'Candidate', stage: st })}</div>
  </div>
  <div class="verdict" data-role="verdict"
       style="border-color:color-mix(in srgb, var(--${tone}) 35%, transparent);
              background:color-mix(in srgb, var(--${tone}) 10%, transparent);
              color:var(--${tone})">${esc(verdict)}</div>
  ${when(st && kind !== 'even', `<div class="aff-note aff-${kind}">${
    esc(st ? affinityText(next, st) : '')}${when(st?.weakTo,
      ` ・ ${esc(st?.name ?? '')}の弱点は${elementLabel(st?.weakTo ?? '')}`)}</div>`)}
  ${when(p.measured, `<div class="measured" data-role="measured">${esc(p.measured ?? '')}</div>`)}`;
}
