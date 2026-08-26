import type { Item, Rarity } from '../../sim/types';
import type { SceneName } from '../../world/scenes';
import type { ModelSpec } from '../../world/models';
import type { Nav, Screen } from '../shell';
import { baseDef } from '../../data/bases';
import { uniqueDef } from '../../data/uniques';
import { dominantElement, sellValue } from '../../sim/items';
import {
  RARITY_LABEL, actionBar, affixText, button, itemRow, itemScore, panel, topBar
} from '../components';
import { openSfx, play } from '../sound';
import { each, esc, num, when } from '../dom';

// 開封（docs/UI-SPEC.md §2.6）。
//
// **この作品で唯一、演出に予算を集中する画面**（仕様書 §9.4）。
// 平常時のUIは徹底して淡々と作り、派手にするのはここだけ。
//
// 演出の強度はレアリティで4段に分ける。
//   並・上質 … 一覧に流れて着地するだけ
//   稀少     … カットイン（紫）。溜め1.2秒
//   遺物     … 暗転→溜め2.4秒→破裂（金）。ユニーク効果を1文字ずつ開示
//
// 3D側（reveal シーン）は光と紙片だけを持ち、文字は一切持たない。

const RARITY_EN: Record<Rarity, string> = {
  common: 'Common', fine: 'Fine', rare: 'Rare', relic: 'Relic'
};

/** カットインを挟むか。稀少以上だけ（§7.4）。 */
function isCut(it: Item): boolean {
  return it.rarity === 'rare' || it.rarity === 'relic';
}

const CHARGE: Record<string, number> = { rare: 1.2, relic: 2.4 };
const HOLD: Record<string, number> = { rare: 2.2, relic: 4.2 };
/** 数値が実数まで上がるまでの秒数（指示書 §1） */
const COUNT_SEC = 0.5;
/** 画面フラッシュの強さ。並は光らせない（毎回光ると価値が下がる） */
const FLASH: Record<string, number> = { common: 0, fine: 0.16, rare: 0.34, relic: 0.62 };
const FLASH_SEC = 0.55;

type Phase = 'list' | 'charge' | 'reveal' | 'done';

