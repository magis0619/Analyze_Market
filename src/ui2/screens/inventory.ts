import type { Item, Rarity, Slot, StageDef } from '../../sim/types';
import type { Nav, Screen } from '../shell';
import type { ModelSpec } from '../../world/models';
import { stageDef } from '../../data/stages';
import { HERBS, POTIONS } from '../../data/garden';
import { effectiveScore } from '../affinity';
import { Prng } from '../../sim/prng';
import { dominantElement, sellValue } from '../../sim/items';
import {
  RARITY_LABEL, actionBar, button, equipCard, itemName, itemRow, itemScore, panel, tabs, toasts, topBar
} from '../components';
import { each, esc, num, when } from '../dom';

// インベントリ（docs/UI-SPEC.md §2.7）。
//
// 200個持っていても操作が1フレーム（16.7ms）を超えないこと（U9）。
// 全件を DOM に出すと innerHTML の書き換えだけで予算を食うので、
// 見えている範囲＋前後の余白だけを描く（仮想スクロール）。

// 上段は**持ち物の種類**。装備は1点ずつ違う個体だが、種・収穫物・薬は
// 「何がいくつ」しかない別物なので、同じ並べ替え・同じ売却を当てると嘘になる。
// タブで面ごと切り替えて、それぞれに合う操作だけを出す（新機能指示書「所持品」）。
const CATS = ['装備', '種', '収穫物', '薬'] as const;

const SORTS = ['相性', '強さ', 'レア', '種別'] as const;
const SLOTS: Array<Slot | 'all'> = ['all', 'weapon', 'armor'];
const SLOT_LABEL = ['全部', '武器', '防具'];
const RARS: Array<Rarity | 'all' | 'fine+'> = ['all', 'fine+', 'common'];
const RAR_LABEL = ['全レア', '上質以上', '並のみ'];

/** 1行の高さ（CSS と揃える。ここがずれると窓の計算が狂う） */
const ROW_H = 52;
/** 画面外に余分に描く行数。速いスクロールで穴が空かないための余白 */
const OVERSCAN = 6;

