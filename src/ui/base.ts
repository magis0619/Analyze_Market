import type { GameScreen, Nav } from '../game/app';
import type { JobId } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight } from '../render/font';
import { THEME } from './theme';
import { inRect } from './widgets';
import { jobDef } from '../data/jobs';
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

interface MenuEntry {
  label: string;
  badge: number;
  action: 'report' | 'open' | 'dispatch' | 'inventory' | 'compendium';
  /** 見出しの1文字マーカー。スプライトはサイズがまちまちで行に収まらないため、
   *  ビットマップフォントの1文字で統一する */
  mark: string;
  markColor: string;
  accent?: boolean;
}

const SCENE_Y = 28;
const SCENE_H = 150;
const SLOT_Y = 184;
const SLOT_H = 40;
const MENU_H = 40;
const MENU_GAP = 4;

export class BaseScreen implements GameScreen {
  private t = 0;

  constructor(private nav: Nav) {}

  update(dt: number): void {
    this.t += dt;
    this.nav.state.tick(this.nav.now());
  }

  private jobs(): JobId[] {
    return this.nav.state.availableJobs();
  }

  private menu(): MenuEntry[] {
    const st = this.nav.state;
    return [
      { label: '帰還レポート', badge: st.data.inbox.length, action: 'report', mark: '報', markColor: THEME.blue },
      { label: '未鑑定品を開封', badge: st.data.pending.length, action: 'open', mark: '封', markColor: THEME.gold, accent: true },
      { label: '派遣準備', badge: 0, action: 'dispatch', mark: '派', markColor: THEME.green },
      { label: 'インベントリ', badge: 0, action: 'inventory', mark: '品', markColor: THEME.panelLight },
      { label: '図鑑', badge: 0, action: 'compendium', mark: '図', markColor: THEME.panelLight }
    ];
  }

  private menuTop(): number {
    const jobs = this.jobs().length;
    return SLOT_Y + jobs * (SLOT_H + 4) + 8;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const st = this.nav.state;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);

    // ヘッダ
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawText(ctx, '拠点', 8, 5, 12, THEME.text);
    drawSprOr(ctx, 'coin', 'star', VW - 92, 8);
    drawTextRight(ctx, `${st.data.gold}`, VW - 8, 5, 12, THEME.gold);
    if (st.data.tier > 1) {
      drawTextCentered(ctx, `難易度+${st.data.tier - 1}`, VW / 2, 7, 8, THEME.red);
    }

    this.drawScene(ctx);

    // 派遣スロット（誰が出ているか・あと何分か）
    const jobs = this.jobs();
    jobs.forEach((jobId, i) => {
      this.drawSlot(ctx, jobId, 8, SLOT_Y + i * (SLOT_H + 4));
    });

    // メニュー
    const top = this.menuTop();
    this.menu().forEach((m, i) => {
      this.drawMenu(ctx, m, 8, top + i * (MENU_H + MENU_GAP));
    });