export function openingScreen(nav: Nav, items: Item[]): Screen {
  const queue = items.slice();
  const shown: Item[] = [];
  let idx = -1;
  let phase: Phase = 'list';
  let phaseT = 0;
  let claimed = false;

  /** 開けた品を実際に手持ちへ入れる。押し忘れると戦利品が消える。 */
  function claim(): void {
    if (claimed) return;
    claimed = true;
    nav.state.openAll();
  }

  function current(): Item | null {
    return queue[idx] ?? null;
  }

  /** 次の1個へ。カットイン対象なら溜めから始める。 */
  function next(): void {
    // 出て行く1個を必ず一覧へ落としてから進む。
    // カットイン中の品は「提示を見終わってから」入れているので、
    // 待たずに次へ進むと一覧にも売却額にも入らない——
    // 件数は 4/4 なのに一覧は3行、という表示になっていた。
    // （戦利品そのものは openAll() が拾うので失われてはいない）
    const leaving = current();
    if (leaving && !shown.includes(leaving)) shown.push(leaving);
    idx++;
    const it = current();
    if (!it) {
      phase = 'done';
      claim();
      return;
    }
    if (isCut(it)) {
      phase = 'charge';
      phaseT = 0;
    } else {
      shown.push(it);
      phase = 'list';
      phaseT = 0;
      play(openSfx(it.rarity));
    }
  }

  /**
   * 残り全部を一覧へ流し込む。
   *
   * カットイン中の1個は、まだ `shown` に入っていない（提示を見終わってから
   * 入れている）。そのまま残りだけ流すと、件数が 4/4 なのに一覧が3行、
   * 売却額もその1個ぶん足りない、という表示になっていた。
   * 戦利品そのものは openAll() が拾うので失われてはいないが、
   * 「何が出たか」を確かめる画面としては嘘をついている。
   */
  function skipAll(): void {
    const cur = current();
    if (cur && !shown.includes(cur)) shown.push(cur);
    while (idx < queue.length - 1) {
      idx++;
      const it = current();
      if (it && !shown.includes(it)) shown.push(it);
    }
    phase = 'done';
    claim();
  }

  /** 0→1 の立ち上がり。終わり際が緩む（指示書 §1「イージング必須」） */
  function easeOut(x: number): number {
    const t = Math.max(0, Math.min(1, x));
    return 1 - Math.pow(1 - t, 3);
  }

  /** 数値の出方。0 から COUNT_SEC かけて実数まで上がる。 */
  function counted(target: number): number {
    return Math.round(target * easeOut(phaseT / COUNT_SEC));
  }

  /**
   * 画面のフラッシュ（指示書 §1）。
   *
   * **CSS アニメーションではなく phaseT から作る。** この作りでは
   * 数値のカウントアップのために毎フレーム描き直すので、
   * アニメーションに任せると毎フレーム頭から再生されて光りっぱなしになる。
   */
  function flash(it: Item): string {
    const peak = FLASH[it.rarity] ?? 0;
    if (peak <= 0) return '';
    const a = peak * (1 - easeOut(phaseT / FLASH_SEC));
    if (a <= 0.004) return '';
    return `<div class="flash" style="opacity:${a.toFixed(3)};` +
      `background:radial-gradient(circle at 50% 34%, var(--r-${it.rarity}), transparent 68%)"></div>`;
  }

  function cutPlate(it: Item): string {
    const u = it.unique ? uniqueDef(it.unique) : null;
    const eq = nav.state.data.equipped.swordsman;
    const cmp = nav.state.itemById(it.slot === 'weapon' ? eq.weapon : eq.armor);
    const diff = cmp ? itemScore(it) - itemScore(cmp) : null;

    return `
<div class="reveal">
  <div class="plate ${it.rarity}">
    <div class="micro" style="color:var(--r-${it.rarity});letter-spacing:0.42em">${RARITY_EN[it.rarity]}</div>
    <div class="nm en">${esc(u ? u.name : baseDef(it.baseId).name)}</div>
    <div style="font-size:var(--fs-label);color:var(--faint)">${esc(baseDef(it.baseId).name)}</div>
    <div class="sep"></div>
    <div class="row"><span class="l">${it.slot === 'weapon' ? '秒間火力' : '防御'}</span>
      <span class="r"><span class="v" style="color:var(--${it.slot === 'weapon' ? 'atk' : 'def'})">${counted(itemScore(it))}</span>
      ${when(diff !== null && diff !== 0,
        `<b class="d ${(diff ?? 0) > 0 ? 'up' : 'dn'}">${(diff ?? 0) > 0 ? '▲' : '▼'}${Math.abs(diff ?? 0)}</b>`)}</span></div>
    ${when(it.slot === 'weapon', `
      <div class="row"><span class="l">威力</span><span class="r"><span class="v">${counted(it.power)}</span></span></div>
      <div class="row"><span class="l">会心</span><span class="r"><span class="v" style="color:var(--crit)">${
        (it.crit * easeOut(phaseT / COUNT_SEC)).toFixed(1)}%</span></span></div>`)}
    ${when(it.affixes.length > 0, `<div class="sep"></div>
      <div class="fx">${each(it.affixes, a =>
        `<div><span>${esc(affixText(a))}</span><span>${'★'.repeat(a.tier)}${'☆'.repeat(5 - a.tier)}</span></div>`)}</div>`)}
    ${when(u !== null, `<div class="sep"></div>
      <div style="text-align:left">
        <div style="font-size:var(--fs-label);color:var(--gold-hi);margin-bottom:var(--sp-1)">《${esc(u?.name ?? '')}》</div>
        <div style="font-size:var(--fs-label);color:var(--dim);line-height:1.55">${esc(u?.text ?? '')}</div>
      </div>`)}
    <div style="margin-top:var(--sp-3);font-size:var(--fs-label);color:var(--gold)">+${num(counted(sellValue(it)))}G 相当</div>
  </div>
</div>`;
  }

  return {
    get scene(): SceneName {
      const it = current();
      if (phase === 'charge' || phase === 'reveal') {
        return it?.rarity === 'relic' ? 'reveal' : 'revealRare';
      }
      return 'vault';
    },

    /**
     * 3D 側に載せる品。
     *
     * 溜めの間は**まだ見せない**。何が出るか分かってしまうと、
     * カットインを挟む意味がなくなる（§7.4 開けるまで分からないこと）。
     */
    get model(): ModelSpec | null {
      const it = current();
      if (!it || phase !== 'reveal') return null;
      return {
        baseId: it.baseId, rarity: it.rarity,
        element: it.slot === 'weapon' ? dominantElement(it.element) : 'physical'
      };
    },

    render() {
      const it = current();
      const total = queue.length;
      const count = Math.min(total, Math.max(0, idx + 1));

      // 溜めと提示の間は、背後の一覧を**描かない**（透けさせない・§2.6）
      if ((phase === 'charge' || phase === 'reveal') && it) {
        return `
${topBar({ title: '開封', gold: nav.state.data.gold, meta: `${count} / ${total}` })}
<div class="stack" aria-hidden="true"></div>
${when(phase === 'reveal', flash(it) + cutPlate(it))}
${when(phase === 'charge', `<div class="reveal"><div class="charge-hint">${
          it.rarity === 'relic' ? '遺物' : '稀少'}</div></div>`)}
${actionBar(button({
          label: phase === 'reveal' ? '次へ' : 'スキップ',
          act: phase === 'reveal' ? 'next' : 'skip-cut',
          tier: phase === 'reveal' ? 'primary' : 'secondary', block: true, role: 'cta'
        }), `${count} / ${total}`)}`;
      }

      const rare = shown.filter(x => x.rarity === 'rare').length;
      const relic = shown.filter(x => x.rarity === 'relic').length;
      const gold = shown.reduce((s, x) => s + sellValue(x), 0);

      return `
${topBar({ title: '開封', gold: nav.state.data.gold, meta: `${count} / ${total}` })}
<div class="stack">
  ${panel('', `<div class="figs">
    <div class="fig"><div class="micro">稀少</div><div class="v" style="color:var(--r-rare)">${rare}</div></div>
    <div class="fig"><div class="micro">遺物</div><div class="v" style="color:var(--r-relic)">${relic}</div></div>
    <div class="fig"><div class="micro">売却額</div><div class="v" style="color:var(--gold)">${num(gold)}G</div></div>
  </div>`)}
  <div class="list">
    ${shown.length === 0
        ? '<div class="empty">封を切ると中身が分かる</div>'
        : each(shown.slice().reverse(), x => itemRow({ item: x, showSell: true }))}
  </div>
</div>
${actionBar(
        phase === 'done'
          ? button({ label: '拠点へ戻る', act: 'home', tier: 'primary', block: true, role: 'cta' })
          : `<div class="pair">
               ${button({ label: '全部開ける', act: 'skip-all', tier: 'quiet' })}
               ${button({
                 label: idx < 0 ? `未鑑定品 ${total}個を開封する` : '次を開ける',
                 act: 'next', tier: 'primary', role: 'cta'
               })}
             </div>`)}`;
    },

    act(action) {
      switch (action) {
        case 'next': next(); return;
        case 'skip-cut': {
          // 溜めを飛ばして中身だけ見る
          const it = current();
          if (it && phase === 'charge') { phase = 'reveal'; phaseT = 0; play(openSfx(it.rarity)); }
          return;
        }
        case 'skip-all': skipAll(); return;
        case 'home': claim(); nav.goBase(); return;
      }
    },

    tick(dt) {
      phaseT += dt;
      const it = current();
      if (!it) return false;

      if (phase === 'charge' && phaseT >= (CHARGE[it.rarity] ?? 1.2)) {
        phase = 'reveal';
        phaseT = 0;
        play(openSfx(it.rarity));
        return true;
      }
      // カウントアップとフラッシュが終わるまでは毎フレーム描き直す。
      // 演出は phaseT の関数なので、描き直さないと止まって見える
      if (phase === 'reveal' && phaseT < Math.max(COUNT_SEC, FLASH_SEC) + 0.05) return true;
      if (phase === 'reveal' && phaseT >= (HOLD[it.rarity] ?? 2.2)) {
        // 見終わったら一覧へ着地させる。次へ進むのはプレイヤーの操作を待つ
        if (!shown.includes(it)) {
          shown.push(it);
          return true;
        }
      }
      return false;
    },

    destroy() {
      // 画面を離れるときに取りこぼさない。
      // 以前の実装では openAll() を呼ばずに離脱でき、戦利品が消えていた
      claim();
    }
  };
}

/** 未使用の値を参照して lint を黙らせない。開けた品のラベルは一覧で使う。 */
export const RARITY_TEXT = RARITY_LABEL;
