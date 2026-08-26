import type { Nav, Screen } from '../shell';
import type { Mood } from '../../world/scenes';
import { HERBS, POTIONS, herbDef } from '../../data/garden';
import { actionBar, button, panel, toasts, topBar } from '../components';
import { each, esc, when } from '../dom';

// 錬金工房（新機能指示書「錬金工房画面」＋ 改善 §7）。
//
// **工程を操作させない。** 参考にした作品はすり潰す・煮る・かき混ぜるを
// 手で行わせるが、この作品の芯は「決めるのは3つだけ」なので、
// 借りるのは絵作りだけにする。プレイヤーがすることは「どれを作るか」の1択。
//
// レシピは伏せない。組み合わせを当てさせる遊びは、
// 材料が5種しかない今の規模では総当たりで終わってしまい、
// 「発見」ではなく「作業」になる。作れるもの・足りないものを最初から見せて、
// **何を育てればよいか**が分かる画面にするほうが、畑へ戻る理由になる。
//
// 並べ方は装備選択の台座と同じ形にする（§7）。5行の縦長の一覧では
// 大鍋がカードに隠れて、色が変わる主役が見えなかった。
// 升目を下に置き、押したものの内訳だけを鍋の上へ浮かせる。

const BREW_SEC = 1.6;

export function alchemyScreen(nav: Nav): Screen {
  let selected: string | null = null;
  /** 調合中の残り秒。0 なら止まっている */
  let brewT = 0;
  let brewed: string | null = null;
  const notices: string[] = [];
  let noticeT = 0;

  function have(herbId: string): number {
    return nav.state.data.garden.herbs[herbId] ?? 0;
  }

  /** その薬にあと何が足りないか。無ければ空文字。 */
  function missing(potionId: string): string {
    const p = POTIONS.find(x => x.id === potionId);
    if (!p) return '';
    const main = herbDef(p.main);
    const shortMain = Math.max(0, 2 - have(p.main));
    let others = 0;
    for (const h of HERBS) {
      if (h.id === p.main) continue;
      others += have(h.id);
    }
    const shortOther = Math.max(0, p.other - others);
    const parts: string[] = [];
    if (shortMain > 0) parts.push(`${main.name} あと${shortMain}`);
    if (shortOther > 0) parts.push(`他の薬草 あと${shortOther}`);
    return parts.join(' ・ ');
  }

  /** 主材料以外に使える薬草の合計 */
  function otherStock(mainId: string): number {
    let n = 0;
    for (const h of HERBS) if (h.id !== mainId) n += have(h.id);
    return n;
  }

  return {
    scene: 'alchemy',

    /** 選んでいる薬の色を大鍋に流す。調合中は強くする */
    get mood(): Mood {
      const p = POTIONS.find(x => x.id === (brewed ?? selected));
      return {
        accent: p ? ELEMENT_LIGHT[p.element] ?? 0x9be08a : 0x6f7f9e,
        intensity: brewT > 0 ? 1 : (selected ? 0.55 : 0.15)
      };
    },

    render() {
      const st = nav.state;
      const g = st.data.garden;
      const sel = POTIONS.find(p => p.id === selected) ?? null;
      const stock = HERBS.filter(h => have(h.id) > 0);

      // 押した薬の内訳は**鍋の上に浮かせる**。板として下に積むと、
      // 選ぶたびに画面が伸びて、鍋の色（今どれを作ろうとしているか）が消える
      const popup = sel === null ? '' : `
<div class="cauldron-pop">
  <div class="nm">${esc(sel.name)}</div>
  <div class="row"><span class="l">${esc(herbDef(sel.main).name)}</span>
    <span class="r"><span class="v ${have(sel.main) >= 2 ? '' : 'short'}">${have(sel.main)} / 2</span></span></div>
  <div class="row"><span class="l">他の薬草（何でもよい）</span>
    <span class="r"><span class="v ${otherStock(sel.main) >= sel.other ? '' : 'short'}">${otherStock(sel.main)} / ${sel.other}</span></span></div>
  <div class="eff">${esc(sel.text)}</div>
</div>`;

      return `
${topBar({ title: '錬金工房', back: 'back', gold: st.data.gold })}
${popup}
<div class="stack hero anchor-bottom">
  ${panel('手持ちの薬草', stock.length > 0
        ? `<div class="chips">${each(stock, h =>
            `<span class="chip ${h.element}">${esc(h.glyph)} ${esc(h.name)} ${have(h.id)}</span>`)}</div>`
        : '<div class="empty">薬草園で育てて収穫する</div>')}

  ${panel('作れる薬', `<div class="hgrid">${each(POTIONS, p => {
        const ok = st.canBrew(p.id);
        const held = g.potions[p.id] ?? 0;
        return `<button class="hcell ${p.element} ${selected === p.id ? 'on' : ''} ${ok ? '' : 'off'}"
                        data-tap data-act="sel" data-id="${p.id}">
          <span class="g">薬</span>
          <span class="n">${esc(p.name)}</span>
          <span class="b">${ok ? '作れる' : '材料不足'}</span>
          ${when(held > 0, `<span class="q">${held}</span>`)}
        </button>`;
      })}</div>${when(sel !== null && !st.canBrew(sel?.id ?? ''),
        `<div class="hintline">${esc(missing(sel?.id ?? ''))}</div>`)}`)}
</div>
${actionBar(brewT > 0
        ? button({ label: '調合している…', act: 'noop', tier: 'quiet', block: true, role: 'cta', disabled: true })
        : button({
            label: sel ? `${sel.name}を作る` : '作る薬を選ぶ',
            act: 'brew', tier: 'primary', block: true, role: 'cta',
            disabled: !sel || !st.canBrew(sel.id)
          }))}
${toasts(notices)}`;
    },

    act(action, el) {
      const st = nav.state;
      switch (action) {
        case 'back': nav.goGarden(); return;
        case 'sel': selected = el.dataset.id ?? null; return;
        case 'brew': {
          if (!selected || brewT > 0 || !st.canBrew(selected)) return;
          // 先に材料を消費して、演出の間に二度押しできないようにする
          if (!st.brew(selected)) return;
          brewed = selected;
          brewT = BREW_SEC;
          return;
        }
      }
    },

    tick(dt) {
      if (brewT > 0) {
        brewT -= dt;
        if (brewT <= 0) {
          brewT = 0;
          const p = POTIONS.find(x => x.id === brewed);
          if (p) {
            notices.push(`《${p.name}》ができた`);
            while (notices.length > 2) notices.shift();
            noticeT = 2.8;
          }
          brewed = null;
        }
        return true;
      }
      if (noticeT > 0) {
        noticeT -= dt;
        if (noticeT <= 0) { notices.length = 0; return true; }
      }
      return false;
    }
  };
}

/** 属性ごとの光。他画面（入口・展示台）と同じ対応を使う */
const ELEMENT_LIGHT: Record<string, number> = {
  physical: 0x9fb0d0, fire: 0xff8348, ice: 0x6fc7ff,
  lightning: 0xe9be74, poison: 0x7ddc8a
};
