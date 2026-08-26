import type { JobId } from '../../sim/types';
import type { Mood } from '../../world/scenes';
import type { Nav, Screen } from '../shell';
import { jobDef } from '../../data/jobs';
import { stageDef, STAGES } from '../../data/stages';
import type { GameState } from '../../game/state';
import { BASE_TYPES } from '../../data/bases';
import { UNIQUES } from '../../data/uniques';
import { actionBar, button, itemIcon, panel, progress, ring, toasts, topBar } from '../components';
import { BEAT_ICON, BEAT_TONE, beatsSoFar, dispatchBeats } from '../expedition';
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

interface Tile {
  act: string;
  en: string;
  /** 3枚並びのときの短い名前 */
  label: string;
  /** 幅いっぱいのときの名前。狭い枠に合わせて全部を縮めると、
      主役の1枚まで素っ気なくなる */
  wide: string;
  /** 未処理の件数。0 なら押せない */
  count?: (nav: Nav) => number;
  /** 件数が0でも押せる（薬草園は「何も無くても行ける場所」） */
  idleOk?: boolean;
}

/**
 * 拠点のタイル（UI-SPEC §3.3）。
 *
 * 段は「重要度」で決まり、バッジは「件数」を言う——別の軸である。
 * ActionBar が指している行き先のタイルだけを secondary にして、
 * 「下のボタンはこれのことだ」と分かるようにする。
 * 残りは枠を消して沈める。4枚が同じ顔で並んでいると、
 * どれを押せばいいかを毎回プレイヤーが考えることになる。
 */
/**
 * 拠点に出すのは**今すぐ操作するものだけ**（改善指示書 §4）。
 *
 * 所持品・図鑑・次の冒険者は「見ておきたいが今すぐ押すものではない」ので、
 * 詳細ドロワーへ移した。常時フル表示していると、
 * 今やるべきことが3つの中に埋もれる。
 */
const TILES: readonly Tile[] = [
  { act: 'dispatch', en: 'Dispatch', label: '派遣準備', wide: '派遣の準備をする' },
  { act: 'open', en: 'Unopened', label: '開封', wide: '未鑑定品を開封する',
    count: n => n.state.data.pending.length },
  { act: 'report', en: 'Report', label: 'レポート', wide: '帰還レポートを読む',
    count: n => n.state.data.inbox.length },
  // 薬草園。**バッジは未開封と同じ文法**——「そこに未処理がある」を
  // 同じ形で言えば、新しい読み方を覚えずに済む（指示書「既存画面への影響」）
  { act: 'garden', en: 'Garden', label: '薬草園', wide: '薬草園を見る',
    count: n => n.state.readyCount(), idleOk: true }
];

