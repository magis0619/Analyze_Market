import type { Rarity } from '../../sim/types';
import type { Nav, Screen } from '../shell';
import { BASE_TYPES, baseDef } from '../../data/bases';
import { UNIQUES, uniqueDef } from '../../data/uniques';
import { stageDef } from '../../data/stages';
import { RARITY_CLASS, RARITY_LABEL, actionBar, button, panel, tabs, topBar } from '../components';
import { each, esc, num } from '../dom';

// 図鑑（docs/UI-SPEC.md §2.8）。
//
// この画面は**進捗の残高**であって、操作の場ではない。
// 「まだ見ていないものがある」ことだけを見せて、拠点へ返す。
//
// 記録は state 側が openAll() で積んでいる（`baseId|rarity` と `unique:kind`）。
// ここは読むだけで、状態を書き換えない。

const RARS: readonly Rarity[] = ['common', 'fine', 'rare', 'relic'];

/**
 * 基礎装備のタグ。データ側は 'fast' のような内部名なので、そのまま出さない。
 * 図鑑は読み物なので、何が違うのかが分かる言い方にする。
 */
const TAG_TEXT: Record<string, string> = {
  fast: '手数が多い', slow: '一撃が重い', balanced: '癖がない',
  crit: '会心が出やすい', heavy: '威力が高い', reach: '間合いが長い',
  ranged: '遠くから狙う', caster: '属性を乗せやすい', elemental: '属性寄り',
  physical: '物理寄り', light: '軽い・避けやすい', medium: '中庸',
  evasive: '回避に寄る', sturdy: '硬い'
};

/** 発見済みのうち最も高いレアリティ。枠の色に使う（§2.8）。 */
function topRarity(found: Rarity[]): Rarity | null {
  for (let i = RARS.length - 1; i >= 0; i--) {
    const r = RARS[i];
    if (r && found.includes(r)) return r;
  }
  return null;
}

