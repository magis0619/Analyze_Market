import type { Nav, Screen } from '../shell';
import type { Mood } from '../../world/scenes';
import { HERBS, POTIONS, herbDef, potionDef } from '../../data/garden';
import { actionBar, button, panel, ring, toasts, topBar } from '../components';
import { coarseDuration, duration, each, esc, num, when } from '../dom';

// 薬草園（新機能指示書「薬草園画面」）。
//
// **反復作業を作らない。** 水やりも間引きも無い。植えたら放っておけば育ち、
// 育ったものは腐らない。プレイヤーがすることは「植える」と「収穫する」だけ。
//
// 進捗は既存のリング（UI-SPEC §3 / 円グラフ）を流用する。
// 新しい見せ方を足すより、既に読み方を覚えたものを使い回すほうが速く伝わる。

type Tab = 0 | 1;

export function gardenScreen(nav: Nav): Screen {
  let tab: Tab = 0;
  /** 植え付け先を選んでいる枠。null なら選んでいない */
  let planting: number | null = null;
  const notices: string[] = [];
  let noticeT = 0;
  /** 前に描いたときの畑の見た目。変わらなければ描き直さない */
  let lastSig = '';

  function notify(text: string): void {
    notices.push(text);
    while (notices.length > 2) notices.shift();
    noticeT = 2.6;
  }

  function seedCount(): number {
    return Object.values(nav.state.data.garden.seeds).reduce((a, b) => a + b, 0);
  }

  /** 畑1枠。空き・育成中・収穫可の3状態しかない。 */
  function bed(i: number): string {
    const st = nav.state;
    const p = st.plotProgress(i);
    if (!p) {
      return `<button class="bed empty" data-tap data-act="pick-bed" data-i="${i}">
        <span class="micro">空き</span>
        <span class="plant">植える</span>
      </button>`;
    }
    const done = p.ratio >= 1;
    return `<div class="bed ${done ? 'ready' : ''}">
      ${ring({
        label: p.herb.name, value: p.ratio, max: 1,
        text: done ? '収穫' : coarseDuration(p.remainingSec),
        tone: done ? 'up' : 'spd'
      })}
      ${when(done, `${button({
        label: `収穫 +${p.herb.yield}`, act: 'harvest', tier: 'secondary', block: true
      })}`.replace('data-act="harvest"', `data-act="harvest" data-i="${i}"`))}
    </div>`;
  }

  /** 植える薬草を選ぶシート。 */
  function plantSheet(): string {
    const st = nav.state;
    return `
${topBar({ title: '何を植えるか', back: 'cancel', gold: st.data.gold })}
<div class="sheet-back" data-act="cancel"></div>
<div class="sheet">
  <div class="sheet-list">
    ${each(HERBS, h => {
      const have = st.data.garden.seeds[h.id] ?? 0;
      return `<button class="item ${have > 0 ? '' : 'off'}" ${have > 0
        ? `data-tap data-act="plant" data-id="${h.id}"` : 'disabled'}>
        <div class="ic ${h.element}">${esc(h.glyph)}</div>
        <div class="tx">
          <div class="n">${esc(h.name)}</div>
          <div class="m">${esc(duration(h.growSec))}で ${h.yield}個 ・ 種 ${have}</div>
        </div>
        ${when(have === 0, '<div class="rr" style="color:var(--faint)">種が無い</div>')}
      </button>`;
    })}
  </div>
</div>
${actionBar(button({ label: 'やめる', act: 'cancel', tier: 'quiet', block: true }))}`;
  }

  /** 種を買う・薬を確かめる面。 */
  function stockTab(): string {
    const st = nav.state;
    const g = st.data.garden;
    const expand = st.nextPlotCost();
    return `
  ${panel('種を買う', `<div class="list">
    ${each(HERBS, h => `<div class="item">
      <div class="ic ${h.element}">${esc(h.glyph)}</div>
      <div class="tx">
        <div class="n">${esc(h.name)}</div>
        <div class="m">${esc(duration(h.growSec))}で ${h.yield}個 ・ 手持ち ${g.seeds[h.id] ?? 0}</div>
      </div>
      ${button({
        label: `${num(h.seedCost)}G`, act: 'buy', tier: 'secondary',
        disabled: st.data.gold < h.seedCost
      }).replace('data-act="buy"', `data-act="buy" data-id="${h.id}"`)}
    </div>`)}
  </div>`)}

  ${panel('錬金工房', `
    <div style="font-size:var(--fs-label);color:var(--dim);line-height:1.55">
      収穫した薬草を薬に変える。薬は派遣のときに1本だけ持たせられる。
    </div>
    ${button({ label: '錬金工房へ', act: 'alchemy', tier: 'secondary', block: true })}
  `)}

  ${panel('収穫物', HERBS.some(h => (g.herbs[h.id] ?? 0) > 0)
    ? `<div class="chips">${each(HERBS.filter(h => (g.herbs[h.id] ?? 0) > 0), h =>
        `<span class="chip ${h.element}">${esc(h.glyph)} ${esc(h.name)} ${g.herbs[h.id] ?? 0}</span>`)}</div>`
    : '<div class="empty">まだ何も採れていない</div>')}

  ${panel('持っている薬', POTIONS.some(p => (g.potions[p.id] ?? 0) > 0)
    ? `<div class="list">${each(POTIONS.filter(p => (g.potions[p.id] ?? 0) > 0), p =>
        `<div class="item">
          <div class="ic ${p.element}">薬</div>
          <div class="tx"><div class="n">${esc(p.name)}</div><div class="m">${esc(p.text)}</div></div>
          <div class="rr">×${g.potions[p.id] ?? 0}</div>
        </div>`)}</div>`
    : '<div class="empty">錬金工房で作れる</div>')}

  ${when(expand !== null, panel('畑を広げる', `
    <div class="row"><span class="l">${g.plots} → ${g.plots + 1} 枠</span>
      <span class="r"><span class="v" style="color:var(--gold)">${num(expand ?? 0)}G</span></span></div>
    ${button({
      label: '広げる', act: 'expand', tier: 'secondary', block: true,
      disabled: st.data.gold < (expand ?? Infinity)
    })}
  `))}`;
  }

  return {
    scene: 'garden',

    /** 収穫できるものがあるほど温室が明るくなる（§3 の Mood と同じ仕組み） */
    get mood(): Mood {
      const st = nav.state;
      const beds = st.data.garden.beds.length;
      return {
        accent: 0x9be08a,
        intensity: beds === 0 ? 0 : Math.min(1, st.readyCount() / beds)
      };
    },

    render() {
      if (planting !== null) return plantSheet();
      const st = nav.state;
      const ready = st.readyCount();
      const growing = st.data.garden.beds.filter(b => b !== null).length;

      return `
${topBar({
        title: '薬草園', back: 'back', gold: st.data.gold,
        meta: ready > 0 ? `収穫 ${ready}` : `育成 ${growing}/${st.data.garden.plots}`
      })}
<div class="stack hero">
  ${panel('', `<div class="tabs">
    <div class="tab ${tab === 0 ? 'on' : ''}" data-tap data-act="tab" data-i="0">畑</div>
    <div class="tab ${tab === 1 ? 'on' : ''}" data-tap data-act="tab" data-i="1">種と薬</div>
  </div>`)}

  ${tab === 0
        ? panel('', `<div class="beds">${each(st.data.garden.beds, (_, i) => bed(i))}</div>`)
        : stockTab()}
</div>
${actionBar(
        ready > 0
          ? button({ label: `育った ${ready}枠を収穫する`, act: 'harvest-all', tier: 'primary', block: true, role: 'cta' })
          : seedCount() > 0 && st.data.garden.beds.some(b => b === null)
            ? button({ label: '空いた畑に植える', act: 'pick-first', tier: 'primary', block: true, role: 'cta' })
            : button({ label: '錬金工房へ', act: 'alchemy', tier: 'primary', block: true, role: 'cta' }))}
${toasts(notices)}`;
    },

    act(action, el) {
      const st = nav.state;
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'tab': tab = (Number(el.dataset.i ?? 0) === 1 ? 1 : 0); return;
        case 'alchemy': nav.goAlchemy(); return;
        case 'pick-bed': planting = Number(el.dataset.i ?? 0); return;
        case 'pick-first': {
          const i = st.data.garden.beds.findIndex(b => b === null);
          if (i >= 0) planting = i;
          return;
        }
        case 'cancel': planting = null; return;
        case 'plant': {
          const id = el.dataset.id;
          if (planting !== null && id && st.plant(planting, id)) {
            notify(`${herbDef(id).name}を植えた`);
          }
          planting = null;
          return;
        }
        case 'harvest': {
          const n = st.harvest(Number(el.dataset.i ?? 0));
          if (n > 0) notify(`収穫 +${n}`);
          return;
        }
        case 'harvest-all': {
          const n = st.harvestAll();
          if (n > 0) notify(`まとめて収穫 +${n}`);
          return;
        }
        case 'buy': {
          const id = el.dataset.id;
          if (id && st.buySeed(id)) notify(`${herbDef(id).name}の種を買った`);
          return;
        }
        case 'expand':
          if (st.expandGarden()) notify('畑を広げた');
          return;
      }
    },

    tick(dt) {
      nav.state.tick(nav.now());
      let changed = false;
      if (noticeT > 0) {
        noticeT -= dt;
        if (noticeT <= 0) { notices.length = 0; changed = true; }
      }

      // **表示が実際に変わるときだけ描き直す。**
      //
      // 「残り時間があるから1秒ごとに描き直す」で組んでいたら、
      // 何も育っていない画面でも毎秒 DOM を丸ごと入れ替えていた。
      // 無駄なだけでなく、押そうとしたボタンが1秒ごとに差し替わるので
      // タップの取りこぼしにも繋がる（実際、自動操作が掴み損ねた）。
      // 出ている文字列そのものを指紋にして、変わったときだけ描く。
      const sig = nav.state.data.garden.beds
        .map((_, i) => {
          const p = nav.state.plotProgress(i);
              // 指紋も**表示している文字列**で取る。内部の秒で取ると、
          // 画面が変わらないのに毎秒描き直すことになる
          return p ? `${p.herb.id}:${p.ratio >= 1 ? 'R' : coarseDuration(p.remainingSec)}` : '-';
        })
        .join(',');
      if (sig !== lastSig) { lastSig = sig; changed = true; }
      return changed;
    }
  };
}

/** 未使用の値を参照して lint を黙らせない。薬の定義は工房でも使う。 */
export const POTION_REF = potionDef;