export function baseScreen(nav: Nav): Screen {
  /** 詳細ドロワーを開いているか（§4） */
  let detail = false;

  /**
   * 詳細ドロワー（§4）。今すぐ押さないものを1箇所にまとめる。
   *
   * 拠点の本文と入れ替えず、**上に重ねる**——ここを見るのは
   * 「ついでに確認する」動作であって、画面を移る動作ではない。
   */
  function drawer(hire: ReturnType<GameState['nextSlot']>): string {
    const st = nav.state;
    const kinds = BASE_TYPES.length + UNIQUES.length;
    const found = new Set<string>();
    for (const k of Object.keys(st.data.compendium)) {
      found.add(k.startsWith('unique:') ? k : (k.split('|')[0] ?? k));
    }
    return `
<div class="sheet-back solid" data-act="detail-close"></div>
<div class="drawer">
  <div class="grab"></div>
  ${panel('進み具合', `<div class="rings">
    ${ring({ label: '踏破', value: st.data.clearedStages.length, max: STAGES.length,
             text: `${st.data.clearedStages.length}/${STAGES.length}`, tone: 'up' })}
    ${ring({ label: '図鑑', value: found.size, max: kinds,
             text: `${found.size}`, tone: 'r-rare', act: 'compendium' })}
    ${ring({ label: '所持', value: st.data.inventory.length, max: null,
             warnAt: 150, tone: 'def', act: 'inventory' })}
  </div>
  ${when(st.data.inventory.length >= 150,
    `<div class="hintline">所持品が増えすぎている。売ると金になる</div>`)}`)}

  ${when(hire !== null, panel('次の冒険者', `
    <div class="slot">
      <div class="who">
        <div class="n">${hire ? hire.index + 1 : 0}人目の冒険者</div>
        <div class="s ${hire?.stageDone ? (hire.affordable ? 'idle' : 'lack') : 'warn'}">${
          hire?.stageDone
            ? (hire.affordable ? '雇う準備ができている' : '金が足りない')
            : `ステージ${hire?.needStage}を踏破すると雇える`
        }</div>
      </div>
      <div class="rt"><b>${num(hire?.cost ?? 0)}G</b></div>
    </div>
    ${when(hire?.stageDone, button({
        label: '雇う', act: 'hire', tier: 'secondary', block: true,
        disabled: !hire?.affordable
      }))}
  `))}
</div>
${actionBar(button({ label: '閉じる', act: 'detail-close', tier: 'quiet', block: true }))}`;
  }

  /** 1枚ぶん。ActionBar が指しているものだけ段を1つ上げる */
  function tile(t: Tile, cta: string): string {
    const n = t.count ? t.count(nav) : -1;
    const off = n === 0 && !t.idleOk;
    const main = t.act === cta;
    return `<button class="action ${main ? 'secondary' : ''}"
                    data-tap data-act="${t.act}"${off ? ' disabled' : ''}>
      <span class="micro">${t.en}</span>${esc(main ? t.wide : t.label)}
      ${when(n > 0, `<span class="badge">${n}</span>`)}
    </button>`;
  }

  const notices: string[] = [];
  let lastGold = nav.state.data.gold;
  let lastInbox = nav.state.data.inbox.length;
  let noticeT = 0;
  /** 派遣ごとに、どこまでの出来事を通知したか。同じ場面を二度言わない */
  const toldUpTo = new Map<string, number>();

  /** 通知を積み上げない。古いものは押し出す */
  function notify(text: string): void {
    notices.push(text);
    while (notices.length > 2) notices.shift();
    noticeT = 3.2;
  }

  /**
   * 画面下端に置く「次にやること」（UI-SPEC §3.3）。
   *
   * 拠点の主要動線は状況で変わる。固定の1つを置くと、
   * 未開封が7個あるのに「インベントリを開く」が主役、という嘘になる。
   *
   * 順序は **待機中の冒険者 → 未鑑定品 → 未読レポート → 整理**。
   * 以前は開封を先頭にしていたが、放置ゲームで最も高くつくのは
   * 空いている生産枠のほうである——未鑑定品はいつ開けても中身は同じだが、
   * 待機中の冒険者は待たせた分の時間がそのまま消える。
   * 先に送り出せば、開封している間も裏で時間が進む。
   */
  function nextAction(): { label: string; act: string; why: string } {
    const st = nav.state;
    const idle = st.availableJobs().filter(j => !st.isBusy(j));
    if (idle.length > 0) {
      return {
        label: idle.length > 1 ? `冒険者${idle.length}人を送り出す` : '冒険者を送り出す',
        act: 'dispatch',
        why: idle.length > 1
          ? `${idle.length}人が手を空けている。送り出すまで時間は進まない`
          : '冒険者が手を空けている。送り出すまで時間は進まない'
      };
    }
    if (st.data.pending.length > 0) {
      return {
        label: `未鑑定品 ${st.data.pending.length}個を開封する`, act: 'open',
        why: `未鑑定のまま ${st.data.pending.length}個ある。中身は開けるまで分からない`
      };
    }
    if (st.data.inbox.length > 0) {
      return {
        label: '帰還レポートを読む', act: 'report',
        why: `未読のレポートが ${st.data.inbox.length}件。次の装備の手がかりが書いてある`
      };
    }
    const ready = st.readyCount();
    if (ready > 0) {
      return {
        label: `薬草を ${ready}枠ぶん収穫する`, act: 'garden',
        why: `${ready}枠が育ちきっている。採るまで次を植えられない`
      };
    }
    return {
      label: '所持品を整理する', act: 'inventory',
      why: '全員が潜っている。戻るまでに手持ちを見直しておける'
    };
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
      // 出来事は派遣した時点で確定している（§4）。進行率までのぶんだけ見せる
      const beats = dispatchBeats(run, st.data.results, stage);
      const done = beatsSoFar(beats, p.ratio);
      const now = done[done.length - 1];
      return panel('探索中', `
        <div class="slot">
          <div class="av">${JOB_ICON[jobId]}</div>
          <div class="who">
            <div class="n">${esc(job.name)}</div>
            <div class="s">${esc(stage.name)} ・ ${done.length > 1 ? `${now?.depth ?? 0}層` : '入口'}</div>
          </div>
          <div class="rt">残り<b>${esc(duration(p.remainingSec))}</b></div>
        </div>
        ${progress(p.ratio, undefined,
          beats.map(b => ({ at: b.at, kind: b.kind, passed: b.at <= p.ratio + 1e-6 })))}
        ${when(now, `<div class="beat-now" style="color:var(--${BEAT_TONE[now?.kind ?? 'fight']})">
          <span class="bi bi-${now?.kind}">${BEAT_ICON[now?.kind ?? 'fight']}</span>
          <span>${when(now && now.depth > 0, `${now?.depth}層 ・ `)}${esc(now?.text ?? '')}</span>
        </div>`)}
      `);
    }
    if (!weapon || !armor) {
      return panel('待機中', `
        <div class="slot" data-tap data-act="dispatch">
          <div class="av">${JOB_ICON[jobId]}</div>
          <div class="who">
            <div class="n">${esc(job.name)}</div>
            <div class="s lack">${weapon ? '防具が無い' : armor ? '武器が無い' : '装備が足りない'}</div>
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

    /**
     * 3D 側へ渡す状態（改善指示書 §3-1）。
     * 誰かが潜っていれば家の灯りが落ちる。文字ではなく光で状況を言う。
     */
    get mood(): Mood {
      const st = nav.state;
      const total = Math.max(1, st.availableJobs().length);
      const out = st.data.dispatches.length;
      return { presence: 1 - out / total };
    },

    render() {
      const st = nav.state;
      const jobs = st.availableJobs();
      const hire = st.nextSlot();
      const next = nextAction();

      return `
${topBar({
        title: '拠点', gold: st.data.gold, tier: st.data.tier,
        running: st.data.dispatches.length
      })}
<div class="stack anchor-bottom">
  <div class="nextbanner" data-role="next-why">
    <span class="micro">次にやること</span>
    <span class="t">${esc(next.why)}</span>
  </div>

  ${each(jobs, slot)}

  <div class="actiongrid">
    ${each(TILES, t => tile(t, next.act))}
  </div>

  <button class="moretab" data-tap data-act="detail">
    <span class="ic">▸</span>詳細${when(hire?.affordable, '<span class="dot"></span>')}
  </button>
</div>
${detail
        ? drawer(hire)
        // ドロワーを出している間は本文の ActionBar を出さない。
        // 両方出すと引き出しの上に前の主要動線が乗って、二重に見える
        : actionBar(button({ ...next, tier: 'primary', block: true, role: 'cta' }))}
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
        case 'garden': nav.goGarden(); return;
        case 'detail': detail = true; return;
        case 'detail-close': detail = false; return;
        case 'hire':
          if (st.unlockSlot()) notify('冒険者を雇った');
          return;
      }
    },

    tick(dt) {
      const st = nav.state;
      st.tick(nav.now());

      let changed = false;
      // §5 数値変化はイベントとして扱う。帰還は見ていない間にも起こる
      if (st.data.inbox.length > lastInbox) {
        notify('冒険者が帰還した');
        changed = true;
      }
      if (st.data.gold !== lastGold) changed = true;
      lastInbox = st.data.inbox.length;
      lastGold = st.data.gold;

      // §4 出来事を通過したら軽く知らせる。**操作は求めない**
      for (const d of st.data.dispatches) {
        const beats = dispatchBeats(d, st.data.results, stageDef(d.stageId));
        if (beats.length === 0) continue;
        const n = beatsSoFar(beats, st.progressOf(d).ratio).length;
        const told = toldUpTo.get(d.id) ?? 1;
        if (n > told) {
          const b = beats[n - 1];
          // 出発の1行目は通知しない（自分で押した直後なので分かっている）
          if (b && n > 1) {
            notify(b.depth > 0 ? `${b.depth}層 ・ ${b.text}` : b.text);
            changed = true;
          }
          toldUpTo.set(d.id, n);
        }
      }
      // 帰ってきた派遣の記録は捨てる
      for (const id of [...toldUpTo.keys()]) {
        if (!st.data.dispatches.some(d => d.id === id)) toldUpTo.delete(id);
      }

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
