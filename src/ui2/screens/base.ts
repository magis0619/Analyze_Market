import type { JobId } from '../../sim/types';
import type { Nav, Screen } from '../shell';
import { jobDef } from '../../data/jobs';
import { stageDef, STAGES } from '../../data/stages';
import { actionBar, button, itemIcon, panel, progress, toasts, topBar } from '../components';
import { duration, each, esc, num, when } from '../dom';

// 拠点（docs/UI-SPEC.md §2.2）。
//
// このゲームは戦闘を見せない設計なので、「ゲームが今なにをしているのか」を
// 答える場所はここしかない（設計書 §9）。派遣スロットが、誰が・どこへ・
// あと何分か、を必ず1行で示すこと。

// 職ごとの1文字。絵文字（⚔🛡🗡）は環境によって細い×印に潰れ、
// 3人並べても見分けがつかなくなる（一覧のアイコンと同じ理由）。
const JOB_ICON: Record<JobId, string> = {
  swordsman: '剣', guardian: '守', skirmisher: '遊'
};

export function baseScreen(nav: Nav): Screen {
  const notices: string[] = [];
  let lastGold = nav.state.data.gold;
  let lastInbox = nav.state.data.inbox.length;
  let noticeT = 0;

  /**
   * 画面下端に置く「次にやること」（設計書 §18「次に何をすればいいかが常に分かる」）。
   *
   * 拠点の主要動線は状況で変わる。固定の1つを置くと、
   * 未開封が7個あるのに「インベントリを開く」が主役、という嘘になる。
   * 未開封 → 未読レポート → 待機中がいる → それ以外、の順で選ぶ。
   */
  function nextAction(): { label: string; act: string } {
    const st = nav.state;
    if (st.data.pending.length > 0) {
      return { label: `未鑑定品 ${st.data.pending.length}個を開封する`, act: 'open' };
    }
    if (st.data.inbox.length > 0) {
      return { label: '帰還レポートを読む', act: 'report' };
    }
    const idle = st.availableJobs().filter(j => !st.isBusy(j));
    if (idle.length > 0) return { label: '派遣の準備をする', act: 'dispatch' };
    return { label: '所持品を整理する', act: 'inventory' };
  }

  /** 冒険者1人ぶん。状態は3つだけ（潜行中／待機中／装備不足）。 */
  function slot(jobId: JobId): string {
    const st = nav.state;
    const job = jobDef(jobId);
    const run = st.data.dispatches.find(d => d.jobId === jobId);
    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);

    if (run) {
      const p = st.progressOf(run);
      const stage = stageDef(run.stageId);
      return panel('探索中', `
        <div class="slot">
          <div class="av">${JOB_ICON[jobId]}</div>
          <div class="who">
            <div class="n">${esc(job.name)}</div>
            <div class="s">${esc(stage.name)} へ潜行中</div>
          </div>
          <div class="rt">残り<b>${esc(duration(p.remainingSec))}</b></div>
        </div>
        ${progress(p.ratio)}
      `);
    }
    if (!weapon || !armor) {
      return panel('待機中', `
        <div class="slot" data-tap data-act="dispatch">
          <div class="av">${JOB_ICON[jobId]}</div>
          <div class="who">
            <div class="n">${esc(job.name)}</div>
            <div class="s warn">${weapon ? '防具が無い' : armor ? '武器が無い' : '装備が足りない'}</div>
          </div>
          <div class="rt" style="color:var(--down)">整える ›</div>
        </div>
      `);
    }
    return panel('待機中', `
      <div class="slot" data-tap data-act="dispatch">
        <div class="av">${JOB_ICON[jobId]}</div>
        <div class="who">
          <div class="n">${esc(job.name)}</div>
          <div class="s idle">${itemIcon(weapon)} ${esc(String(Math.round(weapon.power * weapon.speed)))}
            ・ ${itemIcon(armor)} ${esc(String(armor.power))} ・ いつでも出せる</div>
        </div>
        <div class="rt" style="color:var(--gold)">出発 ›</div>
      </div>
    `);
  }

  return {
    scene: 'base',

    render() {
      const st = nav.state;
      const jobs = st.availableJobs();
      const inbox = st.data.inbox.length;
      const pending = st.data.pending.length;
      const next = st.nextSlot();

      return `
${topBar({
        title: '拠点', gold: st.data.gold, tier: st.data.tier,
        running: st.data.dispatches.length
      })}
<div class="stack anchor-bottom">
  ${each(jobs, slot)}

  <div class="actiongrid">
    <button class="action primary" data-tap data-act="open" ${pending === 0 ? 'disabled' : ''}>
      <span class="micro">Unopened</span>未鑑定品を開封
      ${when(pending > 0, `<span class="badge">${pending}</span>`)}
    </button>
    <button class="action" data-tap data-act="report" ${inbox === 0 ? 'disabled' : ''}>
      <span class="micro">Report</span>帰還レポート
      ${when(inbox > 0, `<span class="badge">${inbox}</span>`)}
    </button>
    <button class="action" data-tap data-act="dispatch"><span class="micro">Dispatch</span>派遣準備</button>
    <button class="action" data-tap data-act="inventory"><span class="micro">Inventory</span>インベントリ</button>
  </div>

  ${when(next !== null, panel('', `
    <div class="slot">
      <div class="who">
        <div class="n">${next ? next.index + 1 : 0}人目の冒険者</div>
        <div class="s ${next?.stageDone ? 'idle' : 'warn'}">${
          next?.stageDone
            ? (next.affordable ? '雇う準備ができている' : '金が足りない')
            : `ステージ${next?.needStage}を踏破すると雇える`
        }</div>
      </div>
      <div class="rt"><b>${num(next?.cost ?? 0)}G</b></div>
    </div>
    ${when(next?.stageDone, button({
        label: '雇う', act: 'hire', primary: true, block: true,
        disabled: !next?.affordable
      }))}
  `))}

  ${panel('', `<div class="figs">
    <div class="fig"><div class="micro">踏破</div>
      <div class="v" style="color:var(--up)">${st.data.clearedStages.length}/${STAGES.length}</div></div>
    <div class="fig" data-tap data-act="compendium"><div class="micro">図鑑 ›</div>
      <div class="v">${Object.keys(st.data.compendium).length}</div></div>
    <div class="fig" data-tap data-act="inventory"><div class="micro">所持 ›</div>
      <div class="v">${st.data.inventory.length}</div></div>
  </div>`)}
</div>
${actionBar(button({ ...nextAction(), primary: true, block: true, role: 'cta' }))}
${toasts(notices)}`;
    },

    act(action) {
      const st = nav.state;
      switch (action) {
        case 'open':
          if (st.data.pending.length > 0) nav.goOpening(st.data.pending);
          return;
        case 'report': {
          const id = st.data.inbox[0];
          if (id) nav.goReport(id);
          return;
        }
        case 'dispatch': nav.goDispatch(); return;
        case 'inventory': nav.goInventory(); return;
        case 'compendium': nav.goCompendium(); return;
        case 'hire':
          if (st.unlockSlot()) notices.push('冒険者を雇った');
          noticeT = 2.4;
          return;
      }
    },

    tick(dt) {
      const st = nav.state;
      st.tick(nav.now());

      let changed = false;
      // §5 数値変化はイベントとして扱う。帰還は見ていない間にも起こる
      if (st.data.inbox.length > lastInbox) {
        notices.push('冒険者が帰還した');
        noticeT = 2.4;
        changed = true;
      }
      if (st.data.gold !== lastGold) changed = true;
      lastInbox = st.data.inbox.length;
      lastGold = st.data.gold;

      if (noticeT > 0) {
        noticeT -= dt;
        if (noticeT <= 0) { notices.length = 0; changed = true; }
      }
      // 残り時間の表示は1秒ごとでよい（毎フレーム書き換えない）
      if (st.data.dispatches.length > 0) {
        this.secT = (this.secT ?? 0) + dt;
        if (this.secT >= 1) { this.secT = 0; changed = true; }
      }
      return changed;
    },

    secT: 0
  } as Screen & { secT: number };
}
