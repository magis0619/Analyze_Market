import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped } from '../render/font';
import { drawNineSlice, drawSpr, fillRect, strokeRect1 } from '../render/draw';
import { THEME } from './theme';
import { sfx } from '../render/audio';
import { drawBtn, drawTimerBar, hitBtn, inRect, type Btn } from './widgets';
import { EQUIPMENT, equipDef, isOverweight, totalWeight, weightLimit } from '../data/equipment';
import { personalityDef } from '../data/personalities';
import { DUNGEON_EVENTS } from '../data/events';
import { Prng } from '../sim/prng';
import { CompendiumOverlay } from './compendium';

// 商談フェーズ（30秒）：客カード → 質問1回 → 装備を3点まで見立てて渡す。

const NEGOTIATION_SECONDS = 30;
const QUESTIONS = ['得意な戦い方は？', '前回はどこで死にかけた？', '何を持って帰りたい？'] as const;

export class NegotiationScreen implements GameScreen {
  private timeLeft = NEGOTIATION_SECONDS;
  private asked: number | null = null;
  private answer = '';
  private selected: string[] = [];
  private overlay: CompendiumOverlay | null = null;
  private banner: string | null;
  private bannerT = 5;
  private departBtn: Btn = { x: 236, y: 588, w: 116, h: 32, label: '送り出す', accent: true };
  private bookBtn: Btn = { x: 300, y: 4, w: 56, h: 20, label: '図鑑' };
  private qBtns: Btn[] = [];

  constructor(private app: App) {
    this.banner = app.shop.arrivalNote;
    app.shop.arrivalNote = null;
    for (let i = 0; i < 3; i++) {
      this.qBtns.push({ x: 8, y: 216 + i * 26, w: 208, h: 24, label: QUESTIONS[i] ?? '' });
    }
  }

  private shelf(): { id: string; x: number; y: number; w: number; h: number; repairing: boolean }[] {
    const cells: { id: string; x: number; y: number; w: number; h: number; repairing: boolean }[] = [];
    const stock = this.app.shop.stock;
    const items = EQUIPMENT.filter(e => stock.includes(e.id));
    const cw = 86, ch = 64;
    items.forEach((e, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      cells.push({
        id: e.id,
        x: 8 + col * (cw + 2), y: 312 + row * (ch + 2), w: cw, h: ch,
        repairing: this.app.shop.repairing.includes(e.id)
      });
    });
    return cells;
  }

