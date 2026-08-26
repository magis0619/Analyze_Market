import type { Element, Item, JobId, Rarity, RetreatRule } from '../../sim/types';
import type { Mood, SceneName } from '../../world/scenes';
import { elementIndex } from '../../world/scenes';
import type { ModelSpec } from '../../world/models';
import type { Nav, Screen } from '../shell';
import { RETREAT_RULES, canEquipArmor, jobDef, retreatRuleDef } from '../../data/jobs';
import { baseDef } from '../../data/bases';
import { bossName, stageDef, STAGES } from '../../data/stages';
import { POTIONS, potionForElement } from '../../data/garden';
import { enemiesForStage } from '../../data/enemies';
import { simulateRun } from '../../sim/combat';
import { dominantElement } from '../../sim/items';
import {
  actionBar, button, compareView, effectiveScore, elementLabel, itemGrid, itemIcon,
  itemScore, panel, tabs, tag, topBar
} from '../components';
import { duration, each, esc, num, when } from '../dom';

// 派遣準備（docs/UI-SPEC.md §2.3）。
//
// プレイヤーが行う3つの判断——装備・撤退ルール・派遣先——を1画面に収める。
// 装備選択だけは判断が重いので、Loot → Compare → Equip の段を踏ませる（§2.4）。

const RULE_TONE: Record<RetreatRule, string> = {
  reckless: 'down', standard: 'gold', cautious: 'up'
};

/**
 * 派遣先の光の色（§3-2）。ダンジョンの「敵の属性」をそのまま使う。
 * 灼熱坑なら赤橙、氷結層なら青白——奥から漏れる光でどこへ行くのかが分かる。
 */
const GATE_DEFAULT = 0xe9be74;
const STAGE_LIGHT: Record<string, number> = {
  physical: 0x9fb0d0, fire: 0xff8348, ice: 0x6fc7ff,
  lightning: 0xe9be74, poison: 0x7ddc8a, mixed: 0xa77dff
};

/** 展示台の光（§3-3）。並=白／上質=青白／稀少=紫／遺物=金 */
const RARITY_LIGHT: Record<Rarity, number> = {
  common: 0xc8d2e8, fine: 0x5aa9ff, rare: 0xa77dff, relic: 0xffc76b
};
const RARITY_AURA: Record<Rarity, number> = {
  common: 0.16, fine: 0.4, rare: 0.68, relic: 1
};

