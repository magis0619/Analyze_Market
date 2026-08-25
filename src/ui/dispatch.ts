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
// 手がかりであるため、隠してはならない。ステージ一覧の右に常時、選択中の
// ステージの敵属性・有効属性・ドロップ傾向を出す。

const JOB_SPRITE: Record<JobId, string> = {
  swordsman: 'job_swordsman', guardian: 'job_guardian', skirmisher: 'job_skirmisher'
};

const CARD_Y = 56;
const CARD_H = 86;
const RULE_Y = 154;
const RULE_H = 58;
const STAGE_Y = 232;
const STAGE_H = 326;
const STAGE_ROW_H = 44;
const LIST_W = 190;
const PANEL_X = 8 + LIST_W + 6;
const PANEL_W = VW - PANEL_X - 8;
const SLOT_X = 106;
const SLOT_W = 120;
const SLOT_H = 40;

/** 撤退ルールの色（慎重＝緑／標準＝金／深追い＝赤）。 */
const RULE_COLOR: Record<RetreatRule, string> = {
  cautious: THEME.green,
  standard: THEME.gold,
  reckless: THEME.red
};

const RULE_COND: Record<RetreatRule, string> = {
  reckless: 'HPが0に\nなるまで戦う',
  standard: 'HP30%を\n切ったら帰還',
  cautious: 'HP50%を\n切ったら帰還'
};

export class DispatchScreen implements GameScreen {
  private jobIdx = 0;
  private rule: RetreatRule = 'standard';
  private stageId = 1;
  private scroll = 0;
  private dragY: number | null = null;
  private dragged = false;
  private picking: 'weapon' | 'armor' | null = null;
  private pickScroll = 0;
  private pickCache: Item[] = [];
  private readonly pickRowH = 40;

  private backBtn: Btn = { x: 8, y: 4, w: 64, h: 20, label: '戻る' };
  private goBtn: Btn = { x: 12, y: VH - 44, w: VW - 24, h: 36, label: '派遣する', accent: true };