    drawTextRight(ctx, `所持 ${st.data.inventory.length}点`, VW - 8, VH - 14, 8, THEME.dim);
    if (this.nav.timeScale !== 1) {
      drawText(ctx, `時間×${this.nav.timeScale}`, 8, VH - 14, 8, THEME.red);
    }
  }

  /** 拠点の情景。夜空の下に建つ小屋と、待機中の冒険者たち。 */
  private drawScene(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, SCENE_Y, VW, SCENE_H);
    ctx.clip();

    fillRect(ctx, 0, SCENE_Y, VW, SCENE_H, '#0c0810');
    // 星
    for (let i = 0; i < 60; i++) {
      const h = ((i * 2654435761) >>> 0);
      const x = h % VW;
      const y = SCENE_Y + ((h >> 9) % (SCENE_H - 46));
      if ((h >> 20) % 3 === 0) fillRect(ctx, x, y, 1, 1, THEME.dim);
    }
    // 地面
    const groundY = SCENE_Y + SCENE_H - 34;
    for (let col = 0; col < Math.ceil(VW / 16); col++) {
      drawSpr(ctx, `tile_s0_${col % 2 === 0 ? 'a' : 'b'}`, col * 16, groundY + 18);
    }
    fillRect(ctx, 0, groundY + 14, VW, 4, '#3c6430');

    // 小屋（拠点）
    const hx = 24;
    fillRect(ctx, hx, groundY - 40, 96, 54, '#5a3c22');
    fillRect(ctx, hx - 6, groundY - 52, 108, 12, '#802828');
    fillRect(ctx, hx - 4, groundY - 41, 104, 2, THEME.outline);
    // 窓と扉
    fillRect(ctx, hx + 12, groundY - 30, 20, 16, '#e8c84c');
    fillRect(ctx, hx + 60, groundY - 30, 20, 16, '#e8c84c');
    fillRect(ctx, hx + 38, groundY - 22, 18, 36, '#0c0810');
    // 看板
    fillRect(ctx, hx + 104, groundY - 26, 4, 40, '#5a3c22');
    fillRect(ctx, hx + 90, groundY - 34, 34, 12, '#3e3450');
    drawText(ctx, 'DELVERS', hx + 92, groundY - 32, 8, THEME.gold);

    // 待機中の冒険者だけを小屋の前に立たせる
    const jobs = this.jobs();
    let sx = 200;
    for (const jobId of jobs) {
      if (this.nav.state.isBusy(jobId)) continue;
      const bob = Math.floor(this.t * 2 + sx) % 2;
      drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', sx, groundY - 2 - bob, 2);
      sx += 44;
    }
    ctx.restore();
    fillRect(ctx, 0, SCENE_Y + SCENE_H - 1, VW, 1, THEME.outline);
  }

  private drawSlot(ctx: CanvasRenderingContext2D, jobId: JobId, x: number, y: number): void {
    const st = this.nav.state;
    const w = VW - 16;
    const job = jobDef(jobId);
    const running = st.data.dispatches.find(d => d.jobId === jobId);
    fillRect(ctx, x, y, w, SLOT_H, THEME.panel);
    strokeRect1(ctx, x, y, w, SLOT_H, running ? THEME.gold : THEME.outline);

    drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', x + 5, y + 12);
    drawText(ctx, job.name, x + 24, y + 4, 8, THEME.text);

    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);

    if (running) {
      const p = st.progressOf(running);
      const stage = stageDef(running.stageId);
      drawText(ctx, `${stage.name}へ潜行中`, x + 24, y + 20, 8, THEME.gold);
      drawSprOr(ctx, 'icon_hourglass', 'icon_T1', x + w - 106, y + 3);
      drawTextRight(ctx, `残り ${formatDuration(p.remainingSec)}`, x + w - 6, y + 5, 8, THEME.text);
      fillRect(ctx, x + w - 104, y + 24, 98, 8, THEME.outline);
      fillRect(ctx, x + w - 103, y + 25, Math.round(96 * p.ratio), 6, THEME.gold);
    } else if (weapon && armor) {
      drawText(ctx, '待機中', x + 24, y + 20, 8, THEME.dim);
      let ix = x + w - 44;
      for (const it of [armor, weapon]) {
        fillRect(ctx, ix, y + 11, 20, 20, THEME.outline);
        drawSprOr(ctx, itemIconName(it), 'icon_W1', ix + 2, y + 13);
        ix -= 24;
      }
    } else {
      drawText(ctx, '装備が足りない', x + 24, y + 20, 8, THEME.red);
    }
  }

  private drawMenu(ctx: CanvasRenderingContext2D, m: MenuEntry, x: number, y: number): void {
    const w = VW - 16;
    const enabled = m.action !== 'open' || m.badge > 0;
    drawNineSlice(ctx, 'button', x, y, w, MENU_H);
    if (m.accent && m.badge > 0) fillRect(ctx, x + 2, y + 2, w - 4, 2, THEME.gold);
    // 1文字マーカー
    const my = y + Math.floor((MENU_H - 20) / 2);
    fillRect(ctx, x + 8, my, 20, 20, enabled ? m.markColor : THEME.panel);
    strokeRect1(ctx, x + 8, my, 20, 20, THEME.outline);
    drawTextCentered(ctx, m.mark, x + 18, my + 3, 8,
      enabled ? THEME.outline : THEME.dim);
    drawText(ctx, m.label, x + 36, y + Math.floor((MENU_H - 16) / 2) + 2, 12,
      enabled ? THEME.text : THEME.dim);
    if (m.badge > 0) {
      // 未処理があることを赤丸で示す（モックアップの ! バッジに相当）
      const bx = x + w - 26;
      const by = y + Math.floor(MENU_H / 2) - 8;
      fillRect(ctx, bx, by, 18, 16, THEME.red);
      strokeRect1(ctx, bx, by, 18, 16, THEME.outline);
      drawTextCentered(ctx, String(Math.min(99, m.badge)), bx + 9, by + 2, 8, THEME.text);
    }
    if (!enabled) {
      ctx.fillStyle = 'rgba(26,20,32,0.5)';
      ctx.fillRect(x, y, w, MENU_H);
    }
  }

  pointerDown(px: number, py: number): void {
    const st = this.nav.state;
    const top = this.menuTop();
    const items = this.menu();
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      if (!m) continue;
      if (!inRect(px, py, 8, top + i * (MENU_H + MENU_GAP), VW - 16, MENU_H)) continue;
      switch (m.action) {
        case 'report': {
          const id = st.data.inbox[0];
          if (id) { sfx('confirm'); this.nav.goReport(id); }
          else sfx('deny');
          return;
        }
        case 'open':
          if (st.data.pending.length > 0) { sfx('confirm'); this.nav.goOpening(st.data.pending); }
          else sfx('deny');
          return;
        case 'dispatch': sfx('tap'); this.nav.goDispatch(); return;
        case 'inventory': sfx('tap'); this.nav.goInventory(); return;
        case 'compendium': sfx('tap'); this.nav.goCompendium(); return;
      }
    }
    // スロットをタップしても派遣画面へ
    const jobs = this.jobs();
    for (let i = 0; i < jobs.length; i++) {
      if (inRect(px, py, 8, SLOT_Y + i * (SLOT_H + 4), VW - 16, SLOT_H)) {
        sfx('tap');
        this.nav.goDispatch();
        return;
      }
    }
  }
}