export function dispatchScreen(nav: Nav): Screen {
  let jobIdx = 0;
  let rule: RetreatRule = 'standard';
  let stageId = nav.stageContext ?? Math.max(...nav.state.data.unlockedStages);
  nav.stageContext = stageId;
  /** 装備選択のシート。null なら閉じている */
  let picking: 'weapon' | 'armor' | null = null;
  /** 比較中の候補。null なら一覧のまま */
  let candidate: Item | null = null;
  /** 持たせる薬。null なら持たせない */
  let potionId: string | null = null;
  /** 派遣先の地図を開いているか（カード脱却指示書 §1） */
  let mapOpen = false;

  /** 所要時間の見積のキャッシュ。条件が変わるまで使い回す */
  let etaKey = '';
  let etaCache: { min: number; max: number; hopeless: boolean } | null = null;
  /** 実測比較のキャッシュ。候補を選び直すまで使い回す */
  let measureKey = '';
  let measureCache: string | null = null;
  /** 候補一覧を素の強さで並べるか。既定は派遣先での実効値（指示書 §2） */
  let sortByRaw = false;

  const job = (): JobId => nav.state.availableJobs()[jobIdx] ?? 'swordsman';
  const equipped = (slot: 'weapon' | 'armor'): Item | null => {
    const eq = nav.state.data.equipped[job()];
    return nav.state.itemById(slot === 'weapon' ? eq.weapon : eq.armor);
  };

  /**
   * 所要時間の見積（§2.3）。
   *
   * **ステージ全長を出してはならない。** 実時間は到達深度に比例するので、
   * 全長表示は常に嘘になる（「約8時間」と送り出した派遣が1秒で帰ってくる）。
   * 本物のシミュレーションを別 seed で数回回して、起こりうる幅だけを見せる。
   * 結果そのもの（踏破するか死ぬか）は見せない。
   */
  function estimate(): { min: number; max: number; hopeless: boolean } | null {
    const st = nav.state;
    const w = equipped('weapon'), a = equipped('armor');
    if (!w || !a) return null;
    const key = `${job()}|${stageId}|${rule}|${w.id}|${a.id}|${st.data.tier}`;
    if (etaKey === key) return etaCache;

    let min = Infinity, max = 0, zero = 0;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const r = simulateRun({
        // 本番の派遣とは別系列。ここで引いた乱数が結果に影響しないようにする
        seed: (0xE7A0000 + i * 2654435761) >>> 0,
        job: jobDef(job()), weapon: w, armor: a,
        rule: retreatRuleDef(rule), stage: stageDef(stageId), tier: st.data.tier
      });
      min = Math.min(min, r.durationSec);
      max = Math.max(max, r.durationSec);
      if (r.depth === 0) zero++;
    }
    etaKey = key;
    etaCache = { min, max, hopeless: zero > N / 2 };
    return etaCache;
  }

  /**
   * 薬を持たせる段（新機能：薬草園）。
   *
   * **派遣先に効くものを推す。** どれが効くかは既存の属性相性と同じ理屈なので、
   * 灼熱坑なら耐炎油、という対応をそのまま出す。持たせないのも選べる——
   * 薬は貴重なので「毎回持つ」を強制すると、育てる楽しみが義務になる。
   */
  function potionPanel(): string {
    const st = nav.state;
    const stage = stageDef(stageId);
    const owned = POTIONS.filter(p => (st.data.garden.potions[p.id] ?? 0) > 0);
    if (owned.length === 0) return '';
    const best = stage.enemyElement === 'mixed' ? null : potionForElement(stage.enemyElement);
    return panel('薬を持たせる', `<div class="list">
      <button class="item ${potionId === null ? 'on' : ''}" data-tap data-act="potion" data-id="">
        <div class="ic">無</div>
        <div class="tx"><div class="n">持たせない</div><div class="m">薬は温存する</div></div>
      </button>
      ${each(owned, p => {
        const rec = best?.id === p.id;
        return `<button class="item ${potionId === p.id ? 'on' : ''}"
                        data-tap data-act="potion" data-id="${p.id}">
          <div class="ic ${p.element}">薬</div>
          <div class="tx">
            <div class="n">${esc(p.name)} <b style="color:var(--faint)">×${st.data.garden.potions[p.id] ?? 0}</b></div>
            <div class="m${rec ? ' aff-weak' : ''}">${esc(rec
              ? `${stage.name}の敵は${elementLabel(stage.enemyElement)}。これが効く`
              : p.text)}</div>
          </div>
          ${when(rec, '<div class="rr" style="color:var(--up)">推奨</div>')}
        </button>`;
      })}
    </div>`);
  }

  /** 装備とステージ属性の噛み合い。プレイヤーが装備を選ぶ唯一の手がかり（§6.4）。 */
  function matchupHint(): string {
    const stage = stageDef(stageId);
    const w = equipped('weapon'), a = equipped('armor');
    const parts: string[] = [];
    if (w) {
      const dom = dominantElement(w.element);
      if (stage.resists.includes(dom)) {
        parts.push(`⚠ ${stage.name}は${elementLabel(dom)}に耐性。火力が半減する`);
      } else if (stage.weakTo && dom === stage.weakTo) {
        parts.push(`◎ ${elementLabel(dom)}は弱点属性。火力1.5倍`);
      } else if (stage.weakTo) {
        parts.push(`弱点は${elementLabel(stage.weakTo)}。${elementLabel(dom)}では等倍`);
      }
    }
    const enemyElem: Element | null = stage.enemyElement === 'mixed' ? null : stage.enemyElement;
    if (enemyElem && a) {
      const has = a.affixes.some(x => x.kind === 'resistPct' && x.element === enemyElem);
      parts.push(has
        ? `◎ 防具が${elementLabel(enemyElem)}耐性を持つ`
        : `敵は${elementLabel(enemyElem)}で攻めてくる`);
    }
    if (parts.length === 0) return '';
    const warn = parts[0]?.startsWith('⚠');
    return `<div style="margin-top:var(--sp-2);font-size:var(--fs-label);line-height:1.5;` +
      `color:var(--${warn ? 'ember' : 'dim'})">${esc(parts.join(' ・ '))}</div>`;
  }

  /**
   * 装備できる候補（職の防具制限を反映）。
   *
   * **並びは「素の強さ」ではなく「その派遣先での実効値」。**
   * 灼熱坑に炎の武器を持って行くと火力が半減するのに、
   * 素の秒間火力で並べるとその武器が一番上に来る——
   * 一覧が嘘をついていたので、プレイヤーは騙されるほうが自然だった（指示書 §2）。
   */
  function candidates(): Item[] {
    const st = nav.state;
    const j = jobDef(job());
    const stage = stageDef(stageId);
    return st.data.inventory
      .filter(it => it.slot === picking)
      .filter(it => it.slot === 'weapon' || canEquipArmor(j, baseDef(it.baseId).tags))
      .sort((a, b) => sortByRaw
        ? itemScore(b) - itemScore(a)
        : effectiveScore(b, stage) - effectiveScore(a, stage));
  }

  /**
   * 候補と装備中を**実際に走らせて**比べる（指示書 §2「対ステージ期待値」）。
   *
   * 解析値（属性係数を掛けただけ）は敵の硬さも撤退ラインもユニーク効果も見ていない。
   * 一覧を並べるにはそれで足りるが、装備を差し替えるかどうかの決断は
   * 本物のシミュレーションで裏を取る。候補を選んだときだけ走る（毎フレームではない）。
   */
  function measure(cand: Item): string | null {
    const st = nav.state;
    const cur = equipped(picking === 'armor' ? 'armor' : 'weapon');
    const other = equipped(picking === 'armor' ? 'weapon' : 'armor');
    if (!other) return null;
    const key = `${job()}|${stageId}|${rule}|${cur?.id ?? '-'}|${cand.id}|${st.data.tier}`;
    if (measureKey === key) return measureCache;

    const run = (w: Item, a: Item): number => {
      let sum = 0;
      const N = 5;
      for (let i = 0; i < N; i++) {
        sum += simulateRun({
          // 本番の派遣とは別系列。ここで引いた乱数が結果に影響しないようにする
          seed: (0x5EA1000 + i * 40503) >>> 0,
          job: jobDef(job()), weapon: w, armor: a,
          rule: retreatRuleDef(rule), stage: stageDef(stageId), tier: st.data.tier
        }).depth;
      }
      return sum / N;
    };
    const pair = (it: Item | null): [Item, Item] | null => {
      if (!it) return null;
      return picking === 'armor' ? [other, it] : [it, other];
    };
    const candPair = pair(cand);
    const curPair = pair(cur);
    let text: string | null = null;
    if (candPair) {
      const after = run(candPair[0], candPair[1]);
      if (curPair) {
        const before = run(curPair[0], curPair[1]);
        const d = after - before;
        text = Math.abs(d) < 0.5
          ? `実測: 到達深度はほぼ変わらない（${before.toFixed(1)} → ${after.toFixed(1)}）`
          : `実測: 到達深度 ${before.toFixed(1)} → ${after.toFixed(1)}（${d > 0 ? '+' : ''}${d.toFixed(1)}）`;
      } else {
        text = `実測: 到達深度 ${after.toFixed(1)}`;
      }
    }
    measureKey = key;
    measureCache = text;
    return text;
  }

  /**
   * 今の候補が一覧の何番目か（カード脱却指示書 §3「台座カルーセル」）。
   *
   * 番号を状態として持たない。並べ替えを切り替えると順番が変わるので、
   * 覚えた番号は次の瞬間には別の品を指している。**毎回引き直す**。
   */
  function candIdx(list: readonly Item[]): number {
    return candidate ? list.findIndex(i => i.id === candidate?.id) : -1;
  }

  /** 台座に載せたまま隣の品へ移る。一覧に戻らず続けて比べられる。 */
  function step(delta: number): void {
    const list = candidates();
    const i = candIdx(list);
    if (i < 0) return;
    const next = list[Math.max(0, Math.min(list.length - 1, i + delta))];
    if (next) candidate = next;
  }

  function pickerSheet(): string {
    if (!picking) return '';
    const current = equipped(picking);
    const list = candidates();
    const stage = stageDef(stageId);
    return `
<div class="sheet-back" data-act="pick-close"></div>
<div class="sheet${when(candidate, ' hero')}">
  ${when(candidate, `
    <div class="carousel">
      ${button({ label: '‹', act: 'pick-prev', tier: 'quiet', disabled: candIdx(list) <= 0 })}
      <span class="c">${candIdx(list) + 1} / ${list.length}</span>
      ${button({ label: '›', act: 'pick-next', tier: 'quiet', disabled: candIdx(list) >= list.length - 1 })}
    </div>
    <div class="sheet-compare">${candidate
        ? compareView(current, candidate, { stage, measured: measure(candidate) }) : ''}</div>`)}
  <div class="sheet-sort">
    ${tabs([`${stage.name}での強さ`, '素の強さ'], sortByRaw ? 1 : 0, 'sortmode')}
  </div>
  <div class="sheet-list">
    ${list.length === 0
        ? '<div class="empty">装備できる品がない</div>'
        : itemGrid(list, {
            compareTo: current, stage: sortByRaw ? null : stage,
            act: 'pick', selectedId: candidate?.id ?? null
          })}
  </div>
</div>
${actionBar(candidate
        ? `<div class="pair">
             ${button({ label: '戻る', act: 'pick-back', tier: 'quiet' })}
             ${button({
               label: current?.id === candidate.id ? '装備中' : '装備する',
               act: 'equip', tier: 'primary', role: 'cta',
               disabled: current?.id === candidate.id
             })}
           </div>`
        : button({ label: '閉じる', act: 'pick-close', tier: 'quiet', block: true, role: 'cta' }),
      candidate ? '‹ › で隣の品と比べ直せる' : 'タップで比較')}`;
  }

  /**
   * 派遣先の地図（カード脱却指示書 §1）。
   *
   * 以前は10行の一覧カードと、その下に大きな明細カードが並んでいた。
   * 行の高さが全部同じなので、**浅いか深いかが文字を読むまで分からない**——
   * このゲームで一番はっきりした縦の軸を、平らな表に潰していた。
   *
   * 奥行きで言い直す。3D 側が経路とノードを描き、名前と数字はここが出す。
   * **押されるのは 3D ではなく DOM のボタン**（§6.2）——
   * Raycaster で叩かせると、この操作が U3/U11 の検査から消える。
   */
  function mapSheet(): string {
    const st = nav.state;
    const stage = stageDef(stageId);
    const unlocked = st.data.unlockedStages.includes(stageId);
    const prevCleared = stage.id === 1 || st.data.clearedStages.includes(stage.id - 1);

    const marks = each(STAGES, (sg, i) => {
      const ok = st.data.unlockedStages.includes(sg.id);
      const done = st.data.clearedStages.includes(sg.id);
      const sel = sg.id === stageId;
      return `<button class="mapnode ${done ? 'done' : ok ? 'open' : 'lock'} ${sel ? 'on' : ''}"
                      data-hotspot="node${i}" data-tap data-act="stage" data-id="${sg.id}"
                      style="visibility:hidden">
        <span class="no">${ok ? sg.id : '鍵'}</span>
        ${when(sel, `<span class="nm">${esc(sg.name)}</span>`)}
      </button>`;
    });

    return `
${topBar({ title: '派遣先を選ぶ', back: 'map-close', gold: st.data.gold })}
${marks}
<div class="stack anchor-bottom">
  ${panel(stage.name, unlocked ? `
    <div class="row"><span class="l">敵の属性</span><span class="r">${
      stage.enemyElement === 'mixed' ? '<span class="tag phys">複合</span>'
        : tag(elementLabel(stage.enemyElement), stage.enemyElement)}</span></div>
    <div class="row"><span class="l">弱点 ／ 効きにくい</span><span class="r">${
      stage.weakTo ? tag(elementLabel(stage.weakTo), stage.weakTo)
        : '<span class="v" style="color:var(--faint)">なし</span>'}
      <span class="v" style="color:var(--ember)">${
        stage.resists.length > 0 ? esc(stage.resists.map(elementLabel).join('・')) : 'なし'}</span></span></div>
    <div class="row"><span class="l">満踏破で ／ ドロップ</span><span class="r"><span class="v">${
      esc(duration(stage.minutes * 60))} ・ ${
      stage.dropBias === 'weapon' ? '武器寄り' : stage.dropBias === 'armor' ? '防具寄り' : '均等'}</span></span></div>
    <div class="row"><span class="l">出る敵 ／ 主</span><span class="r"><span class="v" style="font-size:var(--fs-label)">${
      esc(enemiesForStage(stage.id).slice(0, 2).map(e => e.name).join(' / '))}
      ・ <b style="color:var(--down)">${esc(bossName(stage.id))}</b></span></span></div>
  ` : `
    <div class="row"><span class="l">解放費用</span><span class="r"><span class="v" style="color:var(--gold)">${num(stage.unlockCost)}G</span></span></div>
    <div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-2)">${
      !prevCleared ? esc(`ステージ${stage.id - 1}の踏破が必要`)
        : st.data.gold >= stage.unlockCost ? '解放できる' : '金が足りない'}</div>
  `)}
</div>
${actionBar(unlocked
      ? button({ label: 'ここへ送る', act: 'map-close', tier: 'primary', block: true, role: 'cta' })
      : button({
          label: `解放する ・ ${num(stage.unlockCost)}G`, act: 'unlock',
          tier: 'primary', block: true, role: 'cta',
          disabled: st.data.gold < stage.unlockCost || !prevCleared
        }),
      '暗いノードはまだ行けない場所')}`;
  }

  return {
    /** 装備を選んでいる間は展示台へ、地図を開いている間は地図へ移る */
    get scene(): SceneName {
      return picking ? 'pedestal' : mapOpen ? 'map' : 'dispatch';
    },

    /** 比較中の候補を台座に載せる */
    get model(): ModelSpec | null {
      if (!picking || !candidate) return null;
      return {
        baseId: candidate.baseId, rarity: candidate.rarity,
        element: candidate.slot === 'weapon' ? dominantElement(candidate.element) : 'physical'
      };
    },

    /**
     * 3D 側へ渡す状態（§3-2 / §3-3）。
     *
     * 派遣先を選び直せば入口の光の色と塵の密度が変わり、
     * 装備を選べば展示台の光がレアリティの色になる。
     * どちらも文字ではなく光で「今どれを見ているか」を言う。
     */
    get mood(): Mood {
      if (picking) {
        const r = candidate?.rarity ?? 'common';
        return { accent: RARITY_LIGHT[r], intensity: RARITY_AURA[r] };
      }
      if (mapOpen) {
        const st = nav.state;
        return {
          nodes: STAGES.map(sg => ({
            state: st.data.clearedStages.includes(sg.id) ? 2
              : st.data.unlockedStages.includes(sg.id) ? 1 : 0,
            element: sg.enemyElement === 'mixed' ? -1 : elementIndex(sg.enemyElement)
          })),
          selected: STAGES.findIndex(sg => sg.id === stageId)
        };
      }
      const stage = stageDef(stageId);
      return {
        accent: STAGE_LIGHT[stage.enemyElement] ?? GATE_DEFAULT,
        // 深いほど塵を濃くする（§3-2）
        intensity: Math.min(1, (stageId - 1) / (STAGES.length - 1))
      };
    },

    render() {
      const st = nav.state;
      const jobs = st.availableJobs();
      const stage = stageDef(stageId);
      const unlocked = st.data.unlockedStages.includes(stageId);
      const busy = st.isBusy(job());
      const w = equipped('weapon'), a = equipped('armor');
      const est = estimate();

      if (mapOpen) return mapSheet();

      // 装備選択中は、その判断だけに集中させる
      if (picking) {
        return `${topBar({
          title: picking === 'weapon' ? '武器を選ぶ' : '防具を選ぶ',
          back: 'pick-close', gold: st.data.gold
        })}${pickerSheet()}`;
      }

      const etaText = est === null ? '装備を選ぶと見込みが出る'
        : est.min === est.max ? `見込み ${duration(est.min)}`
        : `見込み ${duration(est.min)}〜${duration(est.max)}`;

      return `
${topBar({
        title: '派遣準備', back: 'back', gold: st.data.gold,
        tier: st.data.tier, running: st.data.dispatches.length
      })}
<div class="stack hero">
  ${when(jobs.length > 1, panel('', `<div class="tabs">${each(jobs, (j, i) =>
        `<div class="tab ${i === jobIdx ? 'on' : ''}" data-tap data-act="job" data-i="${i}">
           ${esc(jobDef(j).name)}${when(st.isBusy(j), ' <span style="color:var(--down)">●</span>')}
         </div>`)}</div>`))}

  ${panel('装備', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
      ${each([['weapon', w], ['armor', a]] as const, ([slot, it]) =>
        it
          ? `<button class="item ${it.rarity}" data-tap data-act="pick-open" data-slot="${slot}">
               <div class="ic">${itemIcon(it)}</div>
               <div class="tx"><div class="n">${esc(it.slot === 'weapon' ? `${itemScore(it)}` : `${it.power}`)}
                 <span style="color:var(--faint);font-size:var(--fs-label)">${slot === 'weapon' ? '秒間' : '防御'}</span></div>
                 <div class="m">${esc(baseDef(it.baseId).name)}</div></div>
             </button>`
          : `<button class="item" data-tap data-act="pick-open" data-slot="${slot}"
                     style="border-color:var(--down)">
               <div class="ic">${slot === 'weapon' ? '⚔' : '🛡'}</div>
               <div class="tx"><div class="n" style="color:var(--down)">${slot === 'weapon' ? '武器' : '防具'}を選ぶ</div></div>
             </button>`)}
    </div>
    ${matchupHint()}
  `)}

  ${potionPanel()}

  ${panel('撤退ルール', `<div class="rules">${each(RETREAT_RULES, r => `
    <div class="rule ${rule === r.id ? 'on' : ''}" style="--rcol:var(--${RULE_TONE[r.id]})"
         data-tap data-act="rule" data-id="${r.id}">
      <div class="n">${esc(r.name)}</div>
      <div class="g">
        <i style="width:${((1 - r.threshold) * 100).toFixed(0)}%"></i>
        ${when(r.threshold > 0, `<u style="left:${(r.threshold * 100).toFixed(0)}%"></u>`)}
      </div>
      <div class="d2">${esc(r.threshold === 0 ? 'HPが0に\nなるまで戦う'
        : `HP${Math.round(r.threshold * 100)}%を\n切ったら帰還`).replace('\n', '<br>')}</div>
    </div>`)}</div>`)}

  ${(() => {
      const cleared = st.data.clearedStages.includes(stage.id);
      return `<button class="summary" data-tap data-act="map-open">
        <span class="micro">派遣先</span>
        <span class="t">${esc(stage.name)}${when(cleared, ' <span style="color:var(--up)">✓</span>')}
          ・ ${unlocked ? esc(duration(stage.minutes * 60)) : `未解放 ${num(stage.unlockCost)}G`}</span>
        <span class="chev">›</span>
      </button>`;
    })()}
