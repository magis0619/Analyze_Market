import type { GameScreen, Nav } from '../game/app';
import type { Element, Item, JobId, RetreatRule } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSprOr, fillRect, hasSpr, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { drawBtn, hitBtn, inRect, type Btn } from './widgets';
import { RETREAT_RULES, canEquipArmor, jobDef, retreatRuleDef } from '../data/jobs';
import { STAGES, stageDef } from '../data/stages';
import { baseDef } from '../data/bases';
import { dominantElement } from '../sim/items';
import { sfx } from '../render/audio';
import { drawItemRow, elementIconName, elementLabel, itemIconName, itemName, sortItems } from './itemview';
import { formatDuration } from './base';

// 派遣画面（§4.1）。プレイヤーが行う3つの判断——装備・撤退ルール・派遣先——を
// 1画面で完結させる（§10 担当4のベンチマーク観点）。
//
// §6.4: 敵の属性傾向は出撃前に必ず明示する。プレイヤーが装備を選ぶ唯一の
// 手がかりであるため、隠してはならない。

const JOB_SPRITE: Record<JobId, string> = {
  swordsman: 'job_swordsman', guardian: 'job_guardian', skirmisher: 'job_skirmisher'
};

const STAGE_LIST_Y = 226;
const STAGE_LIST_H = 320;
const STAGE_ROW_H = 52;

export class DispatchScreen implements GameScreen {
  private jobIdx = 0;
  private rule: RetreatRule = 'standard';
  private stageId = 1;
  private scroll = 0;
  private dragY: number | null = null;
  private dragged = false;
  /** 装備選択オーバーレイ */
  private picking: 'weapon' | 'armor' | null = null;
  private pickScroll = 0;
  private pickCache: Item[] = [];

  private backBtn: Btn = { x: 8, y: 4, w: 56, h: 20, label: '戻る' };
  private goBtn: Btn = { x: 12, y: VH - 46, w: VW - 24, h: 38, label: '派遣する', accent: true };

  constructor(private nav: Nav) {
    const jobs = this.jobs();
    const free = jobs.findIndex(j => !this.nav.state.isBusy(j));
    this.jobIdx = free >= 0 ? free : 0;
    const unlocked = this.nav.state.data.unlockedStages;
    this.stageId = unlocked.length > 0 ? Math.max(...unlocked) : 1;
  }

  private jobs(): JobId[] { return this.nav.state.availableJobs(); }
  private job(): JobId { return this.jobs()[this.jobIdx] ?? 'swordsman'; }

  update(): void {
    this.nav.state.tick(this.nav.now());
  }

  // -------------------------------------------------------------- 描画

  draw(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawBtn(ctx, this.backBtn, 8);
    drawTextCentered(ctx, '派遣', VW / 2, 8, 12, THEME.text);
    drawTextRight(ctx, `${st.data.gold}G`, VW - 8, 8, 12, THEME.gold);

    this.drawJobTabs(ctx, 30);
    this.drawEquipment(ctx, 56);
    this.drawRules(ctx, 152);
    this.drawStages(ctx);
    this.drawFooter(ctx);

    if (this.picking) this.drawPicker(ctx);
  }

  private drawJobTabs(ctx: CanvasRenderingContext2D, y: number): void {
    const jobs = this.jobs();
    const w = Math.floor((VW - 16) / Math.max(1, jobs.length));
    jobs.forEach((jobId, i) => {
      const x = 8 + i * w;
      const busy = this.nav.state.isBusy(jobId);
      const sel = i === this.jobIdx;
      fillRect(ctx, x, y, w - 2, 22, sel ? THEME.panelLight : THEME.panel);
      if (sel) strokeRect1(ctx, x, y, w - 2, 22, THEME.gold);
      drawTextCentered(ctx, jobDef(jobId).name + (busy ? '(派遣中)' : ''),
        x + w / 2, y + 7, 8, busy ? THEME.red : sel ? THEME.text : THEME.dim);
    });
  }

  private drawEquipment(ctx: CanvasRenderingContext2D, y: number): void {
    const st = this.nav.state;
    const jobId = this.job();
    const job = jobDef(jobId);
    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);
    const stage = stageDef(this.stageId);

    drawNineSlice(ctx, 'frame', 8, y, VW - 16, 90);
    drawSprOr(ctx, hasSpr(JOB_SPRITE[jobId]) ? JOB_SPRITE[jobId] : 'portrait', 'portrait', 14, y + 6, 2);
    drawText(ctx, job.name, 50, y + 8, 8, THEME.text);
    drawText(ctx, `HP ${job.hp}`, 50, y + 20, 8, THEME.dim);