  constructor(private nav: Nav) {
    const jobs = this.jobs();
    const free = jobs.findIndex(j => !this.nav.state.isBusy(j));
    this.jobIdx = free >= 0 ? free : 0;
    const unlocked = this.nav.state.data.unlockedStages;
    this.stageId = unlocked.length > 0 ? Math.max(...unlocked) : 1;
    this.scroll = Math.max(0, Math.min(
      Math.max(0, STAGES.length * STAGE_ROW_H - STAGE_H),
      (this.stageId - 1) * STAGE_ROW_H - STAGE_H / 2
    ));
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
    drawTextCentered(ctx, '派遣準備', VW / 2, 5, 12, THEME.text);
    drawTextRight(ctx, `${st.data.gold}G`, VW - 8, 5, 12, THEME.gold);

    this.drawJobTabs(ctx, 30);
    this.drawAdventurerCard(ctx, CARD_Y);
    this.drawRules(ctx, RULE_Y);
    this.drawStageList(ctx);
    this.drawStagePanel(ctx);
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
      drawTextCentered(ctx, jobDef(jobId).name, x + w / 2, y + 4, 8,
        busy ? THEME.red : sel ? THEME.gold : THEME.dim);
    });
  }

  /** 冒険者カード。装備2枠はタップで変更。 */
  private drawAdventurerCard(ctx: CanvasRenderingContext2D, y: number): void {
    const st = this.nav.state;
    const jobId = this.job();
    const job = jobDef(jobId);
    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);

    drawNineSlice(ctx, 'frame', 8, y, VW - 16, CARD_H);
    drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', 14, y + 6, 2);
    drawText(ctx, job.name, 50, y + 6, 12, THEME.text);
    drawText(ctx, `HP ${job.hp}`, 50, y + 24, 8, THEME.dim);
    if (st.isBusy(jobId)) drawText(ctx, '派遣中', 50, y + 38, 8, THEME.red);

    const slots: ['weapon' | 'armor', Item | null][] = [['weapon', weapon], ['armor', armor]];
    slots.forEach(([slot, item], i) => {
      const sx = SLOT_X + i * (SLOT_W + 4);
      fillRect(ctx, sx, y + 6, SLOT_W, SLOT_H, THEME.outline);
      strokeRect1(ctx, sx, y + 6, SLOT_W, SLOT_H, item ? THEME.panelLight : THEME.red);
      if (item) {
        drawSprOr(ctx, itemIconName(item), 'icon_W1', sx + 3, y + 12);
        drawText(ctx, itemName(item), sx + 22, y + 9, 8, THEME.text);
        drawText(ctx, item.slot === 'weapon'
          ? `秒間${Math.round(item.power * item.speed)}` : `防御${item.power}`,
          sx + 22, y + 25, 8, THEME.dim);
      } else {
        drawTextCentered(ctx, slot === 'weapon' ? '武器を選ぶ' : '防具を選ぶ',
          sx + SLOT_W / 2, y + 18, 8, THEME.red);
      }
    });

    const stage = stageDef(this.stageId);
    drawTextWrapped(ctx, this.matchupHint(weapon, armor, stage.resists, stage.weakTo,
      stage.enemyElement === 'mixed' ? null : stage.enemyElement),
      14, y + 52, VW - 32, 8, THEME.gold, 2);
  }

  /** 装備とステージ属性の噛み合いを説明する。 */
  private matchupHint(
    weapon: Item | null, armor: Item | null,
    resists: readonly Element[], weakTo: Element | null, enemyElem: Element | null
  ): string {
    const parts: string[] = [];
    if (weapon) {
      const dom = dominantElement(weapon.element);
      if (resists.includes(dom)) {
        parts.push(`⚠ ${elementLabel(dom)}は耐性属性。火力が半減する`);
      } else if (weakTo && dom === weakTo) {
        parts.push(`◎ ${elementLabel(dom)}は弱点属性。火力1.5倍`);
      } else if (weakTo) {
        parts.push(`弱点は${elementLabel(weakTo)}。${elementLabel(dom)}では等倍`);
      }
    }
    if (enemyElem) {
      const hasResist = armor?.affixes.some(a => a.kind === 'resistPct' && a.element === enemyElem);
      parts.push(hasResist
        ? `◎ 防具が${elementLabel(enemyElem)}耐性を持つ`
        : `敵は${elementLabel(enemyElem)}で攻めてくる`);
    }
    return parts.join('　');
  }

  /** 撤退ルールは3枚のカード。色で危険度を示す。 */
  private drawRules(ctx: CanvasRenderingContext2D, y: number): void {
    drawText(ctx, '撤退ルール', 10, y - 13, 8, THEME.dim);
    const w = Math.floor((VW - 20) / 3);
    RETREAT_RULES.forEach((r, i) => {
      const x = 8 + i * (w + 2);
      const sel = this.rule === r.id;
      const color = RULE_COLOR[r.id];
      fillRect(ctx, x, y, w, RULE_H, sel ? THEME.panelLight : THEME.panel);
      strokeRect1(ctx, x, y, w, RULE_H, sel ? color : THEME.outline);
      if (sel) fillRect(ctx, x, y, w, 2, color);
      drawSprOr(ctx, 'heart', 'star', x + 5, y + 6);
      drawText(ctx, r.name, x + 18, y + 5, 8, sel ? color : THEME.text);
      drawTextWrapped(ctx, RULE_COND[r.id], x + 5, y + 22, w - 10, 8,
        sel ? THEME.text : THEME.dim, 2);
    });
  }

  private drawStageList(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    drawText(ctx, '派遣先', 10, STAGE_Y - 13, 8, THEME.dim);
    ctx.save();
    ctx.beginPath();
    ctx.rect(8, STAGE_Y, LIST_W, STAGE_H);
    ctx.clip();

    const first = Math.max(0, Math.floor(this.scroll / STAGE_ROW_H));
    const last = Math.min(STAGES.length - 1, first + Math.ceil(STAGE_H / STAGE_ROW_H) + 1);
    for (let i = first; i <= last; i++) {
      const stage = STAGES[i];
      if (!stage) continue;
      const y = STAGE_Y + i * STAGE_ROW_H - this.scroll;
      const unlocked = st.data.unlockedStages.includes(stage.id);
      const cleared = st.data.clearedStages.includes(stage.id);
      const sel = this.stageId === stage.id;

      fillRect(ctx, 8, y, LIST_W, STAGE_ROW_H - 2, sel ? THEME.panelLight : THEME.panel);
      if (sel) strokeRect1(ctx, 8, y, LIST_W, STAGE_ROW_H - 2, THEME.gold);

      drawText(ctx, String(stage.id), 13, y + 5, 12, unlocked ? THEME.dim : THEME.faint);
      drawSprOr(ctx, `stage_${stage.id}`, 'icon_T1', 30, y + 4);
      drawText(ctx, stage.name, 50, y + 4, 12,
        !unlocked ? THEME.faint : sel ? THEME.gold : THEME.text);
      drawText(ctx, formatDuration(stage.minutes * 60), 50, y + 24, 8, THEME.dim);

      if (!unlocked) {
        drawSprOr(ctx, 'icon_lock', 'icon_A3', 8 + LIST_W - 22, y + 12);
      } else {
        if (cleared) drawSprOr(ctx, 'icon_check', 'star', 8 + LIST_W - 20, y + 26);
        if (stage.enemyElement !== 'mixed') {
          drawSprOr(ctx, elementIconName(stage.enemyElement), 'star', 8 + LIST_W - 20, y + 6);
        } else {
          drawText(ctx, '複', 8 + LIST_W - 22, y + 5, 8, THEME.red);
        }
      }
    }
    ctx.restore();
    strokeRect1(ctx, 8, STAGE_Y, LIST_W, STAGE_H, THEME.outline);
  }

  /** 選択中ステージの詳細。§6.4 の明示義務はここで果たす。 */
  private drawStagePanel(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const stage = stageDef(this.stageId);
    const unlocked = st.data.unlockedStages.includes(stage.id);
    drawNineSlice(ctx, 'frame', PANEL_X, STAGE_Y, PANEL_W, STAGE_H);

    let y = STAGE_Y + 8;
    drawTextCentered(ctx, stage.name, PANEL_X + PANEL_W / 2, y, 12, THEME.gold);
    y += 20;
    drawSprOr(ctx, `stage_${stage.id}`, 'icon_T1', PANEL_X + PANEL_W / 2 - 16, y, 2);
    y += 38;

    const row = (label: string, value: string, icon: string | null, color: string): void => {
      drawText(ctx, label, PANEL_X + 6, y, 8, THEME.dim);
      y += 13;
      let vx = PANEL_X + 8;
      if (icon && hasSpr(icon)) { drawSprOr(ctx, icon, 'star', vx, y); vx += 11; }
      drawText(ctx, value, vx, y, 8, color);
      y += 16;
    };

    row('主な敵属性',
      stage.enemyElement === 'mixed' ? '複合' : elementLabel(stage.enemyElement),
      stage.enemyElement === 'mixed' ? null : elementIconName(stage.enemyElement),
      THEME.red);
    row('有効属性',
      stage.weakTo ? elementLabel(stage.weakTo) : 'なし',
      stage.weakTo ? elementIconName(stage.weakTo) : null,
      stage.weakTo ? THEME.green : THEME.dim);
    if (stage.resists.length > 0) {
      row('効きにくい', stage.resists.map(elementLabel).join('・'), null, THEME.red);
    }
    row('ドロップ',
      stage.dropBias === 'weapon' ? '武器寄り' : stage.dropBias === 'armor' ? '防具寄り' : '均等',
      null, THEME.text);
    row('所要時間', formatDuration(stage.minutes * 60), null, THEME.text);
    drawText(ctx, `遭遇 ${stage.encounters}回`, PANEL_X + 8, y - 4, 8, THEME.dim);

    if (!unlocked) {
      const canBuy = st.data.gold >= stage.unlockCost
        && (stage.id === 1 || st.data.clearedStages.includes(stage.id - 1));
      const by = STAGE_Y + STAGE_H - 54;
      fillRect(ctx, PANEL_X + 5, by, PANEL_W - 10, 48, THEME.outline);
      strokeRect1(ctx, PANEL_X + 5, by, PANEL_W - 10, 48, canBuy ? THEME.gold : THEME.panelLight);
      drawTextCentered(ctx, '未解放', PANEL_X + PANEL_W / 2, by + 4, 8, THEME.dim);
      drawTextCentered(ctx, `${stage.unlockCost}G`, PANEL_X + PANEL_W / 2, by + 17, 12,
        canBuy ? THEME.gold : THEME.faint);
      drawTextCentered(ctx,
        stage.id > 1 && !st.data.clearedStages.includes(stage.id - 1)
          ? `${stage.id - 1}の踏破が必要` : canBuy ? 'タップで解放' : '資金不足',
        PANEL_X + PANEL_W / 2, by + 34, 8, canBuy ? THEME.text : THEME.dim);
    }
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

    fillRect(ctx, 0, VH - 64, VW, 64, THEME.bg);
    drawText(ctx, `${stage.name}／${retreatRuleDef(this.rule).name}／約${formatDuration(eta)}`,
      12, VH - 60, 8, THEME.dim);
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
    const job = jobDef(this.job());
    const slot = this.picking;
    if (!slot) return [];
    return sortItems(st.data.inventory.filter(i =>
      i.slot === slot && (slot === 'weapon' || canEquipArmor(job, baseDef(i.baseId).tags))
    ), 'power');
  }

  private pickerViewH(): number { return VH - 148; }

  private drawPicker(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const jobId = this.job();
    const eq = st.data.equipped[jobId];
    const current = st.itemById(this.picking === 'weapon' ? eq.weapon : eq.armor);
    ctx.fillStyle = 'rgba(13,10,18,0.88)';
    ctx.fillRect(0, 0, VW, VH);
    drawNineSlice(ctx, 'frame', 6, 36, VW - 12, VH - 92);
    drawTextCentered(ctx, this.picking === 'weapon' ? '武器を選択' : '防具を選択',
      VW / 2, 46, 12, THEME.gold);
    const job = jobDef(jobId);
    if (this.picking === 'armor' && job.armorRestriction.length > 0) {
      drawTextCentered(ctx,
        `${job.name}は${job.armorRestriction.includes('heavy') ? '重' : '軽'}防具のみ`,
        VW / 2, 64, 8, THEME.dim);
    }

    const list = this.pickCache;
    const top = 80, viewH = this.pickerViewH();
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, top, VW - 20, viewH);
    ctx.clip();
    const first = Math.max(0, Math.floor(this.pickScroll / this.pickRowH));
    const last = Math.min(list.length - 1, first + Math.ceil(viewH / this.pickRowH) + 1);
    for (let i = first; i <= last; i++) {
      const it = list[i];
      if (!it) continue;
      const y = top + i * this.pickRowH - this.pickScroll;
      drawItemRow(ctx, it, 12, y, VW - 24, this.pickRowH - 3, {
        selected: current?.id === it.id,
        compareTo: current && current.id !== it.id ? current : null
      });
    }
    ctx.restore();
    if (list.length === 0) {
      drawTextCentered(ctx, '装備できる品がない', VW / 2, top + 40, 12, THEME.dim);
    }
    drawTextCentered(ctx, 'タップで装備／枠の外で閉じる', VW / 2, VH - 54, 8, THEME.dim);
  }

  // -------------------------------------------------------------- 入力

  pointerDown(px: number, py: number): void {
    this.dragY = py;
    this.dragged = false;
    if (this.picking) return;

    if (hitBtn(this.backBtn, px, py)) { sfx('tap'); this.nav.goBase(); return; }

    const jobs = this.jobs();
    const tw = Math.floor((VW - 16) / Math.max(1, jobs.length));
    for (let i = 0; i < jobs.length; i++) {
      if (inRect(px, py, 8 + i * tw, 30, tw - 2, 22)) { this.jobIdx = i; sfx('tap'); return; }
    }

    for (let i = 0; i < 2; i++) {
      if (inRect(px, py, SLOT_X + i * (SLOT_W + 4), CARD_Y + 6, SLOT_W, SLOT_H)) {
        this.picking = i === 0 ? 'weapon' : 'armor';
        this.pickCache = this.pickerItems();
        this.pickScroll = 0;
        sfx('tap');
        return;
      }
    }

    const rw = Math.floor((VW - 20) / 3);
    for (let i = 0; i < RETREAT_RULES.length; i++) {
      if (inRect(px, py, 8 + i * (rw + 2), RULE_Y, rw, RULE_H)) {
        const r = RETREAT_RULES[i];
        if (r) { this.rule = r.id; sfx('tap'); }
        return;
      }
    }

    if (hitBtn(this.goBtn, px, py)) {
      const ok = this.nav.state.dispatch(this.job(), this.stageId, this.rule, this.nav.now());
      if (ok) { sfx('depart'); this.nav.goBase(); }
      else sfx('deny');
    }
  }

  pointerMove(_px: number, py: number): void {
    if (this.dragY === null) return;
    const dy = this.dragY - py;
    if (Math.abs(dy) > 3) this.dragged = true;
    if (this.picking) {
      const maxScroll = Math.max(0, this.pickCache.length * this.pickRowH - this.pickerViewH());
      this.pickScroll = Math.max(0, Math.min(maxScroll, this.pickScroll + dy));
    } else {
      const maxScroll = Math.max(0, STAGES.length * STAGE_ROW_H - STAGE_H);
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
      const top = 80, viewH = this.pickerViewH();
      if (py >= top && py < top + viewH && px >= 12 && px < VW - 12) {
        const idx = Math.floor((py - top + this.pickScroll) / this.pickRowH);
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

    // ステージ選択（一覧）と解放（詳細パネル）
    if (px < 8 + LIST_W && py >= STAGE_Y && py < STAGE_Y + STAGE_H) {
      const idx = Math.floor((py - STAGE_Y + this.scroll) / STAGE_ROW_H);
      const stage = STAGES[idx];
      if (stage) { this.stageId = stage.id; sfx('tap'); }
      return;
    }
    if (px >= PANEL_X && py >= STAGE_Y && py < STAGE_Y + STAGE_H) {
      const st = this.nav.state;
      if (!st.data.unlockedStages.includes(this.stageId)) {
        if (st.unlockStage(this.stageId)) sfx('levelup');
        else sfx('deny');
      }
    }
  }
}
