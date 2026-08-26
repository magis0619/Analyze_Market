import type { ModelRarity, ModelElement, ModelSpec } from '../../world/models';
import type { Nav, Screen } from '../shell';
import { BASE_TYPES, baseDef } from '../../data/bases';
import { actionBar, button, panel, tabs, topBar } from '../components';
import { esc } from '../dom';

// 装備モデルの見本帳（開発用）。`?models=1` でだけ出る。
//
// 9ベース × 4レアリティ × 5属性 = 180通りある。ゲームを遊んで全部に
// 行き当たるのを待っていては、形の作り込みが進まない。
// **これは3Dモデルの下見であって、遊びの画面ではない**——
// 遊びの画面に近道を作らない、という約束（UI-SPEC §8.2）とは別のもの。
// ここで確かめられるのは形と色だけで、ゲームの状態には一切触らない。

const RARITIES: readonly ModelRarity[] = ['common', 'fine', 'rare', 'relic'];
const RARITY_LABEL = ['並', '上質', '稀少', '遺物'];
const ELEMENTS: readonly ModelElement[] = ['physical', 'fire', 'lightning', 'poison', 'ice'];
const ELEMENT_LABEL = ['物理', '炎', '雷', '毒', '氷'];

export function modelbookScreen(nav: Nav): Screen {
  let base = 0;
  let rar = 3;
  let elem = 0;

  const bases = BASE_TYPES;

  function spec(): ModelSpec {
    const b = bases[base] ?? bases[0];
    return {
      baseId: b?.id ?? 'sword',
      rarity: RARITIES[rar] ?? 'common',
      element: bases[base]?.slot === 'armor' ? 'physical' : (ELEMENTS[elem] ?? 'physical')
    };
  }

  return {
    scene: 'pedestal',
    get model(): ModelSpec { return spec(); },

    render() {
      const b = bases[base];
      return `
${topBar({ title: 'モデル見本帳', back: 'back', meta: '開発用' })}
<div class="stack anchor-bottom">
  ${panel('ベース', `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-1)">
      ${bases.map((x, i) =>
        `<div class="tab ${i === base ? 'on' : ''}" data-tap data-act="base" data-i="${i}">${esc(x.name)}</div>`
      ).join('')}
    </div>`)}
  ${panel('レアリティ', tabs(RARITY_LABEL, rar, 'rar'))}
  ${panel('属性', tabs(ELEMENT_LABEL, elem, 'elem'))}
</div>
${actionBar(button({
        label: `${esc(b ? baseDef(b.id).name : '')} ・ ${RARITY_LABEL[rar]} ・ ${
          b?.slot === 'armor' ? '属性なし' : ELEMENT_LABEL[elem]}`,
        act: 'next', tier: 'secondary', block: true, role: 'cta'
      }), '押すと次のレアリティへ')}`;
    },

    act(action, el) {
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'base': base = Number(el.dataset.i ?? 0); return;
        case 'rar': rar = Number(el.dataset.i ?? 0); return;
        case 'elem': elem = Number(el.dataset.i ?? 0); return;
        case 'next': rar = (rar + 1) % RARITIES.length; return;
      }
    }
  };
}