    // 武器・防具の2枠（タップで変更）
    const slots: ['weapon' | 'armor', Item | null][] = [['weapon', weapon], ['armor', armor]];
    slots.forEach(([slot, item], i) => {
      const sx = 100 + i * 124;
      const sw = 118;
      fillRect(ctx, sx, y + 6, sw, 36, THEME.outline);
      if (item) {
        drawSprOr(ctx, itemIconName(item), 'icon_W1', sx + 3, y + 12);
        drawText(ctx, itemName(item), sx + 22, y + 10, 8, THEME.text);
        drawText(ctx, item.slot === 'weapon'
          ? `秒間${Math.round(item.power * item.speed)}` : `防御${item.power}`,
          sx + 22, y + 24, 8, THEME.dim);
      } else {
        drawTextCentered(ctx, slot === 'weapon' ? '武器を選ぶ' : '防具を選ぶ', sx + sw / 2, y + 18, 8, THEME.red);
      }
      strokeRect1(ctx, sx, y + 6, sw, 36, THEME.panelLight);
    });

    // 装備とステージの噛み合いを明示する（§6.4 の趣旨：判断の手がかりを隠さない）
    drawTextWrapped(ctx, this.matchupHint(weapon, armor, stage.resists, stage.weakTo,
      stage.enemyElement === 'mixed' ? null : stage.enemyElement),
      14, y + 50, VW - 32, 8, THEME.gold, 3);
  }

  /** 装備とステージ属性の噛み合いを1〜3行で説明する。 */
  private matchupHint(
    weapon: Item | null, armor: Item | null,
    resists: readonly Element[], weakTo: Element | null, enemyElem: Element | null
  ): string {
    const parts: string[] = [];
    if (weapon) {
      const dom = dominantElement(weapon.element);
      if (resists.includes(dom)) {
        parts.push(`⚠ ${elementLabel(dom)}はこのステージの耐性属性。火力が半減する`);
      } else if (weakTo && dom === weakTo) {
        parts.push(`◎ ${elementLabel(dom)}は弱点属性。火力が1.5倍になる`);
      } else if (weakTo) {
        parts.push(`弱点は${elementLabel(weakTo)}。${elementLabel(dom)}武器では等倍どまり`);
      }
    }
    if (enemyElem) {
      const hasResist = armor?.affixes.some(a => a.kind === 'resistPct' && a.element === enemyElem);
      parts.push(hasResist
        ? `◎ 防具が${elementLabel(enemyElem)}耐性を持つ。被弾を抑えられる`
        : `敵は${elementLabel(enemyElem)}属性で攻めてくる`);
    }
    return parts.join('　');
  }

  private drawRules(ctx: CanvasRenderingContext2D, y: number): void {
    drawText(ctx, '撤退ルール', 10, y, 8, THEME.dim);
    const w = Math.floor((VW - 24) / 3);
    RETREAT_RULES.forEach((r, i) => {
      const x = 10 + i * (w + 2);
      const sel = this.rule === r.id;
      fillRect(ctx, x, y + 12, w, 24, sel ? THEME.panelLight : THEME.panel);
      if (sel) strokeRect1(ctx, x, y + 12, w, 24, THEME.gold);
      drawTextCentered(ctx, r.name, x + w / 2, y + 19, 8, sel ? THEME.gold : THEME.dim);
    });
    drawText(ctx, retreatRuleDef(this.rule).desc, 10, y + 40, 8, THEME.dim);
  }

  private drawStages(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    drawText(ctx, '派遣先', 10, STAGE_LIST_Y - 12, 8, THEME.dim);
    ctx.save();
    ctx.beginPath();
    ctx.rect(8, STAGE_LIST_Y, VW - 16, STAGE_LIST_H);
    ctx.clip();

    const first = Math.max(0, Math.floor(this.scroll / STAGE_ROW_H));
    const last = Math.min(STAGES.length - 1, first + Math.ceil(STAGE_LIST_H / STAGE_ROW_H) + 1);
    for (let i = first; i <= last; i++) {
      const stage = STAGES[i];
      if (!stage) continue;
      const y = STAGE_LIST_Y + i * STAGE_ROW_H - this.scroll;
      const unlocked = st.data.unlockedStages.includes(stage.id);
      const cleared = st.data.clearedStages.includes(stage.id);
      const sel = this.stageId === stage.id;

      fillRect(ctx, 8, y, VW - 16, STAGE_ROW_H - 3, sel ? THEME.panelLight : THEME.panel);
      if (sel) strokeRect1(ctx, 8, y, VW - 16, STAGE_ROW_H - 3, THEME.gold);

      drawSprOr(ctx, `stage_${stage.id}`, 'icon_T1', 12, y + 4);
      drawText(ctx, `${stage.id}. ${stage.name}`, 32, y + 4, 8,
        unlocked ? (sel ? THEME.gold : THEME.text) : THEME.dim);
      drawText(ctx, formatDuration(stage.minutes * 60), 32, y + 17, 8, THEME.dim);

      if (!unlocked) {
        // 未解放の行は情報を重ねない。半透明で覆うと下の属性表示が透けて
        // 読めない塊になるため、そもそも描かずに解放条件だけを出す。
        const canBuy = st.data.gold >= stage.unlockCost
          && (stage.id === 1 || st.data.clearedStages.includes(stage.id - 1));
        drawSprOr(ctx, 'icon_lock', 'icon_A3', 118, y + 12);
        drawText(ctx, `解放 ${stage.unlockCost}G`, 140, y + 8, 12,
          canBuy ? THEME.gold : THEME.dim);
        drawTextRight(ctx,
          stage.id > 1 && !st.data.clearedStages.includes(stage.id - 1)
            ? `ステージ${stage.id - 1}のクリアが必要`
            : canBuy ? 'タップで解放' : '資金が足りない',
          VW - 12, y + 30, 8, canBuy ? THEME.text : THEME.dim);
        continue;
      }

      if (cleared) drawSprOr(ctx, 'icon_check', 'star', 116, y + 5);

      // §6.4 敵の属性傾向をアイコンで明示する
      let ex = 150;
      const tag = (label: string, e: Element | null, color: string): void => {
        drawText(ctx, label, ex, y + 4, 8, THEME.dim);
        ex += label.length * 9 + 2;
        if (e) {
          if (hasSpr(elementIconName(e))) { drawSprOr(ctx, elementIconName(e), 'star', ex, y + 3); ex += 10; }
          drawText(ctx, elementLabel(e), ex, y + 4, 8, color);
          ex += 22;
        } else {
          drawText(ctx, stage.enemyElement === 'mixed' ? '複合' : '—', ex, y + 4, 8, color);
          ex += 22;
        }
      };
      tag('敵', stage.enemyElement === 'mixed' ? null : stage.enemyElement, THEME.red);
      tag('弱点', stage.weakTo, THEME.green);
      if (stage.resists.length > 0) {
        drawText(ctx, `耐性 ${stage.resists.map(elementLabel).join('・')}`, 150, y + 17, 8, THEME.red);
      }
      drawText(ctx, `遭遇${stage.encounters}`, 150, y + 30, 8, THEME.dim);
      drawTextRight(ctx, stage.dropBias === 'weapon' ? '武器寄り'
        : stage.dropBias === 'armor' ? '防具寄り' : '均等', VW - 12, y + 30, 8, THEME.dim);
    }
    ctx.restore();
  }

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const jobId = this.job();
    const busy = st.isBusy(jobId);
    const eq = st.data.equipped[jobId];
    const ready = !!st.itemById(eq.weapon) && !!st.itemById(eq.armor);
    const unlocked = st.data.unlockedStages.includes(this.stageId);
    const stage = stageDef(this.stageId);
    const job = jobDef(jobId);
    const eta = stage.minutes * 60 * job.timeMul;

    fillRect(ctx, 0, VH - 74, VW, 74, THEME.bg);
    drawText(ctx,
      `${stage.name}／${retreatRuleDef(this.rule).name}／所要 約${formatDuration(eta)}`,
      12, VH - 66, 8, THEME.dim);
    this.goBtn.disabled = busy || !ready || !unlocked;
    this.goBtn.label = busy ? 'この職は派遣中'
      : !ready ? '武器と防具を選ぶ'
      : !unlocked ? 'このステージは未解放'
      : '派遣する';
    drawBtn(ctx, this.goBtn, 12);
  }

  // -------------------------------------------------------------- 装備選択

  private pickerItems(): Item[] {
    const st = this.nav.state;
    const jobId = this.job();
    const job = jobDef(jobId);
    const slot = this.picking;
    if (!slot) return [];
    const list = st.data.inventory.filter(i =>
      i.slot === slot && (slot === 'weapon' || canEquipArmor(job, baseDef(i.baseId).tags))
    );
    return sortItems(list, 'power');
  }

  private drawPicker(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const jobId = this.job();
    const eq = st.data.equipped[jobId];
    const current = st.itemById(this.picking === 'weapon' ? eq.weapon : eq.armor);
    ctx.fillStyle = 'rgba(13,10,18,0.86)';
    ctx.fillRect(0, 0, VW, VH);
    drawNineSlice(ctx, 'frame', 6, 40, VW - 12, VH - 96);
    drawTextCentered(ctx, this.picking === 'weapon' ? '武器を選ぶ' : '防具を選ぶ',
      VW / 2, 50, 12, THEME.gold);
    if (this.picking === 'armor' && jobDef(jobId).armorRestriction.length > 0) {
      drawTextCentered(ctx, `${jobDef(jobId).name}は${jobDef(jobId).armorRestriction.includes('heavy') ? '重' : '軽'}防具のみ装備できる`,
        VW / 2, 66, 8, THEME.dim);
    }

    const list = this.pickCache;
    const top = 82, viewH = VH - 150, rowH = 36;
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, top, VW - 20, viewH);
    ctx.clip();
    const first = Math.max(0, Math.floor(this.pickScroll / rowH));
    const last = Math.min(list.length - 1, first + Math.ceil(viewH / rowH) + 1);
    for (let i = first; i <= last; i++) {
      const it = list[i];
      if (!it) continue;
      const y = top + i * rowH - this.pickScroll;
      drawItemRow(ctx, it, 12, y, VW - 24, rowH - 3, {
        selected: current?.id === it.id,
        compareTo: current && current.id !== it.id ? current : null
      });
    }
    ctx.restore();
    if (list.length === 0) {
      drawTextCentered(ctx, '装備できる品がない', VW / 2, top + 40, 12, THEME.dim);
    }
    drawTextCentered(ctx, 'タップで装備／画面外で閉じる', VW / 2, VH - 62, 8, THEME.dim);
  }

  // -------------------------------------------------------------- 入力

  pointerDown(px: number, py: number): void {
    if (this.picking) {
      this.dragY = py;
      this.dragged = false;
      return;
    }
    this.dragY = py;
    this.dragged = false;
    if (hitBtn(this.backBtn, px, py)) { sfx('tap'); this.nav.goBase(); return; }

    // 職タブ
    const jobs = this.jobs();
    const tw = Math.floor((VW - 16) / Math.max(1, jobs.length));
    for (let i = 0; i < jobs.length; i++) {
      if (inRect(px, py, 8 + i * tw, 30, tw - 2, 22)) {
        this.jobIdx = i; sfx('tap'); return;
      }
    }

    // 装備枠
    for (let i = 0; i < 2; i++) {
      if (inRect(px, py, 100 + i * 124, 62, 118, 36)) {
        this.picking = i === 0 ? 'weapon' : 'armor';
        this.pickCache = this.pickerItems();
        this.pickScroll = 0;
        sfx('tap');
        return;
      }
    }

    // 撤退ルール
    const rw = Math.floor((VW - 24) / 3);
    for (let i = 0; i < RETREAT_RULES.length; i++) {
      if (inRect(px, py, 10 + i * (rw + 2), 164, rw, 24)) {
        const r = RETREAT_RULES[i];
        if (r) { this.rule = r.id; sfx('tap'); }
        return;
      }
    }

    if (hitBtn(this.goBtn, px, py)) {
      const ok = this.nav.state.dispatch(this.job(), this.stageId, this.rule, this.nav.now());
      if (ok) { sfx('depart'); this.nav.goBase(); }
      else sfx('deny');
      return;
    }
  }

  pointerMove(_px: number, py: number): void {
    if (this.dragY === null) return;
    const dy = this.dragY - py;
    if (Math.abs(dy) > 3) this.dragged = true;
    if (this.picking) {
      const maxScroll = Math.max(0, this.pickCache.length * 36 - (VH - 150));
      this.pickScroll = Math.max(0, Math.min(maxScroll, this.pickScroll + dy));
    } else {
      const maxScroll = Math.max(0, STAGES.length * STAGE_ROW_H - STAGE_LIST_H);
      this.scroll = Math.max(0, Math.min(maxScroll, this.scroll + dy));
    }
    this.dragY = py;
  }

  pointerUp(px: number, py: number): void {
    const wasDragging = this.dragged;
    this.dragY = null;
    this.dragged = false;
    if (wasDragging) return;

    if (this.picking) {
      const top = 82, viewH = VH - 150, rowH = 36;
      if (py >= top && py < top + viewH && px >= 12 && px < VW - 12) {
        const idx = Math.floor((py - top + this.pickScroll) / rowH);
        const it = this.pickCache[idx];
        if (it) {
          const eq = this.nav.state.data.equipped[this.job()];
          if (this.picking === 'weapon') eq.weapon = it.id; else eq.armor = it.id;
          this.nav.state.save();
          sfx('confirm');
        }
      }
      this.picking = null;
      return;
    }

    // ステージ選択・解放
    if (py >= STAGE_LIST_Y && py < STAGE_LIST_Y + STAGE_LIST_H) {
      const idx = Math.floor((py - STAGE_LIST_Y + this.scroll) / STAGE_ROW_H);
      const stage = STAGES[idx];
      if (!stage) return;
      const st = this.nav.state;
      if (st.data.unlockedStages.includes(stage.id)) {
        this.stageId = stage.id;
        sfx('tap');
      } else if (st.unlockStage(stage.id)) {
        this.stageId = stage.id;
        sfx('levelup');
      } else {
        sfx('deny');
      }
    }
  }
}
