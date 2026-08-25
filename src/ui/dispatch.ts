import type { GameScreen, Nav } from '../game/app';
import type { Element, Item, JobId, RetreatRule } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, drawSprOr, fillRect, fillScrim, hasSpr, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped } from '../render/font';
import { THEME } from './theme';
import { drawBtn, hitBtn, inRect, type Btn } from './widgets';
import { RETREAT_RULES, canEquipArmor, jobDef, retreatRuleDef } from '../data/jobs';
import { STAGES, bossName, stageDef } from '../data/stages';
import { simulateRun } from '../sim/combat';
import { baseDef } from '../data/bases';
import { dominantElement } from '../sim/items';
import { sfx } from '../render/audio';
import { drawItemRow, elementLabel, itemIconName, itemName, itemScore, sortItems } from './itemview';
import { compareHeight, drawCompare } from './equipcard';
import { Feedback, drawButton, hitButton, type Button } from './components';
import { ROLE, SPACE, TEXT } from './tokens';
import { textWidth } from '../render/font';
import { enemiesForStage } from '../data/enemies';
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
/** 装備選択一覧の先頭。スロット矩形（〜102）と重ならない位置に置く */
const PICK_TOP = 106;

/** 撤退ルールの色（慎重＝緑／標準＝金／深追い＝赤）。 */
const RULE_COLOR: Record<RetreatRule, string> = {
  cautious: THEME.green,
  standard: THEME.gold,
  reckless: THEME.red
};

/** 属性ごとの色。ステージ一覧の札と詳細で共通に使う。 */
const ELEM_COLOR: Record<string, string> = {
  physical: THEME.dim,
  fire: THEME.red,
  lightning: THEME.gold,
  poison: THEME.green,
  ice: THEME.blue,
  mixed: THEME.purple
};

const RULE_COND: Record<RetreatRule, string> = {
  reckless: 'HPが0に\nなるまで戦う',
  standard: 'HP30%を\n切ったら帰還',
  cautious: 'HP50%を\n切ったら帰還'
};

export class DispatchScreen implements GameScreen {
  private jobIdx = 0;
  private rule: RetreatRule = 'standard';
  /** 所要時間の見積のキャッシュ（条件が変わるまで使い回す） */
  private etaKey = '';
  private etaCache: { min: number; max: number; hopeless: boolean } | null = null;
  private stageId = 1;
  private scroll = 0;
  private dragY: number | null = null;
  private dragged = false;
  private picking: 'weapon' | 'armor' | null = null;
  /**
   * picker を開いた pointerDown と対になる pointerUp では確定させないための番人。
   *
   * スロットの当たり判定 y∈[62,102) と一覧の先頭行 y∈[80,120) は重なっている。
   * この番人が無いと、スロットをタップした指を離した瞬間に「一覧の0番目を装備して
   * 閉じる」まで一息に走ってしまい、プレイヤーは一覧を一度も見られない。
   * （実際そうなっており、装備選択が実質存在しなかった）
   */
  private pickerJustOpened = false;
  private pickScroll = 0;
  private pickCache: Item[] = [];
  private readonly pickRowH = 40;
  /** 比較中の候補（§11「装備するべきか」を決める段）。null なら一覧のまま */
  private pickCandidate: Item | null = null;
  private equipBtn: Button = { x: 0, y: 0, w: 0, h: 0, label: '装備する', accent: true };
  private cancelBtn: Button = { x: 0, y: 0, w: 0, h: 0, label: '戻る' };
  /** 取得・装備のフィードバック（§8） */
  private fb = new Feedback();

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

  update(dt: number): void {
    this.nav.state.tick(this.nav.now());
    this.fb.update(dt);
  }