export function compendiumScreen(nav: Nav): Screen {
  const st = nav.state;
  let tab = 0;
  let picked: string | null = null;

  interface BaseRow { rarity: Rarity; count: number; firstStage: number }

  /** ある基礎装備について、見つけたレアリティの内訳。 */
  function rowsOf(baseId: string): BaseRow[] {
    const out: BaseRow[] = [];
    for (const r of RARS) {
      const e = st.data.compendium[`${baseId}|${r}`];
      if (e) out.push({ rarity: r, count: e.count, firstStage: e.firstStage });
    }
    return out;
  }

  function baseGrid(): string {
    return `<div class="grid">${each(BASE_TYPES, b => {
      const rows = rowsOf(b.id);
      const top = topRarity(rows.map(r => r.rarity));
      return `<div class="cell ${top ? `found ${RARITY_CLASS[top]}` : 'miss'}"
                   data-tap data-act="pick" data-id="base:${esc(b.id)}">${
        top ? esc(b.name) : '？'}</div>`;
    })}</div>`;
  }

  function uniqueGrid(): string {
    // ユニーク名は「強欲の器」のように4文字前後。6列だと枠から溢れる
    return `<div class="grid wide">${each(UNIQUES, u => {
      const e = st.data.compendium[`unique:${u.kind}`];
      return `<div class="cell ${e ? 'found relic' : 'miss'}"
                   data-tap data-act="pick" data-id="uq:${esc(u.kind)}">${
        e ? esc(u.name) : '？'}</div>`;
    })}</div>`;
  }

  /** 明細。未発見のものは「どこで出るか」だけ言って、中身は伏せる。 */
  function detail(): string {
    if (picked === null) return '';
    if (picked.startsWith('base:')) {
      const b = baseDef(picked.slice(5));
      const rows = rowsOf(b.id);
      const total = rows.reduce((s, r) => s + r.count, 0);
      const first = rows.length > 0 ? Math.min(...rows.map(r => r.firstStage)) : 0;
      return `
${topBar({ title: b.name, back: 'close', gold: st.data.gold,
        meta: b.slot === 'weapon' ? '武器' : '防具' })}
<div class="sheet-back" data-act="close"></div>
<div class="sheet">
  <div class="sheet-compare">
    ${panel('', rows.length === 0
        ? '<div class="empty">まだ手にしていない</div>'
        : `<div class="row"><span class="l">初めて拾った場所</span>
             <span class="r"><span class="v">${esc(stageDef(first).name)}</span></span></div>
           <div class="row"><span class="l">これまでの入手</span>
             <span class="r"><span class="v">${num(total)}</span></span></div>
           <i class="hr" style="display:block;height:1px;background:var(--line);margin:var(--sp-3) 0"></i>
           ${each(rows, r => `<div class="row">
             <span class="l" style="color:var(--r-${r.rarity})">${esc(RARITY_LABEL[r.rarity])}</span>
             <span class="r"><span class="v">${num(r.count)}</span></span></div>`)}`)}
    ${panel('特徴', `<div style="font-size:var(--fs-label);color:var(--dim);line-height:1.6">
      ${esc(b.tags.map(t => TAG_TEXT[t] ?? t).join(' ・ '))}
    </div>`)}
  </div>
</div>
${actionBar(button({ label: '閉じる', act: 'close', block: true, role: 'cta' }))}`;
    }

    const u = uniqueDef(picked.slice(3) as Parameters<typeof uniqueDef>[0]);
    const e = st.data.compendium[`unique:${u.kind}`];
    return `
${topBar({ title: e ? u.name : '未発見', back: 'close', gold: st.data.gold,
      meta: u.slot === 'weapon' ? '武器' : '防具' })}
<div class="sheet-back" data-act="close"></div>
<div class="sheet">
  <div class="sheet-compare">
    ${panel('', e
      ? `<div class="uq"><b>《${esc(u.name)}》</b><span>${esc(u.text)}</span></div>
         <div class="row" style="margin-top:var(--sp-3)"><span class="l">初めて拾った場所</span>
           <span class="r"><span class="v">${esc(stageDef(e.firstStage).name)}</span></span></div>
         <div class="row"><span class="l">これまでの入手</span>
           <span class="r"><span class="v">${num(e.count)}</span></span></div>`
      : '<div class="empty">まだ手にしていない</div>')}
  </div>
</div>
${actionBar(button({ label: '閉じる', act: 'close', block: true, role: 'cta' }))}`;
  }

  return {
    scene: 'vault',

    render() {
      if (picked !== null) return detail();

      const baseFound = BASE_TYPES.filter(b => rowsOf(b.id).length > 0).length;
      const uqFound = UNIQUES.filter(u => st.data.compendium[`unique:${u.kind}`]).length;
      const found = tab === 0 ? baseFound : uqFound;
      const all = tab === 0 ? BASE_TYPES.length : UNIQUES.length;

      return `
${topBar({ title: '図鑑', back: 'back', gold: st.data.gold, meta: `${found} / ${all}` })}
<div class="stack">
  ${panel('', tabs(['装備', 'ユニーク効果'], tab, 'tab'))}
  ${panel(tab === 0 ? '基礎装備' : 'ユニーク効果', tab === 0 ? baseGrid() : uniqueGrid())}
  <div style="font-size:var(--fs-label);color:var(--faint);text-align:center;line-height:1.6">
    ${found === all
        ? 'すべて記録した'
        : `残り${all - found}種。深いステージほど出やすい`}
  </div>
</div>
${actionBar(button({ label: '拠点へ戻る', act: 'back', primary: true, block: true, role: 'cta' }))}`;
    },

    act(action, el) {
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'tab': tab = Number(el.dataset.i ?? 0); return;
        case 'pick': picked = el.dataset.id ?? null; return;
        case 'close': picked = null; return;
      }
    }
  };
}
