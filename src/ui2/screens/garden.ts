import type { Nav, Screen } from '../shell';
import type { Mood } from '../../world/scenes';
import { elementIndex } from '../../world/scenes';
import { HERBS, POTIONS, herbDef } from '../../data/garden';
import { actionBar, button, panel, ring, toasts, topBar } from '../components';
import { coarseDuration, duration, each, esc, num, when } from '../dom';

// 薬草園（新機能指示書「薬草園画面」＋ 改善 §6・§7）。
//
// **反復作業を作らない。** 水やりも間引きも無い。植えたら放っておけば育ち、
// 育ったものは腐らない。プレイヤーがすることは「植える」と「収穫する」だけ。
//
// 進捗は既存のリング（UI-SPEC §3 / 円グラフ）を流用する。
// 新しい見せ方を足すより、既に読み方を覚えたものを使い回すほうが速く伝わる。
//
// **板を縦に積まない**（§7）。以前は「種と薬」の面だけで
// 錬金工房の説明／収穫物／持っている薬／畑を広げる、と4枚が縦に並び、
// 派遣準備で潰したはずの「カードの塔」がここで再発していた。
// 種はアイコンの升目に、たくわえは1行に、畑の拡張は3Dの「＋」に移す。

type Tab = 0 | 1;

export function gardenScreen(nav: Nav): Screen {
  let tab: Tab = 0;
  /** 植え付け先を選んでいる枠。null なら選んでいない */
  let planting: number | null = null;
  /** 升目で選んでいる薬草。詳細と行動ボタンの対象 */
  let picked: string | null = null;
  /** たくわえの内訳を開いているか */
  let stockOpen = false;
  /** 畑を広げる確認を出しているか */
  let expanding = false;
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

  /**
   * 薬草の升目（§7「武器/防具と同じアイコングリッド化」）。
   *
   * 名前・育つ時間・手持ちの数だけを出す。**効果や材料は出さない**——
   * 5種ぶん全部の説明を並べると、結局それは縦長の一覧に戻る。
   * 押したものの説明だけを、升目の下に1枚出す。
   */
  function herbGrid(mode: 'plant' | 'buy'): string {
    const g = nav.state.data.garden;
    return `<div class="hgrid">${each(HERBS, h => {
      const seeds = g.seeds[h.id] ?? 0;
      const off = mode === 'plant' && seeds === 0;
      return `<button class="hcell ${h.element} ${picked === h.id ? 'on' : ''} ${off ? 'off' : ''}"
                      data-tap data-act="pick-herb" data-id="${h.id}">
        <span class="g">${esc(h.glyph)}</span>
        <span class="n">${esc(h.name)}</span>
        <span class="b">${Math.round(h.growSec / 60)}分</span>
        ${when(seeds > 0, `<span class="q">${seeds}</span>`)}
      </button>`;
    })}</div>`;
  }

  /** 升目で選んだ薬草の説明。何の材料になるかまで言う（畑へ戻る理由になる） */
  function herbDetail(): string {
    if (!picked) return '';
    const h = herbDef(picked);
    const use = POTIONS.find(p => p.main === h.id);
    const seeds = nav.state.data.garden.seeds[h.id] ?? 0;
    return `<div class="hdetail">
      <div class="row"><span class="l">${esc(h.name)}</span>
        <span class="r"><span class="v">${esc(duration(h.growSec))}で ${h.yield}個</span></span></div>
      <div class="row"><span class="l">手持ちの種</span>
        <span class="r"><span class="v">${seeds}</span></span></div>
      ${when(use !== undefined, `<div class="row"><span class="l">${esc(use?.name ?? '')}の主材料</span>
        <span class="r"><span class="v" style="color:var(--dim)">${esc(use?.text ?? '')}</span></span></div>`)}
    </div>`;
  }

  /** 植える薬草を選ぶシート。 */
  function plantSheet(): string {
    const st = nav.state;
    const h = picked ? herbDef(picked) : null;
    const canPlant = h !== null && (st.data.garden.seeds[h.id] ?? 0) > 0;
    return `
${topBar({ title: '何を植えるか', back: 'cancel', gold: st.data.gold })}
<div class="sheet-back" data-act="cancel"></div>
<div class="sheet hero anchor-bottom">
  ${herbGrid('plant')}
  ${picked ? herbDetail() : '<div class="empty">植えるものを選ぶ</div>'}
</div>
${actionBar(`<div class="pair">
  ${button({ label: 'やめる', act: 'cancel', tier: 'quiet' })}
  ${button({
      label: h ? `${h.name}を植える` : '選んでいない',
      act: 'plant', tier: 'primary', role: 'cta', disabled: !canPlant
    })}
</div>`, h && !canPlant ? 'この種を持っていない。種は「種と薬」で買える' : undefined)}`;
  }

  /** たくわえの内訳。1行の要約を押したときだけ開く（§7 の統合） */
  function stockDrawer(): string {
    const g = nav.state.data.garden;
    const herbs = HERBS.filter(h => (g.herbs[h.id] ?? 0) > 0);
    const potions = POTIONS.filter(p => (g.potions[p.id] ?? 0) > 0);
    return `
<div class="sheet-back solid" data-act="stock-close"></div>
<div class="drawer">
  ${panel('収穫した薬草', herbs.length > 0
      ? `<div class="chips">${each(herbs, h =>
          `<span class="chip ${h.element}">${esc(h.glyph)} ${esc(h.name)} ${g.herbs[h.id] ?? 0}</span>`)}</div>`
      : '<div class="empty">まだ何も採れていない</div>')}
  ${panel('持っている薬', potions.length > 0
      ? `<div class="list">${each(potions, p =>
          `<div class="item">
            <div class="ic ${p.element}">薬</div>
            <div class="tx"><div class="n">${esc(p.name)}</div><div class="m">${esc(p.text)}</div></div>
            <div class="rr">×${g.potions[p.id] ?? 0}</div>
          </div>`)}</div>`
      : '<div class="empty">錬金工房で作れる</div>')}
  ${button({ label: '閉じる', act: 'stock-close', tier: 'quiet', block: true })}
</div>`;
  }

  /** 畑を広げる確認。専用の板を常設せず、温室の「＋」から開く（§7） */
  function expandModal(): string {
    const st = nav.state;
    const cost = st.nextPlotCost();
    if (cost === null) return '';
    const g = st.data.garden;
    return `
<div class="sheet-back" data-act="expand-close"></div>
<div class="modal">
  <div class="modal-body">
    <div class="nm">畑を ${g.plots} → ${g.plots + 1} 枠にする</div>
    <div style="font-size:var(--fs-display);color:var(--gold);margin-top:var(--sp-1)">${num(cost)}G</div>
    <div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-2);line-height:1.55">
      同時に育てられる薬草が1種類増える。広げた枠は戻せない。
    </div>
    <div class="pair" style="margin-top:var(--sp-4)">
      ${button({ label: 'やめる', act: 'expand-close', tier: 'quiet' })}
      ${button({
        label: '広げる', act: 'expand', tier: 'primary',
        disabled: st.data.gold < cost
      })}
    </div>
  </div>
</div>`;
  }

  /** たくわえ1行（§7「1行のステータスサマリーに統合」）。拠点の帯と同じ文法 */
  function stockLine(): string {
    const g = nav.state.data.garden;
    const kinds = HERBS.filter(h => (g.herbs[h.id] ?? 0) > 0).length;
    const bottles = POTIONS.reduce((a, p) => a + (g.potions[p.id] ?? 0), 0);
    return `<button class="summary" data-tap data-act="stock-open">
      <span class="micro">たくわえ</span>
      <span class="t">収穫した薬草 ${kinds}種 ・ 薬 ${bottles}本</span>
      <span class="chev">›</span>
    </button>`;
  }

  return {
    scene: 'garden',

    /**
     * 温室へ渡す状態（§6）。
     *
     * **枠の数も中身も、そのまま数で渡す。** 以前は明るさしか渡していなかったので、
     * 何を植えても同じ緑の株が常に6本立っていた——「育成 2/2」の横で3本が
     * 育っている絵になり、数字と絵が食い違っていた。
     */
    get mood(): Mood {
      const st = nav.state;
      const g = st.data.garden;
      const beds = g.beds.length;
      return {
        accent: 0x9be08a,
        intensity: beds === 0 ? 0 : Math.min(1, st.readyCount() / beds),
        slots: g.beds.map((_, i) => {
          const p = st.plotProgress(i);
          return p
            ? { kind: elementIndex(p.herb.element), ratio: p.ratio }
            : { kind: -1, ratio: 0 };
        }),
        canExpand: st.nextPlotCost() !== null
      };
    },

    render() {
      if (planting !== null) return plantSheet();
      const st = nav.state;
      const ready = st.readyCount();
      const growing = st.data.garden.beds.filter(b => b !== null).length;
      const canExpand = st.nextPlotCost() !== null;

      // 下端のボタンは面ごとに1つだけ。畑では「採る／植える」、
      // 種と薬では「工房へ」。板で行き先を増やさない（§7）。
      //
      // **確認を出している間は下端が主役を降りる。** 段は画面に1つ（§3.3 規則2）で、
      // 確認の「広げる」と下端の「植える」が両方 primary だと、
      // 暗幕の裏に同じ重さのボタンが残って、どちらが今の話なのか分からない。
      const main = tab === 1
        ? { label: '錬金工房へ', act: 'alchemy' }
        : ready > 0
          ? { label: `育った ${ready}枠を収穫する`, act: 'harvest-all' }
          : seedCount() > 0 && st.data.garden.beds.some(b => b === null)
            ? { label: '空いた畑に植える', act: 'pick-first' }
            : { label: '種を買う', act: 'to-stock' };
      const cta = button({
        ...main, block: true, role: 'cta',
        tier: expanding ? 'quiet' : 'primary'
      });

      return `
${topBar({
        title: '薬草園', back: 'back', gold: st.data.gold,
        meta: ready > 0 ? `収穫 ${ready}` : `育成 ${growing}/${st.data.garden.plots}`
      })}
${when(tab === 0 && canExpand,
        `<button class="hotspot" data-hotspot data-tap data-act="expand-open" style="display:none"
                 aria-label="畑を広げる"><span>＋</span></button>`)}
<div class="stack hero anchor-bottom">
  ${panel('', `<div class="tabs">
    <div class="tab ${tab === 0 ? 'on' : ''}" data-tap data-act="tab" data-i="0">畑</div>
    <div class="tab ${tab === 1 ? 'on' : ''}" data-tap data-act="tab" data-i="1">種と薬</div>
  </div>`)}

  ${tab === 0
        ? panel('', `<div class="beds">${each(st.data.garden.beds, (_, i) => bed(i))}</div>`
            + when(canExpand, '<div class="hintline calm">温室の「＋」を押すと畑を広げられる</div>'))
        : panel('種を買う', `${herbGrid('buy')}
            ${picked ? herbDetail() : ''}
            ${when(picked !== null, `${button({
              label: picked ? `${herbDef(picked).name}の種を買う ・ ${num(herbDef(picked).seedCost)}G` : '',
              act: 'buy', tier: 'secondary', block: true,
              disabled: picked === null || st.data.gold < herbDef(picked).seedCost
            })}`)}`)
          + stockLine()}
</div>
${actionBar(cta)}
${when(stockOpen, stockDrawer())}
${when(expanding, expandModal())}
${toasts(notices)}`;
    },

    act(action, el) {
      const st = nav.state;
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'tab': tab = (Number(el.dataset.i ?? 0) === 1 ? 1 : 0); picked = null; return;
        case 'to-stock': tab = 1; picked = null; return;
        case 'alchemy': nav.goAlchemy(); return;
        case 'pick-bed': planting = Number(el.dataset.i ?? 0); picked = null; return;
        case 'pick-first': {
          const i = st.data.garden.beds.findIndex(b => b === null);
          if (i >= 0) { planting = i; picked = null; }
          return;
        }
        case 'pick-herb': picked = el.dataset.id ?? null; return;
        case 'cancel': planting = null; picked = null; return;
        case 'plant': {
          if (planting !== null && picked && st.plant(planting, picked)) {
            notify(`${herbDef(picked).name}を植えた`);
          }
          planting = null;
          picked = null;
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
          if (picked && st.buySeed(picked)) notify(`${herbDef(picked).name}の種を買った`);
          return;
        }
        case 'stock-open': stockOpen = true; return;
        case 'stock-close': stockOpen = false; return;
        case 'expand-open': expanding = true; return;
        case 'expand-close': expanding = false; return;
        case 'expand':
          if (st.expandGarden()) notify('畑を広げた');
          expanding = false;
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