  /** 今装備している品の強さ（比較の前後で差を出すため）。 */
  private equippedNow(): number | null {
    const eq = this.nav.state.data.equipped[this.job()];
    const it = this.nav.state.itemById(this.picking === 'weapon' ? eq.weapon : eq.armor);
    return it ? itemScore(it) : null;
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
    this.fb.draw(ctx, VW);
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
    drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', 18, y + 6, 2);
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

  /**
   * 撤退ルールは3枚のカード。
   *
   * 以前は3枚とも同じ見た目で、選択中のときだけ枠の色が変わっていた。
   * つまり「選ぶ前」——まさに選ぼうとしている瞬間——には3枚の区別が付かず、
   * 色分けが機能していなかった。選択に関係なく常に色と HP ゲージを出し、
   * 「どこで引き返すか」を目盛りで見せる。
   */
  private drawRules(ctx: CanvasRenderingContext2D, y: number): void {
    drawText(ctx, '撤退ルール', 10, y - 13, 8, THEME.dim);
    const w = Math.floor((VW - 20) / 3);
    RETREAT_RULES.forEach((r, i) => {
      const x = 8 + i * (w + 2);
      const sel = this.rule === r.id;
      const color = RULE_COLOR[r.id];

      fillRect(ctx, x, y, w, RULE_H, sel ? THEME.panelLight : THEME.panel);
      strokeRect1(ctx, x, y, w, RULE_H, sel ? color : THEME.outline);
      // 危険度の帯は選択に関係なく常に出す（選ぶ前に比べられないと意味がない）
      fillRect(ctx, x, y, w, sel ? 3 : 2, color);
      drawText(ctx, r.name, x + 5, y + 5, 8, color);
      if (sel) drawTextRight(ctx, '◆', x + w - 5, y + 5, 8, color);

      // HP ゲージ。撤退線より下（＝引き返す領域）を赤のディザで塗り、
      // 線より上（＝戦い続ける領域）をルールの色で塗る。
      const bx = x + 5, by = y + 19, bw = w - 10, bh = 10;
      const cut = Math.round(bw * r.threshold);
      fillRect(ctx, bx, by, bw, bh, THEME.outline);
      fillRect(ctx, bx + cut, by + 1, bw - cut - 1, bh - 2, color);
      if (cut > 1) fillScrim(ctx, bx + 1, by + 1, cut - 1, bh - 2, THEME.red, 0.55);
      if (cut > 0) fillRect(ctx, bx + cut, by - 2, 1, bh + 4, THEME.text);

      // 説明は2行固定。行送りを詰めてカード高（58px）に収める
      RULE_COND[r.id].split('\n').forEach((ln, k) => {
        drawText(ctx, ln, x + 5, y + 32 + k * 12, 8, sel ? THEME.text : THEME.dim);
      });
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
        if (cleared) drawSprOr(ctx, 'icon_check', 'star', 8 + LIST_W - 20, y + 22);
        // 敵属性は行の右上ではなく所要時間の隣に、色付きの札で置く。
        // 右上に16pxのアイコンだけ置くと、物理（×印）が閉じるボタンに見える
        const tag = stage.enemyElement === 'mixed' ? '複合' : elementLabel(stage.enemyElement);
        const tw = textWidth(tag, 8) + 8;
        const tx = 50 + textWidth(formatDuration(stage.minutes * 60), 8) + 8;
        fillRect(ctx, tx, y + 22, tw, 13, THEME.outline);
        strokeRect1(ctx, tx, y + 22, tw, 13, ELEM_COLOR[stage.enemyElement] ?? THEME.dim);
        drawText(ctx, tag, tx + 4, y + 23, 8, ELEM_COLOR[stage.enemyElement] ?? THEME.dim);
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
    // ステージ絵（88×48）。16×16のアイコン1個だと10ステージの差が
    // 「数字が違う」以上には伝わらなかったので、土地柄の分かる絵に置き換えた
    const artW = 88, artH = 48;
    const ax = PANEL_X + Math.floor((PANEL_W - artW) / 2);
    if (hasSpr(`stage_bg_${stage.id}`)) {
      drawSpr(ctx, `stage_bg_${stage.id}`, ax, y);
      strokeRect1(ctx, ax - 1, y - 1, artW + 2, artH + 2, THEME.outline);
      // 未解放でも絵は見せる。下の表で敵もボスも全部見せているのに
      // 絵だけ黒く塗り潰しても、隠す意味が成立していなかった。
      // 代わりに「未解放」の帯を斜めに掛けて、状態だけを示す
      if (!unlocked) {
        const by = y + artH - 16;
        fillScrim(ctx, ax, y, artW, artH, THEME.outline, 0.35);
        fillRect(ctx, ax, by, artW, 14, THEME.outline);
        drawTextCentered(ctx, '未解放', ax + artW / 2, by + 1, 8, THEME.gold);
      }
      y += artH + 8;
    } else {
      drawSprOr(ctx, `stage_${stage.id}`, 'icon_T1', PANEL_X + PANEL_W / 2 - 16, y, 2);
      y += 38;
    }

    // 「ラベル」「値」を1行ずつ。属性は色付きの札で出す——
    // §6.4 が「敵の属性傾向は出撃前に必ず明示する」と定めており、
    // ここはプレイヤーが装備を選ぶ唯一の手がかりなので最優先で読ませる
    const row = (label: string, value: string, color: string, chip = false): void => {
      drawText(ctx, label, PANEL_X + 6, y, 8, THEME.dim);
      if (chip) {
        const tw = textWidth(value, 8) + 8;
        const tx = PANEL_X + PANEL_W - 8 - tw;
        fillRect(ctx, tx, y - 1, tw, 13, THEME.outline);
        strokeRect1(ctx, tx, y - 1, tw, 13, color);
        drawText(ctx, value, tx + 4, y, 8, color);
      } else {
        drawTextRight(ctx, value, PANEL_X + PANEL_W - 8, y, 8, color);
      }
      y += 15;
    };

    row('敵の属性',
      stage.enemyElement === 'mixed' ? '複合' : elementLabel(stage.enemyElement),
      ELEM_COLOR[stage.enemyElement] ?? THEME.red, true);
    row('弱点', stage.weakTo ? elementLabel(stage.weakTo) : 'なし',
      stage.weakTo ? THEME.green : THEME.dim, stage.weakTo !== null);
    row('効きにくい',
      stage.resists.length > 0 ? stage.resists.map(elementLabel).join('・') : 'なし',
      stage.resists.length > 0 ? THEME.red : THEME.dim);
    row('ドロップ',
      stage.dropBias === 'weapon' ? '武器寄り' : stage.dropBias === 'armor' ? '防具寄り' : '均等',
      THEME.text);
    // 実際の所要時間は到達深度に比例するので、ここは「満踏破したときの長さ」。
    // 下の footer に出る見積（実測の幅）と食い違って見えないよう、そう明記する
    row('満踏破で', formatDuration(stage.minutes * 60), THEME.text);
    row('遭遇', `${stage.encounters}回`, THEME.text);

    // 出てくる敵。属性表だけだと抽象的なので、名前で土地柄を裏書きする
    y += 6;
    fillRect(ctx, PANEL_X + 6, y, PANEL_W - 12, 1, THEME.panelLight);
    y += 6;
    drawText(ctx, '出る敵', PANEL_X + 6, y, 8, THEME.dim);
    y += 14;
    for (const e of enemiesForStage(stage.id).slice(0, 4)) {
      drawText(ctx, `・${e.name}`, PANEL_X + 8, y, 8, THEME.text);
      y += 13;
    }
    drawText(ctx, `ボス『${bossName(stage.id)}』`, PANEL_X + 8, y + 3, 8, THEME.red);

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

  /**
   * 所要時間の見積。
   *
   * 以前はステージの全長をそのまま出していたが、実時間は到達深度に比例するので、
   * 「約8時間」と表示した派遣が実際には2時間で——装備が届いていなければ最短で——
   * 帰ってきていた。アプリを閉じてよいかを判断する唯一の数字が常に間違っている、
   * という状態だった（§2 が設計の背骨に据えている判断そのもの）。
   *
   * 本物のシミュレーションを別 seed で数回回して、実際に起こりうる幅を出す。
   * 結果そのもの（踏破するか死ぬか）は見せない。時間だけを見せる。
   * 毎フレーム回すと重いので、条件が変わったときだけ計算する。
   */
  private estimate(): { min: number; max: number; hopeless: boolean } | null {
    const st = this.nav.state;
    const jobId = this.job();
    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);
    if (!weapon || !armor) return null;
    const key = `${jobId}|${this.stageId}|${this.rule}|${weapon.id}|${armor.id}|${st.data.tier}`;
    if (this.etaKey === key) return this.etaCache;

    const stage = stageDef(this.stageId);
    const job = jobDef(jobId);
    const rule = retreatRuleDef(this.rule);
    let min = Infinity, max = 0, zero = 0;
    const N = 7;
    for (let i = 0; i < N; i++) {
      // 実際の派遣とは別系列の seed を使う。ここで引いた乱数が
      // 本番の結果に影響しないようにするため
      const r = simulateRun({
        seed: (0xE7A0000 + i * 2654435761) >>> 0,
        job, weapon, armor, rule, stage, tier: st.data.tier
      });
      min = Math.min(min, r.durationSec);
      max = Math.max(max, r.durationSec);
      if (r.depth === 0) zero++;
    }
    this.etaKey = key;
    this.etaCache = { min, max, hopeless: zero > N / 2 };
    return this.etaCache;
  }

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const jobId = this.job();
    const busy = st.isBusy(jobId);
    const eq = st.data.equipped[jobId];
    const ready = !!st.itemById(eq.weapon) && !!st.itemById(eq.armor);
    const unlocked = st.data.unlockedStages.includes(this.stageId);
    const stage = stageDef(this.stageId);

    fillRect(ctx, 0, VH - 64, VW, 64, THEME.bg);
    const est = this.estimate();
    const etaText = est === null ? '所要時間は装備を選ぶと出る'
      : est.min === est.max ? `約${formatDuration(est.min)}`
      : `${formatDuration(est.min)}〜${formatDuration(est.max)}`;
    drawText(ctx, `${stage.name}／${retreatRuleDef(this.rule).name}／${etaText}`,
      12, VH - 60, 8, THEME.dim);
    // 深度0で引き返す見込みなら、派遣する前に言う。
    // 何時間も待たせてから空手で帰すのが一番いけない
    if (est?.hopeless && unlocked && !busy) {
      drawTextRight(ctx, '⚠ 装備が届いていない', VW - 12, VH - 60, 8, THEME.red);
    }
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

  private pickerViewH(): number { return this.pickListRect().h; }

  /**
   * 装備一覧が使える矩形。
   * 比較中は上に比較シートが載るので、一覧はその下に縮む——**閉じはしない**。
   * 一覧を隠してしまうと、別の候補に乗り換えるのに毎回「戻る」が要る。
   * 見比べながら次々に当ててみられるほうが、判断は速い（§18）。
   */
  private pickListRect(): { top: number; h: number } {
    if (!this.pickCandidate) return { top: PICK_TOP, h: VH - PICK_TOP - 68 };
    const w = VW - 24;
    const sheetH = compareHeight(this.compareBase(), this.pickCandidate, w) + SPACE.md + 34;
    const top = PICK_TOP + sheetH + SPACE.lg;
    return { top, h: Math.max(0, VH - top - 68) };
  }

  /** 比較の左側に置く「装備中」の品。 */
  private compareBase(): Item | null {
    const eq = this.nav.state.data.equipped[this.job()];
    return this.nav.state.itemById(this.picking === 'weapon' ? eq.weapon : eq.armor);
  }

  private drawPicker(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    const jobId = this.job();
    const eq = st.data.equipped[jobId];
    const current = st.itemById(this.picking === 'weapon' ? eq.weapon : eq.armor);
    // 背後はベタで隠す（ディザだと下の文字がノイズとして残る）
    fillRect(ctx, 0, 0, VW, VH, THEME.outline);
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
    const { top, h: viewH } = this.pickListRect();
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
    drawTextCentered(ctx,
      this.pickCandidate ? '別の行を叩けば比べ直せる' : 'タップで比較／枠の外で閉じる',
      VW / 2, VH - 54, 8, THEME.dim);

    if (this.pickCandidate) this.drawCompareSheet(ctx, current, this.pickCandidate);
  }

  /**
   * 比較シート（設計書 §11・Phase 5「Loot → Compare → Equip」）。
   *
   * 以前は一覧の行を叩いた瞬間に装備が入れ替わっていた。装備選択は
   * このゲームがプレイヤーに委ねる3つの判断のうちの1つ（§4.1）なのに、
   * 「装備中と比べてどうか」を確かめる段が無く、押し間違いも取り消せなかった。
   * 一段挟んで、装備中と候補を並べてから決めさせる。
   */
  private drawCompareSheet(
    ctx: CanvasRenderingContext2D, current: Item | null, next: Item
  ): void {
    const w = VW - 24;
    const h = compareHeight(current, next, w);
    // 見出しのすぐ下に置く。視線が最初に来る位置に2枚を並べ、
    // 一覧はその下に残して乗り換えられるようにする
    const top = PICK_TOP;
    fillRect(ctx, 6, top - SPACE.md, VW - 12, h + SPACE.md * 2 + 34, ROLE.edge);
    drawCompare(ctx, current, next, 12, top, w);

    const by = top + h + SPACE.md;
    this.cancelBtn = { x: 12, y: by, w: 96, h: 34, label: '戻る' };
    this.equipBtn = {
      x: 116, y: by, w: VW - 128, h: 34,
      label: current?.id === next.id ? '装備中' : '装備する',
      accent: true, disabled: current?.id === next.id
    };
    drawButton(ctx, this.cancelBtn, TEXT.body);
    drawButton(ctx, this.equipBtn, TEXT.title);
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
        this.pickCandidate = null;
        this.pickerJustOpened = true;
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
      // 開いた直後の指離しでは何もしない（この pointerUp は開く操作の一部）
      if (this.pickerJustOpened) {
        this.pickerJustOpened = false;
        return;
      }
      // 比較中は、シートのボタンだけを受け付ける
      if (this.pickCandidate) {
        if (hitButton(this.equipBtn, px, py)) {
          const eq = this.nav.state.data.equipped[this.job()];
          const before = this.equippedNow();
          if (this.picking === 'weapon') eq.weapon = this.pickCandidate.id;
          else eq.armor = this.pickCandidate.id;
          this.nav.state.save();
          sfx('confirm');
          // §8 数値変化をイベントとして見せる
          const after = this.equippedNow();
          if (before !== null && after !== null) this.fb.float(VW / 2 - 12, 150, after - before);
          this.pickCandidate = null;
          this.picking = null;
          return;
        }
        if (hitButton(this.cancelBtn, px, py)) {
          sfx('tap');
          this.pickCandidate = null;
          return;
        }
        // ボタン以外は下の一覧の判定へ落とす（別の候補に乗り換えられる）
      }
      const { top, h: viewH } = this.pickListRect();
      if (py >= top && py < top + viewH && px >= 12 && px < VW - 12) {
        const idx = Math.floor((py - top + this.pickScroll) / this.pickRowH);
        const it = this.pickCache[idx];
        if (it) {
          // 一覧のタップは「比較する」まで。装備はシートで確定させる
          this.pickCandidate = it;
          sfx('tap');
          return;
        }
      }
      this.picking = null;
      this.pickCandidate = null;
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
