import type { GameScreen, Nav } from '../game/app';
import type { JobId } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSprOr, fillRect, hasSpr, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight } from '../render/font';
import { THEME } from './theme';
import { drawBtn, hitBtn, inRect, type Btn } from './widgets';
import { jobDef, retreatRuleDef } from '../data/jobs';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { itemIconName } from './itemview';

// 拠点（§4.1）。プレイヤーが操作する唯一の場所。
// 平常時のUIは徹底して淡々と作る（§9.4）。派手にするのは開封だけ。

const JOB_SPRITE: Record<JobId, string> = {
  swordsman: 'job_swordsman',
  guardian: 'job_guardian',
  skirmisher: 'job_skirmisher'
};

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}時間${m > 0 ? `${m}分` : ''}`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}分${s % 60 > 0 ? `${s % 60}秒` : ''}`;
  return `${s}秒`;
}

export class BaseScreen implements GameScreen {
  private openBtn: Btn = { x: 12, y: 470, w: VW - 24, h: 40, label: '', accent: true };
  private dispatchBtn: Btn = { x: 12, y: 518, w: 164, h: 36, label: '派遣する' };
  private invBtn: Btn = { x: 184, y: 518, w: 164, h: 36, label: 'インベントリ' };
  private bookBtn: Btn = { x: 12, y: 560, w: 164, h: 36, label: '図鑑' };
  private slotY = 96;
  private slotH = 116;

  constructor(private nav: Nav) {}

  update(): void {
    this.nav.state.tick(this.nav.now());
  }

  private jobs(): JobId[] {
    return this.nav.state.availableJobs();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);

    // ヘッダ
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawText(ctx, '拠点', 8, 8, 12, THEME.text);
    drawTextRight(ctx, `${st.data.gold}G`, VW - 8, 8, 12, THEME.gold);
    if (st.data.tier > 1) {
      drawTextCentered(ctx, `難易度 +${st.data.tier - 1}`, VW / 2, 9, 8, THEME.red);
    }

    // 未確認レポート
    const inbox = st.data.inbox;
    if (inbox.length > 0) {
      const id = inbox[0];
      const d = id ? st.data.results[id] : undefined;
      fillRect(ctx, 0, 30, VW, 22, THEME.panelLight);
      drawText(ctx, d ? `帰還: ${d.headline}` : '帰還した仲間がいる', 8, 36, 8, THEME.gold);
      drawTextRight(ctx, 'タップで確認 ▶', VW - 8, 36, 8, THEME.text);
    } else {
      drawText(ctx, '派遣枠', 8, 36, 8, THEME.dim);
      drawTextRight(ctx, `${st.data.dispatches.length}/${this.jobs().length} 稼働中`, VW - 8, 36, 8, THEME.dim);
    }

    // 派遣スロット
    const jobs = this.jobs();
    jobs.forEach((jobId, i) => {
      this.drawSlot(ctx, jobId, 12, this.slotY + i * (this.slotH + 6));
    });

    // 未開封
    const pending = st.data.pending.length;
    this.openBtn.label = pending > 0 ? `未鑑定品 ${pending}個を開封する` : '未鑑定品はない';
    this.openBtn.disabled = pending === 0;
    drawBtn(ctx, this.openBtn, 12);