  update(dt: number): void {
    if (this.overlay) return;
    this.bannerT -= dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.depart();
    }
  }

  private depart(): void {
    sfx('depart');
    this.app.startRun(this.selected);
  }

  private answerFor(q: number): string {
    const shop = this.app.shop;
    const adv = shop.advSnapshot();
    const p = personalityDef(adv.personality);
    if (q === 0) {
      return `${p.tell.style} 得物は${equipDef(adv.favoredWeapon).name}が手に馴染むという`;
    }
    if (q === 1) {
      const rng = new Prng(shop.runSeed() ^ 0x5f3759df);
      const pool = DUNGEON_EVENTS.filter(e =>
        e.id !== 'E15' && adv.questDepth >= e.minDepth && adv.questDepth <= e.maxDepth + 1
      );
      const ev = pool.length > 0 ? rng.pick(pool) : DUNGEON_EVENTS[0];
      return `${p.tell.nearDeath} この深さでは「${ev?.name ?? '崩落'}」が出るらしい`;
    }
    return p.tell.want;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const shop = this.app.shop;
    const adv = shop.advSnapshot();
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);

    // ヘッダ
    drawText(ctx, `第${shop.regular.generation}代`, 6, 8, 8, THEME.dim);
    drawText(ctx, `${shop.regular.runIndex}回目の依頼`, 42, 8, 8, THEME.dim);
    drawTextRight(ctx, `店の資金 ${shop.gold}G`, 292, 8, 8, THEME.gold);
    drawBtn(ctx, this.bookBtn, 8);

    // 来店バナー
    if (this.banner && this.bannerT > 0) {
      fillRect(ctx, 0, 26, VW, 14, THEME.panelLight);
      drawTextCentered(ctx, this.banner, VW / 2, 29, 8, THEME.gold);
    }

    // 客カード
    drawNineSlice(ctx, 'frame', 8, 44, VW - 16, 128);
    drawSpr(ctx, 'portrait', 24, 62, 4);
    const cx = 104;
    drawText(ctx, adv.name, cx, 58, 12, THEME.text);
    drawText(ctx, `${adv.job}  Lv${adv.level}`, cx, 76, 8, THEME.dim);
    drawText(ctx, `所持金 ${adv.gold}G`, cx, 88, 8, THEME.dim);
    drawText(ctx, `依頼：深度${adv.questDepth}に到達`, cx, 102, 12, THEME.gold);
    drawText(ctx, '性格：', cx, 122, 8, THEME.dim);
    if (this.asked === null) {
      // 黒塗り
      fillRect(ctx, cx + 26, 121, 42, 10, THEME.outline);
      fillRect(ctx, cx + 28, 123, 38, 6, '#000000');
    } else {
      const p = personalityDef(adv.personality);
      drawText(ctx, p.name, cx + 26, 122, 8, THEME.red);
      drawTextWrapped(ctx, p.effect, cx, 134, VW - cx - 20, 8, THEME.dim, 2);
    }
    drawText(ctx, `最高深度 ${shop.regular.bestDepth}`, 24, 140, 8, THEME.faint);

    // 質問エリア
    drawText(ctx, '質問（1回だけ）', 8, 182, 8, THEME.dim);
    if (this.asked === null) {
      for (const b of this.qBtns) drawBtn(ctx, b, 8);
      drawTextWrapped(ctx, '聞けるのはどれか一つ。答えで人柄が見える', 224, 224, 128, 8, THEME.faint, 3);
    } else {
      drawNineSlice(ctx, 'frame', 8, 196, VW - 16, 100);
      drawText(ctx, `Q. ${QUESTIONS[this.asked] ?? ''}`, 20, 208, 8, THEME.dim);
      drawTextWrapped(ctx, this.answer, 20, 222, VW - 44, 12, THEME.text, 4);
    }

    // 棚
    drawText(ctx, `棚（最大3点まで渡せる）`, 8, 300, 8, THEME.dim);
    const cells = this.shelf();
    for (const c of cells) {
      const selIdx = this.selected.indexOf(c.id);
      drawNineSlice(ctx, 'button', c.x, c.y, c.w, c.h);
      if (selIdx >= 0) strokeRect1(ctx, c.x, c.y, c.w, c.h, THEME.gold);
      const def = equipDef(c.id);
      drawSpr(ctx, `icon_${c.id}`, c.x + Math.floor(c.w / 2) - 16, c.y + 4, 2);
      drawTextCentered(ctx, def.name, c.x + Math.floor(c.w / 2), c.y + 40, 8, THEME.text);
      // 重量ピップ
      for (let i = 0; i < def.weight; i++) {
        drawSpr(ctx, 'weight_pip', c.x + Math.floor(c.w / 2) - def.weight * 3 + i * 6, c.y + 54);
      }
      if (c.repairing) {
        ctx.fillStyle = 'rgba(26,20,32,0.68)';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        drawTextCentered(ctx, '修理中', c.x + Math.floor(c.w / 2), c.y + 26, 8, THEME.red);
      }
      if (selIdx >= 0) {
        fillRect(ctx, c.x + 2, c.y + 2, 12, 12, THEME.gold);
        drawText(ctx, String(selIdx + 1), c.x + 5, c.y + 4, 8, THEME.outline);
      }
    }

    // フッタ：見立てと重量
    const limit = weightLimit(adv.level);
    const w = totalWeight(this.selected);
    const over = isOverweight(this.selected, adv.level);
    drawNineSlice(ctx, 'frame', 8, 512, VW - 16, 68);
    drawText(ctx, '見立て', 20, 520, 8, THEME.dim);
    for (let i = 0; i < 3; i++) {
      const sx = 20 + i * 40;
      fillRect(ctx, sx, 532, 36, 36, THEME.outline);
      const id = this.selected[i];
      if (id) drawSpr(ctx, `icon_${id}`, sx + 2, 534, 2);
    }
    drawText(ctx, `重量 ${w}/${limit}`, 160, 532, 12, over ? THEME.red : THEME.text);
    if (over) {
      drawText(ctx, '重装：軽装の選択肢が', 160, 548, 8, THEME.red);
      drawText(ctx, '開かなくなる', 160, 558, 8, THEME.red);
    } else {
      drawText(ctx, '身軽なら開ける道もある', 160, 550, 8, THEME.faint);
    }
    drawBtn(ctx, this.departBtn, 12);

    // 30秒タイマー
    drawTimerBar(ctx, 0, VH - 6, VW, 6, this.timeLeft / NEGOTIATION_SECONDS, this.timeLeft < 8);
    drawTextRight(ctx, `${Math.ceil(Math.max(0, this.timeLeft))}s`, VW - 4, VH - 18, 8, this.timeLeft < 8 ? THEME.red : THEME.faint);

    if (this.overlay) this.overlay.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.overlay) {
      if (this.overlay.pointerDown(x, y)) this.overlay = null;
      return;
    }
    if (hitBtn(this.bookBtn, x, y)) {
      sfx('tap');
      this.overlay = new CompendiumOverlay(this.app.shop);
      return;
    }
    if (this.asked === null) {
      for (let i = 0; i < this.qBtns.length; i++) {
        const b = this.qBtns[i];
        if (b && hitBtn(b, x, y)) {
          this.asked = i;
          this.answer = this.answerFor(i);
          sfx('confirm');
          return;
        }
      }
    }
    for (const c of this.shelf()) {
      if (inRect(x, y, c.x, c.y, c.w, c.h)) {
        if (c.repairing) { sfx('deny'); return; }
        const idx = this.selected.indexOf(c.id);
        if (idx >= 0) {
          this.selected.splice(idx, 1);
          sfx('tap');
        } else if (this.selected.length < 3) {
          this.selected.push(c.id);
          sfx('tap');
        } else {
          sfx('deny');
        }
        return;
      }
    }
    if (hitBtn(this.departBtn, x, y)) {
      this.depart();
    }
  }
}
