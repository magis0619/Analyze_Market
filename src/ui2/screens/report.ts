import type { Item, RunResult, StageDef } from '../../sim/types';
import type { Mood } from '../../world/scenes';
import type { Nav, Screen } from '../shell';
import { jobDef, retreatRuleDef } from '../../data/jobs';
import { bossName, stageDef } from '../../data/stages';
import { potionDef, potionForElement } from '../../data/garden';
import { dominantElement } from '../../sim/items';
import {
  actionBar, button, elementLabel, figures, itemRow, panel, toasts, topBar
} from '../components';
import { BEAT_ICON, BEAT_TONE, beatsOf } from '../expedition';
import { each, esc, num, when } from '../dom';

// 帰還レポート（docs/UI-SPEC.md §2.5）。
//
// **見どころ3行がこの画面で最も重要**（仕様書 §7.3）。
// なぜその結果になったかが分からないと、完全な運ゲーに感じられる。
// 到達深度は 3D 側（descent シーン）が光の帯で示すので、ここでは数字だけ扱う。

/** 竪坑の光の色。派遣準備の入口と同じ対応（§3-2 と揃える） */
const STAGE_LIGHT: Record<string, number> = {
  physical: 0x9fb0d0, fire: 0xff8348, ice: 0x6fc7ff,
  lightning: 0xe9be74, poison: 0x7ddc8a, mixed: 0xa77dff
};