export function inventoryScreen(nav: Nav): Screen {
  const st = nav.state;
  // 既定は「相性」——どこへ送るつもりかが分かっているなら、
  // 素の強さで並べた一覧は嘘をつく（指示書 §2）。分からなければ強さに落とす
  let cat = 0;
  let sort = nav.stageContext === null ? 1 : 0;
  let slotF = 0;
  let rarF = 0;
  let selectedId: string | null = null;
  let confirm: { ids: string[]; gold: number; label: string } | null = null;
  let scrollTop = 0;
  const notices: string[] = [];
  let noticeT = 0;

  /**
   * 並べ替えの見出し。「相性」だけでは**何との相性か**が分からない。
   * 派遣先が分かっているなら、その名前をそのまま出す。
   */
  function sortLabels(): string[] {
    const stage = contextStage();
    return [stage ? `対 ${stage.name}` : '相性', ...SORTS.slice(1)];
  }

  /**
   * 相性を計算する相手。派遣準備で最後に見ていた派遣先。
   * 一度も見ていなければ null で、そのときは素の強さで並べる。
   */
  function contextStage(): StageDef | null {
    return nav.stageContext === null ? null : stageDef(nav.stageContext);
  }

  /** 装備中のIDは売却・破棄の対象から必ず外す。 */
  function equippedIds(): Set<string> {
    const s = new Set<string>();
    for (const eq of Object.values(st.data.equipped)) {
      if (eq.weapon) s.add(eq.weapon);
      if (eq.armor) s.add(eq.armor);
    }
    return s;
  }

  function view(): Item[] {
    const slot = SLOTS[slotF];
    const rar = RARS[rarF];
    let xs = st.data.inventory.filter(it => {
      if (slot !== 'all' && it.slot !== slot) return false;
      if (rar === 'fine+' && it.rarity === 'common') return false;
      if (rar === 'common' && it.rarity !== 'common') return false;
      return true;
    });
    xs = xs.slice();
    const stage = contextStage();
    switch (sort) {
      case 0:
        if (stage) xs.sort((a, b) => effectiveScore(b, stage) - effectiveScore(a, stage));
        else xs.sort((a, b) => itemScore(b) - itemScore(a));
        break;
      case 1: xs.sort((a, b) => itemScore(b) - itemScore(a)); break;
      case 2: {
        const rank = (r: Rarity): number => ['common', 'fine', 'rare', 'relic'].indexOf(r);
        xs.sort((a, b) => rank(b.rarity) - rank(a.rarity) || itemScore(b) - itemScore(a));
        break;
      }
      case 3: xs.sort((a, b) => a.slot.localeCompare(b.slot) || itemScore(b) - itemScore(a)); break;
    }
    return xs;
  }

  /** 種・収穫物・薬の在庫。個体ではなく数なので、1種類1行にまとめる。 */
  function stock(): Array<{ el: string; glyph: string; name: string; note: string; n: number }> {
    const g = st.data.garden;
    if (cat === 3) {
      return POTIONS.filter(p => (g.potions[p.id] ?? 0) > 0).map(p => ({
        el: p.element, glyph: '薬', name: p.name, note: p.text, n: g.potions[p.id] ?? 0
      }));
    }
    const bag = cat === 1 ? g.seeds : g.herbs;
    return HERBS.filter(h => (bag[h.id] ?? 0) > 0).map(h => ({
      el: h.element, glyph: h.glyph, name: h.name,
      // 種は「植えたらどうなるか」、収穫物は「何になるか」。
      // 手持ちの数だけ出しても、次に何をすればよいかが分からない
      note: cat === 1
        ? `${Math.round(h.growSec / 60)}分で ${h.yield}個`
        : `${POTIONS.find(p => p.main === h.id)?.name ?? '薬'}の主材料`,
      n: bag[h.id] ?? 0
    }));
  }

  /** 表示中のうち、実際に売れるもの（ロック品と装備中は除く）。 */
  function sellable(): Item[] {
    const eq = equippedIds();
    return view().filter(it => !it.locked && !eq.has(it.id));
  }

  return {
    scene: 'vault',

    /** 明細を開いている品だけを台座に載せる。一覧の間は何も載せない */
    get model(): ModelSpec | null {
      const it = selectedId ? st.itemById(selectedId) : null;
      if (!it) return null;
      return {
        baseId: it.baseId, rarity: it.rarity,
        element: it.slot === 'weapon' ? dominantElement(it.element) : 'physical'
      };
    },

    render() {
      const list = view();
      const stage = contextStage();
      const eq = equippedIds();
      const sel = selectedId ? st.itemById(selectedId) : null;
      const bulk = sellable();
      const bulkGold = bulk.reduce((s, it) => s + sellValue(it), 0);

      // 仮想スクロール。全件ぶんの高さだけ確保して、見える範囲だけ描く
      const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
      const visible = Math.ceil(window.innerHeight / ROW_H) + OVERSCAN * 2;
      const slice = list.slice(first, first + visible);

      // 明細シート。dispatch の装備選択と同じで、**本体と入れ替える**。
      // .sheet は overlay ではなく列の flex アイテムなので、
      // 一覧と重ねて出すと両方が潰れる（実際に潰れていた）
      const modal = confirm === null ? '' : `
<div class="sheet-back" data-act="cancel"></div>
<div class="modal">
  <div class="modal-body">
    <div class="nm">${esc(confirm.label)}</div>
    <div style="font-size:var(--fs-display);color:var(--gold);margin-top:var(--sp-1)">+${num(confirm.gold)}G</div>
    <div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-2);line-height:1.55">
      ロック品と装備中の品は含まれていない。この操作は戻せない。
    </div>
    <div class="pair" style="margin-top:var(--sp-4)">
      ${button({ label: 'やめる', act: 'cancel', tier: 'primary' })}
      ${button({ label: '売却する', act: 'do-sell', tier: 'danger' })}
    </div>
  </div>
</div>`;

      if (sel !== null) {
        return `
${topBar({ title: itemName(sel), back: 'close', gold: st.data.gold, meta: RARITY_LABEL[sel.rarity] })}
<div class="sheet-back" data-act="close"></div>
<div class="sheet">
  <div class="sheet-compare">${equipCard({ item: sel, showSell: true })}</div>
</div>
${actionBar(`<div class="trio">
  ${button({ label: sel.locked ? '解除' : 'ロック', act: 'lock', tier: 'secondary' })}
  ${button({
          label: `振直 ${num(st.reidentifyCost(sel))}G`,
          act: 'reid', disabled: st.data.gold < st.reidentifyCost(sel)
        })}
  ${button({
          label: eq.has(sel.id) ? '装備中' : sel.locked ? 'ロック中' : `売却 ${num(sellValue(sel))}G`,
          act: 'sell', tier: 'danger', role: 'cta',
          disabled: eq.has(sel.id) || sel.locked
        })}
</div>`, '振直はアフィックスを引き直す（戻せない）')}
${modal}
${toasts(notices)}`;
      }

      if (cat !== 0) {
        const xs = stock();
        const total = xs.reduce((a, b) => a + b.n, 0);
        // 面ごとに**次の行き先**を出す。数を眺めるだけの画面にしない
        const go = cat === 1
          ? { label: '薬草園で植える', act: 'garden' }
          : cat === 2
            ? { label: '錬金工房で薬にする', act: 'alchemy' }
            : { label: '派遣に持たせる', act: 'dispatch' };
        return `
${topBar({ title: '所持品', back: 'back', gold: st.data.gold, meta: `${total}個` })}
<div class="stack" data-role="list" data-scroll>
  ${panel('', tabs([...CATS], cat, 'cat'))}
  ${panel(CATS[cat] ?? '', xs.length === 0
          ? `<div class="empty">${cat === 1 ? '薬草園で種を買える' : cat === 2 ? '薬草園で育てて収穫する' : '錬金工房で作れる'}</div>`
          : `<div class="list">${each(xs, x => `<div class="item">
              <div class="ic ${x.el}">${esc(x.glyph)}</div>
              <div class="tx"><div class="n">${esc(x.name)}</div><div class="m">${esc(x.note)}</div></div>
              <div class="rr">×${x.n}</div>
            </div>`)}</div>`)}
</div>
${actionBar(button({ label: go.label, act: go.act, tier: 'primary', block: true, role: 'cta' }))}
${toasts(notices)}`;
      }

      return `
${topBar({
        title: '所持品', back: 'back', gold: st.data.gold,
        meta: list.length === st.data.inventory.length
          ? `${list.length}点` : `${list.length} / ${st.data.inventory.length}点`
      })}
<div class="stack" data-role="list" data-scroll>
  ${panel('', `
    ${tabs([...CATS], cat, 'cat')}
    <div style="height:var(--sp-2)"></div>
    ${tabs(sortLabels(), sort, 'sort')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2);margin-top:var(--sp-2)">
      ${tabs(SLOT_LABEL, slotF, 'slotf')}
      ${tabs(RAR_LABEL, rarF, 'rarf')}
    </div>
  `)}
  ${list.length === 0
        ? '<div class="empty">該当する品が無い</div>'
        : `<div class="vlist" style="height:${list.length * ROW_H}px">
             <div class="vlist-inner" style="transform:translateY(${first * ROW_H}px)">
               ${each(slice, it => itemRow({
                 item: it, showSell: true, act: 'sel',
                 stage: sort === 0 ? stage : null,
                 selected: it.id === selectedId,
                 extra: when(eq.has(it.id), '<div class="rr" style="color:var(--gold)">装備中</div>')
               }))}
             </div>
           </div>`}
</div>
${actionBar(button({
        label: `表示中の ${bulk.length}個を売る ・ ${num(bulkGold)}G`,
        act: 'bulk', tier: 'danger', block: true, disabled: bulk.length === 0
      }), 'ロック品と装備中は含まれない')}
${modal}
${toasts(notices)}`;
    },

    act(action, el) {
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'cat':
          cat = Number(el.dataset.i ?? 0);
          // 面を変えたら明細も畳む。装備の明細が種の面に残ると意味が通らない
          selectedId = null;
          confirm = null;
          scrollTop = 0;
          return;
        case 'garden': nav.goGarden(); return;
        case 'alchemy': nav.goAlchemy(); return;
        case 'dispatch': nav.goDispatch(); return;
        case 'sort': sort = Number(el.dataset.i ?? 0); scrollTop = 0; return;
        case 'slotf': slotF = Number(el.dataset.i ?? 0); scrollTop = 0; return;
        case 'rarf': rarF = Number(el.dataset.i ?? 0); scrollTop = 0; return;
        case 'sel': selectedId = el.dataset.id ?? null; return;
        case 'close': selectedId = null; return;
        case 'lock': {
          const it = selectedId ? st.itemById(selectedId) : null;
          if (it) { it.locked = !it.locked; st.save(); }
          return;
        }
        case 'sell': {
          const it = selectedId ? st.itemById(selectedId) : null;
          if (!it) return;
          confirm = { ids: [it.id], gold: sellValue(it), label: `${itemName(it)} を売却する` };
          return;
        }
        case 'bulk': {
          const xs = sellable();
          if (xs.length === 0) return;
          confirm = {
            ids: xs.map(x => x.id),
            gold: xs.reduce((s, x) => s + sellValue(x), 0),
            label: `表示中の ${xs.length}個を売却する`
          };
          return;
        }
        case 'cancel': confirm = null; return;
        case 'do-sell': {
          if (!confirm) return;
          const gained = st.sell(confirm.ids, sellValue);
          notices.push(`+${num(gained)}G`);
          noticeT = 2.4;
          confirm = null;
          selectedId = null;
          return;
        }
        case 'reid': {
          const it = selectedId ? st.itemById(selectedId) : null;
          if (!it) return;
          const seed = (st.data.seed ^ Math.floor(nav.now())) >>> 0;
          if (st.reidentify(it.id, new Prng(seed))) {
            notices.push('アフィックスを振り直した');
            noticeT = 2.4;
          }
          return;
        }
      }
    },

    tick(dt) {
      if (noticeT > 0) {
        noticeT -= dt;
        if (noticeT <= 0) { notices.length = 0; return true; }
      }
      // スクロール位置を拾って、窓が動いたときだけ描き直す
      const el = document.querySelector<HTMLElement>('[data-scroll]');
      if (el) {
        const t = el.scrollTop;
        if (Math.abs(t - scrollTop) >= ROW_H) {
          scrollTop = t;
          return true;
        }
      }
      return false;
    }
  };
}