</div>
${actionBar(button({
        label: busy ? 'この職は派遣中' : !w || !a ? '装備を選ぶ' : !unlocked ? 'このステージは未解放' : '派遣する',
        act: 'go', tier: 'primary', block: true, role: 'cta',
        disabled: busy || !w || !a || !unlocked
      }),
      `${stage.name} ・ ${retreatRuleDef(rule).name} ・ ${etaText}` +
      (est?.hopeless && unlocked ? '　⚠ 装備が届いていない' : ''))}`;
    },

    act(action, el) {
      const st = nav.state;
      switch (action) {
        case 'back': nav.goBase(); return;
        case 'job': jobIdx = Number(el.dataset.i ?? 0); return;
        case 'rule': rule = (el.dataset.id ?? 'standard') as RetreatRule; return;
        case 'stage':
          stageId = Number(el.dataset.id ?? 1);
          // 所持品の「相性順」がどこへ送るつもりかを知れるようにする
          nav.stageContext = stageId;
          etaKey = '';
          return;
        case 'map-open': mapOpen = true; return;
        case 'map-close': mapOpen = false; return;
        case 'unlock': st.unlockStage(stageId); return;
        case 'pick-open':
          picking = (el.dataset.slot ?? 'weapon') as 'weapon' | 'armor';
          candidate = null;
          return;
        case 'pick': {
          const id = el.dataset.id;
          candidate = st.data.inventory.find(i => i.id === id) ?? null;
          return;
        }
        case 'pick-back': candidate = null; return;
        case 'pick-prev': step(-1); return;
        case 'pick-next': step(1); return;
        case 'sortmode': sortByRaw = el.dataset.i === '1'; return;
        case 'potion': potionId = el.dataset.id || null; return;
        case 'pick-close': picking = null; candidate = null; return;
        case 'equip': {
          if (!candidate || !picking) return;
          const eq = st.data.equipped[job()];
          if (picking === 'weapon') eq.weapon = candidate.id; else eq.armor = candidate.id;
          st.save();
          picking = null;
          candidate = null;
          etaKey = '';
          return;
        }
        case 'go': {
          if (st.dispatch(job(), stageId, rule, nav.now(), potionId)) nav.goBase();
          return;
        }
      }
    },

    tick() {
      nav.state.tick(nav.now());
      return false;
    }
  };
}