export function reportScreen(nav: Nav, dispatchId: string): Screen {
  const st = nav.state;
  const result: RunResult | null = st.data.results[dispatchId] ?? null;
  const info = st.dispatchInfo(dispatchId);
  const stage: StageDef = stageDef(info?.stageId ?? 1);
  const died = result?.outcome === 'death';

  const notices: string[] = [];
  let noticeT = 0;
  let announced = false;
  let t = 0;

  /**
   * 次の一手（設計書 §7.3 の延長）。
   *
   * **その回の実数から引く。** 「装備を強化しよう」のような一般論は書かない——
   * それは何も言っていないのと同じで、分かっても手が打てない。
   */
  function advice(): string[] {
    if (!result) return [];
    const lost = st.data.lost[dispatchId] ?? [];
    const weapon = st.itemById(info?.weaponId ?? null) ?? lost.find(i => i.slot === 'weapon') ?? null;
    const armor = st.itemById(info?.armorId ?? null) ?? lost.find(i => i.slot === 'armor') ?? null;
    const out: string[] = [];

    if (weapon) {
      const dom = dominantElement(weapon.element);
      if (stage.resists.includes(dom)) {
        out.push(stage.weakTo
          ? `${elementLabel(dom)}は${stage.name}の耐性属性で火力が半減する。${elementLabel(stage.weakTo)}の武器なら1.5倍になる`
          : `${elementLabel(dom)}は${stage.name}の耐性属性。別の属性の武器に持ち替えたい`);
      } else if (stage.weakTo && dom !== stage.weakTo) {
        out.push(`${stage.name}の弱点は${elementLabel(stage.weakTo)}。${elementLabel(stage.weakTo)}寄りの武器なら火力が1.5倍になる`);
      }
    }
    const enemyElem = stage.enemyElement === 'mixed' ? null : stage.enemyElement;
    if (enemyElem && armor && !armor.affixes.some(a => a.kind === 'resistPct' && a.element === enemyElem)) {
      out.push(`敵は${elementLabel(enemyElem)}で攻めてくる。${elementLabel(enemyElem)}耐性の付いた防具を探すと生存が伸びる`);
    }
    if (died && info?.retreatRule === 'reckless') {
      out.push('深追いはHP0まで戦う。標準か慎重にしておけば、装備を失わずに戦利品を持ち帰れた');
    }
    if (result.depth / Math.max(1, result.encountersTotal) < 0.35) {
      out.push('装備がこの階層に届いていない。一段浅いステージを回して稼ぐのが近道');
    }
    // 薬草園。効く薬を持たずに削られた回は、それを言う
    if (!info?.potionId && stage.enemyElement !== 'mixed') {
      const p = potionForElement(stage.enemyElement);
      if (p) out.push(`${elementLabel(stage.enemyElement)}の敵には《${p.name}》が効く。薬草園で作れる`);
    }
    return out.slice(0, 3);
  }

  return {
    // 到達深度に応じて松明が灯る。深く潜ったほど下まで光る
    scene: 'report',

    /**
     * 3D 側へ渡す状態（改善指示書 §3-4）。
     *
     * 派遣先の属性で竪坑の光の色が変わり、**追い詰められた回ほど
     * 松明が不安定に揺れる**。数字を読む前に「どういう回だったか」が伝わる。
     */
    get mood(): Mood {
      const worst = result ? Math.min(...result.hpCurve) : 1;
      return {
        accent: STAGE_LIGHT[stage.enemyElement] ?? 0xff8348,
        intensity: died ? 1 : Math.max(0, Math.min(1, 1 - worst))
      };
    },

    render() {
      if (!result) {
        return `${topBar({ title: '帰還レポート', gold: st.data.gold })}
<div class="stack"><div class="panel"><div class="body">レポートが見つからない</div></div></div>
${actionBar(button({ label: '拠点へ戻る', act: 'done', tier: 'quiet', block: true, role: 'cta' }))}`;
      }

      const r = result;
      // §4「帰還後に見せるだけ」。派遣中に操作は求めないが、
      // どこで何が起きたかは後から辿れるようにする
      const beats = beatsOf(r, stage);
      const potion = info?.potionId ? potionDef(info.potionId) : null;
      const lost: Item[] = st.data.lost[dispatchId] ?? [];
      const tips = advice();
      // 戦利品があるなら開封が次の一手。無ければ帰るだけなので段を落とす
      const hasLoot = !died && r.loot.length > 0;
      const tone = died ? 'down' : r.bossDefeated ? 'up' : 'gold';

      return `
${topBar({ title: '帰還レポート', gold: st.data.gold, meta: stage.name })}
<div class="stack hero">

  ${when(died, `<div class="banner">
    <span>戦　死</span>
  </div>`)}

  ${panel('', `
    <div data-role="headline" style="display:flex;align-items:baseline;gap:var(--sp-2);flex-wrap:wrap">
      <span class="en" style="font-size:var(--fs-display);color:var(--${tone})">${esc(r.headline.split('／')[0] ?? '')}</span>
      <span style="font-size:var(--fs-label);color:var(--faint)">${r.depth} / ${r.encountersTotal}</span>
    </div>
    ${when(r.headline.includes('／'),
      `<div style="font-size:var(--fs-label);color:var(--dim);margin-top:var(--sp-1)">${esc(r.headline.split('／').slice(1).join('／'))}</div>`)}
  `, 'raised')}

  ${panel('見どころ', `<div class="beats">${each(r.highlights, (h, i) =>
        `<div class="beat ${i === 0 ? 'key' : ''}"><i></i><span>${esc(h)}</span></div>`)}</div>`)}

  ${when(beats.length > 2, panel('道中', `
    <div class="trail">${each(beats, b =>
        `<div class="tr" style="color:var(--${BEAT_TONE[b.kind]})">
           <span class="bi bi-${b.kind}">${BEAT_ICON[b.kind]}</span>
           <span class="d">${b.depth}</span><span class="tx">${esc(b.text)}</span></div>`)}</div>
  `))}

  ${when(potion !== null, panel('持たせた薬', `
    <div class="item">
      <div class="ic ${potion?.element}">薬</div>
      <div class="tx">
        <div class="n">${esc(potion?.name ?? '')}</div>
        <div class="m">${esc(potion?.text ?? '')}</div>
      </div>
      <div class="rr" style="color:var(--${(r.stats.potionSaved ?? 0) > 0 ? 'up' : 'faint'})">${
        (r.stats.potionSaved ?? 0) > 0 ? `-${num(r.stats.potionSaved)}` : '出番なし'}</div>
    </div>
  `))}

  ${panel('この回の数字', figures([
        ['与えた', num(r.stats.dealt)],
        ['受けた', num(r.stats.taken)],
        ['撃破', `${r.stats.kills}`]
      ]) + figures([
        ['会心', `${r.stats.crits}/${r.stats.hits}`],
        ['最大の一撃', num(r.stats.biggestHit)],
        ['回避', `${r.stats.evaded}`]
      ]))}

  ${when(tips.length > 0, panel('次の一手', `<div class="beats">${each(tips, x =>
        `<div class="beat"><i style="background:var(--up)"></i><span>${esc(x)}</span></div>`)}</div>`))}

  ${died
        ? panel('失ったもの', `
      <div class="list">${each(lost, it => itemRow({ item: it }))}</div>
      ${when(lost.length === 0, '<div class="empty">装備していた2点</div>')}
      ${when(r.loot.length > 0 || r.gold > 0, `
        <div style="margin-top:var(--sp-2);padding-top:var(--sp-2);border-top:1px solid var(--line);
                    font-size:var(--fs-label);color:var(--down)">
          ${when(r.loot.length > 0, `未鑑定品 ${r.loot.length}個も失われた<br>`)}
          ${when(r.gold > 0, `持ち帰るはずだった ${num(r.gold)}G`)}
        </div>`)}
      <div style="margin-top:var(--sp-2);font-size:var(--fs-label);color:var(--dim);line-height:1.55">
        冒険者本人は無事に帰還した。最低限の装備は支給される。
      </div>
    `)
        : panel('戦利品', `
      <div class="list">${each(r.loot.slice(0, 4), () =>
          // レアリティのクラスを付けない。左端の色帯で中身が分かってしまい、
          // 開封の意味が無くなる（§7.4 開けるまで分からないこと）
          `<div class="item">
             <div class="ic">?</div>
             <div class="tx"><div class="n">未鑑定品</div><div class="m">開封すると分かる</div></div>
           </div>`)}</div>
      ${when(r.loot.length > 4,
          `<div style="text-align:center;font-size:var(--fs-label);color:var(--faint);margin-top:var(--sp-2)">ほか ${r.loot.length - 4}個</div>`)}
      <div class="row" style="margin-top:var(--sp-2)">
        <span class="l">持ち帰った金</span>
        <span class="r"><span class="v" style="color:var(--gold)">${num(r.gold)}G</span></span>
      </div>
    `)}

  ${panel('', `<div style="font-size:var(--fs-label);color:var(--faint);text-align:center">
    ${esc(info ? jobDef(info.jobId).name : '')} ・ ${esc(info ? retreatRuleDef(info.retreatRule).name : '')}
    ・ ${esc(bossName(stage.id))}${r.bossDefeated ? ' 撃破' : ' 未到達'}
  </div>`)}
</div>
${actionBar(button({
        label: hasLoot ? `未鑑定品 ${r.loot.length}個を開封する` : '拠点へ戻る',
        act: 'done', tier: hasLoot ? 'primary' : 'quiet', block: true, role: 'cta'
      }))}
${toasts(notices)}`;
    },

    act(action) {
      if (action !== 'done') return;
      st.data.inbox = st.data.inbox.filter(id => id !== dispatchId);
      st.save();
      if (result && !died && st.data.pending.length > 0) nav.goOpening(st.data.pending);
      else nav.goBase();
    },

    tick(dt) {
      t += dt;
      let changed = false;
      // §5 数値変化はイベントとして扱う。開いた直後に1回だけ稼ぎを立てる
      if (!announced && t > 0.35) {
        announced = true;
        if (result && !died) {
          if (result.gold > 0) notices.push(`+${num(result.gold)}G`);
          if (result.loot.length > 0) notices.push(`未鑑定品 ${result.loot.length}個`);
        } else if (result) {
          notices.push('装備2点を失った');
        }
        noticeT = 2.4;
        changed = true;
      }
      if (noticeT > 0) {
        noticeT -= dt;
        if (noticeT <= 0) { notices.length = 0; changed = true; }
      }
      return changed;
    }
  };
}