    drawBtn(ctx, this.dispatchBtn, 12);
    drawBtn(ctx, this.invBtn, 12);
    drawBtn(ctx, this.bookBtn, 12);
    drawTextRight(ctx, `所持 ${st.data.inventory.length}点`, VW - 16, 570, 8, THEME.dim);
    if (this.nav.timeScale !== 1) {
      drawTextRight(ctx, `時間×${this.nav.timeScale}`, VW - 8, VH - 14, 8, THEME.red);
    }
  }

  private drawSlot(ctx: CanvasRenderingContext2D, jobId: JobId, x: number, y: number): void {
    const st = this.nav.state;
    const w = VW - 24;
    const job = jobDef(jobId);
    const running = st.data.dispatches.find(d => d.jobId === jobId);
    drawNineSlice(ctx, 'frame', x, y, w, this.slotH);

    const sprName = JOB_SPRITE[jobId];
    drawSprOr(ctx, hasSpr(sprName) ? sprName : 'portrait', 'portrait', x + 8, y + 8, 2);
    drawText(ctx, job.name, x + 46, y + 10, 12, THEME.text);
    drawText(ctx, `HP ${job.hp}`, x + 46, y + 26, 8, THEME.dim);

    // 装備中の2点
    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);
    let ix = x + w - 44;
    for (const it of [armor, weapon]) {
      fillRect(ctx, ix, y + 8, 20, 20, THEME.outline);
      if (it) drawSprOr(ctx, itemIconName(it), 'icon_W1', ix + 2, y + 10);
      ix -= 24;
    }

    if (running) {
      const p = st.progressOf(running);
      const stage = stageDef(running.stageId);
      drawText(ctx, `${stage.name}へ潜行中`, x + 8, y + 46, 8, THEME.gold);
      drawSprOr(ctx, 'icon_hourglass', 'icon_T1', x + 8, y + 60);
      drawText(ctx, `残り ${formatDuration(p.remainingSec)}`, x + 28, y + 64, 8, THEME.text);
      drawTextRight(ctx, retreatRuleDef(running.retreatRule).name, x + w - 8, y + 64, 8, THEME.dim);
      // 進捗バー
      fillRect(ctx, x + 8, y + 84, w - 16, 8, THEME.outline);
      fillRect(ctx, x + 9, y + 85, Math.round((w - 18) * p.ratio), 6, THEME.gold);
      drawTextCentered(ctx, `${Math.round(p.ratio * 100)}%`, x + w / 2, y + 98, 8, THEME.dim);
    } else {
      const ready = weapon && armor;
      drawText(ctx, ready ? '待機中' : '装備が足りない', x + 8, y + 46, 8, ready ? THEME.dim : THEME.red);
      drawText(ctx, job.desc, x + 8, y + 62, 8, THEME.dim);
      const b: Btn = { x: x + 8, y: y + 82, w: w - 16, h: 26, label: 'このまま派遣', disabled: !ready };
      drawBtn(ctx, b, 8);
      strokeRect1(ctx, x, y, w, this.slotH, THEME.panelLight);
    }
  }

  pointerDown(px: number, py: number): void {
    const st = this.nav.state;

    // 未確認レポート
    if (st.data.inbox.length > 0 && inRect(px, py, 0, 30, VW, 22)) {
      const id = st.data.inbox[0];
      if (id) { sfx('confirm'); this.nav.goReport(id); return; }
    }

    const jobs = this.jobs();
    for (let i = 0; i < jobs.length; i++) {
      const y = this.slotY + i * (this.slotH + 6);
      const jobId = jobs[i];
      if (!jobId) continue;
      const running = st.data.dispatches.some(d => d.jobId === jobId);
      if (!running && inRect(px, py, 12, y + 82, VW - 40, 26)) {
        sfx('tap');
        this.nav.goDispatch();
        return;
      }
      if (inRect(px, py, 12, y, VW - 24, this.slotH)) {
        sfx('tap');
        this.nav.goDispatch();
        return;
      }
    }

    if (hitBtn(this.openBtn, px, py)) {
      sfx('confirm');
      this.nav.goOpening(st.data.pending);
      return;
    }
    if (hitBtn(this.dispatchBtn, px, py)) { sfx('tap'); this.nav.goDispatch(); return; }
    if (hitBtn(this.invBtn, px, py)) { sfx('tap'); this.nav.goInventory(); return; }
    if (hitBtn(this.bookBtn, px, py)) { sfx('tap'); this.nav.goCompendium(); return; }
  }
}
