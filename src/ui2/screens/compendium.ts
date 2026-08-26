import type { Rarity } from '../../sim/types';
import type { Nav, Screen } from '../shell';
import { BASE_TYPES, baseDef } from '../../data/bases';
import { UNIQUES, uniqueDef } from '../../data/uniques';
import { stageDef } from '../../data/stages';
import { RARITY_CLASS, RARITY_LABEL, actionBar, button, panel, tabs, topBar } from '../components';
import { each, esc, num, when } from '../dom';

// 図鑑（docs/UI-SPEC.md §2.8 ＋ カード脱却指示書 §5）。
//
// この画面は**進捗の残高**であって、操作の場ではない。
// 「まだ見ていないものがある」ことだけを見せて、拠点へ返す。
//
// **本にする**（§5）。中身は2ページしかないので three.js は要らない。
// CSS の 3D 変形（perspective + rotateY）で、新しいページが
// 前のページの上に倒れ込む。前のページを裏に残したまま重ねるのが肝で、
// 出ていくページを消してから入れると、ただのフェードにしか見えない。
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

/** ページがめくれている時間。長いと待たされ、短いと本に見えない */
const FLIP_SEC = 0.42;

export function compendiumScreen(nav: Nav): Screen {
  const st = nav.state;
  let tab = 0;
  let picked: string | null = null;
  /** めくり中の残り秒。0 なら止まっている */
  let flipT = 0;
  /** めくる前のページ。裏に残して、その上に新しいページを倒す */
  let prevTab = 0;
  /** 1 なら進む（右から倒れる）、-1 なら戻る */
  let flipDir: 1 | -1 = 1;

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
${actionBar(button({ label: '閉じる', act: 'close', tier: 'quiet', block: true, role: 'cta' }))}`;
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
${actionBar(button({ label: '閉じる', act: 'close', tier: 'quiet', block: true, role: 'cta' }))}`;
  }

  return {
    scene: 'vault',

    render() {
      if (picked !== null) return detail();

      const baseFound = BASE_TYPES.filter(b => rowsOf(b.id).length > 0).length;
      const uqFound = UNIQUES.filter(u => st.data.compendium[`unique:${u.kind}`]).length;
      const found = tab === 0 ? baseFound : uqFound;
      const all = tab === 0 ? BASE_TYPES.length : UNIQUES.length;

      const page = (i: number): string => i === 0 ? baseGrid() : uniqueGrid();
      const title = (i: number): string => i === 0 ? '基礎装備' : 'ユニーク効果';

      return `
${topBar({ title: '図鑑', back: 'back', gold: st.data.gold, meta: `${found} / ${all}` })}
<div class="stack">
  ${panel('', tabs(['装備', 'ユニーク効果'], tab, 'tab'))}
  ${panel(title(tab), `<div class="book">
    ${when(flipT > 0, `<div class="page under">${page(prevTab)}</div>`)}
    <div class="page ${flipT > 0 ? `turn ${flipDir < 0 ? 'back' : ''}` : ''}">${page(tab)}</div>
  </div>`)}
  <div class="pagefoot">
    ${button({ label: '‹ 前のページ', act: 'flip', tier: 'quiet', disabled: tab === 0 })
      .replace('data-act="flip"', 'data-act="flip" data-d="-1"')}
    <span class="c">${tab + 1} / 2</span>
    ${button({ label: '次のページ ›', act: 'flip', tier: 'quiet', disabled: tab === 1 })
      .replace('data-act="flip"', 'data-act="flip" data-d="1"')}
  </div>
  <div style="font-size:var(--fs-label);color:var(--faint);text-align:center;line-height:1.6">
    ${found === all
        ? 'すべて記録した'
        : `残り${all - found}種。深いステージほど出やすい`}
  </div>
</div>
${actionBar(button({ label: '拠点へ戻る', act: 'back', tier: 'quiet', block: true, role: 'cta' }))}`;
    },

    act(action, el) {
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'tab': turnTo(Number(el.dataset.i ?? 0)); return;
        case 'flip': turnTo(tab + (Number(el.dataset.d ?? 1) > 0 ? 1 : -1)); return;
        case 'pick': picked = el.dataset.id ?? null; return;
        case 'close': picked = null; return;
      }
    },

    tick(dt) {
      if (flipT <= 0) return false;
      flipT -= dt;
      // めくり終わったときだけ描き直す。途中で描き直すと
      // アニメーションが頭から再生され、ページが何度も倒れてくる
      if (flipT <= 0) { flipT = 0; return true; }
      return false;
    }
  };

  /** ページを移る。同じページなら何もしない（無駄なめくりを起こさない） */
  function turnTo(next: number): void {
    const n = Math.max(0, Math.min(1, next));
    if (n === tab) return;
    prevTab = tab;
    flipDir = n > tab ? 1 : -1;
    tab = n;
    flipT = FLIP_SEC;
  }
}
