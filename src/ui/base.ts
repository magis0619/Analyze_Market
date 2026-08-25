import type { GameScreen, Nav } from '../game/app';
import type { JobId } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, drawSprOr, fillRect, fillScrim, hasSpr, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight } from '../render/font';
import { THEME } from './theme';
import { COLORS } from '../render/palette';

import { jobDef } from '../data/jobs';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { itemIconName } from './itemview';
import {
  Feedback, drawBadge, drawButton, drawHeader, drawPanel, drawProgress,
  hitButton, inRect, type Button
} from './components';
import { ROLE, SPACE, TEXT } from './tokens';
import { STAGES } from '../data/stages';

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
  /** バッジが0のときは押せない項目か */
  needsBadge?: boolean;
}

const SCENE_Y = 28;
const SCENE_H = 150;
const SLOT_Y = 184;
const SLOT_H = 40;
const MENU_H = 40;
const MENU_GAP = 4;

export class BaseScreen implements GameScreen {
  private t = 0;
  /** 派遣枠を買うボタン。位置は毎フレーム描画時に決まる */
  private slotBtn: Button = { x: 0, y: 0, w: 0, h: 0, label: '', accent: true };
  private slotBtnVisible = false;
  /** 取得・購入のフィードバック（§8） */
  private fb = new Feedback();
  /** 直前フレームの所持金。増減を検知して数字を浮かせる */
  private lastGold = -1;

  constructor(private nav: Nav) {}

  update(dt: number): void {
    this.t += dt;
    const st = this.nav.state;
    const inboxBefore = st.data.inbox.length;
    st.tick(this.nav.now());
    this.fb.update(dt);

    // §8「数値変化をイベントとして扱う」。
    // 帰還は画面を見ていない間にも起こるので、拠点に居る間に起きた分だけ知らせる。
    if (this.lastGold >= 0 && st.data.gold !== this.lastGold) {
      this.fb.float(VW - 96, 44, st.data.gold - this.lastGold, 'G');
    }
    this.lastGold = st.data.gold;
    if (st.data.inbox.length > inboxBefore) {
      this.fb.notify('冒険者が帰還した', ROLE.progress);
    }
  }

  private jobs(): JobId[] {
    return this.nav.state.availableJobs();
  }

  private menu(): MenuEntry[] {
    const st = this.nav.state;
    return [
      { label: '帰還レポート', badge: st.data.inbox.length, action: 'report',
        mark: '報', markColor: THEME.blue, needsBadge: true },
      { label: '未鑑定品を開封', badge: st.data.pending.length, action: 'open',
        mark: '封', markColor: THEME.gold, accent: true, needsBadge: true },
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

    // Layer 1（§1）: 常時確認する情報。全画面で同じ帯・同じ位置
    drawHeader(ctx, VW, {
      title: '拠点',
      gold: st.data.gold,
      tier: st.data.tier,
      running: st.data.dispatches.length
    });

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

    // メニューの下に残る空きを、進捗と次の派遣枠で埋める。
    // 以前はここが画面の半分ほど何も無いまま余っていた
    const restTop = top + this.menu().length * (MENU_H + MENU_GAP) + 8;
    this.drawProgress(ctx, restTop, VH - 20 - restTop);

    drawTextRight(ctx, `所持 ${st.data.inventory.length}点`, VW - 8, VH - 14, 8, THEME.dim);
    // §6 の深さ: 通知と飛ぶ数字は必ず最前面
    this.fb.draw(ctx, VW, VH);
    if (this.nav.timeScale !== 1) {
      drawText(ctx, `時間×${this.nav.timeScale}`, 8, VH - 14, 8, THEME.red);
    }
  }

  /**
   * 画面下の余白を使って「今どこまで来たか」と「次に何が買えるか」を出す。
   * 拠点は毎回必ず通る画面なので、進み具合はここで分かるべき。
   */
  private drawProgress(ctx: CanvasRenderingContext2D, y: number, h: number): void {
    this.slotBtnVisible = false;
    if (h < 56) return;
    const st = this.nav.state;
    const w = VW - 16;

    // --- 次の派遣枠（§7.5） ---
    const next = st.nextSlot();
    if (next && h >= 108) {
      const ph = 52;
      drawPanel(ctx, 8, y, w, ph);
      drawText(ctx, `${next.index + 1}人目の冒険者`, 16, y + 6, 8, THEME.text);
      if (!next.stageDone) {
        drawText(ctx, `ステージ${next.needStage}を踏破すると雇えるようになる`,
          16, y + 22, 8, THEME.dim);
        drawTextRight(ctx, `${next.cost}G`, VW - 16, y + 22, 8, THEME.faint);
      } else {
        drawText(ctx, next.affordable ? '雇う準備ができている' : '金が足りない',
          16, y + 22, 8, next.affordable ? THEME.green : THEME.red);
        drawText(ctx, `${next.cost}G`, 16 + 104, y + 6, 8,
          next.affordable ? THEME.gold : THEME.red);
        this.slotBtn = {
          x: VW - 88, y: y + 14, w: 68, h: 26,
          label: '雇う', accent: true, disabled: !next.affordable
        };
        this.slotBtnVisible = true;
        drawButton(ctx, this.slotBtn, TEXT.body);
      }
      y += ph + 6;
      h -= ph + 6;
    }

    // --- 進捗 ---
    if (h < 44) return;
    drawPanel(ctx, 8, y, w, 40);
    const cleared = st.data.clearedStages.length;
    const found = Object.keys(st.data.compendium).length;
    const cols: [string, string, string][] = [
      ['踏破', `${cleared}/${STAGES.length}`, THEME.green],
      ['図鑑', `${found}`, THEME.blue],
      ['難易度', `+${st.data.tier - 1}`, st.data.tier > 1 ? THEME.red : THEME.dim]
    ];
    cols.forEach(([label, value, color], i) => {
      const cx = 8 + Math.floor(w / 3) * i + Math.floor(w / 6);
      drawTextCentered(ctx, label, cx, y + 6, 8, THEME.dim);
      drawTextCentered(ctx, value, cx, y + 20, 12, color);
    });
  }

  /**
   * 拠点の情景。夜空の下に建つ小屋と、待機中の冒険者たち。
   *
   * 以前は小屋を矩形4枚で描いていて、絵として成立していなかった（批評A-1）。
   * 建物・木・柵・小物はスプライトに移し、ここは配置だけを持つ。
   * 色は必ず COLORS から取る（画面上の色数を数えられなくなるため直書き禁止）。
   */
  private drawScene(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, SCENE_Y, VW, SCENE_H);
    ctx.clip();

    fillRect(ctx, 0, SCENE_Y, VW, SCENE_H, COLORS.bg);
    // 星。ハッシュで決めるので毎フレーム同じ位置に出る
    for (let i = 0; i < 60; i++) {
      const h = ((i * 2654435761) >>> 0);
      const x = h % VW;
      const y = SCENE_Y + ((h >> 9) % (SCENE_H - 46));
      if ((h >> 20) % 3 === 0) fillRect(ctx, x, y, 1, 1, THEME.dim);
    }

    const groundY = SCENE_Y + SCENE_H - 34;

    // 遠景の木立。小屋より先に描いて奥行きを作る
    // 木立は不揃いに散らす。等間隔に並べると書き割りに見える
    if (hasSpr('tree_pine')) {
      for (const [tx, dy] of [[2, 0], [148, 4], [268, 6], [296, -2], [326, 3], [344, 8]] as const) {
        drawSpr(ctx, 'tree_pine', tx, groundY - 34 + dy);
      }
    }

    // 地面
    for (let col = 0; col < Math.ceil(VW / 16); col++) {
      drawSpr(ctx, `tile_s0_${col % 2 === 0 ? 'a' : 'b'}`, col * 16, groundY + 18);
    }
    fillRect(ctx, 0, groundY + 14, VW, 4, COLORS.greenDark);

    // 柵
    if (hasSpr('fence')) {
      for (let col = 0; col < Math.ceil(VW / 16); col++) {
        drawSpr(ctx, 'fence', col * 16, groundY + 2);
      }
    }

    // 小屋
    const hx = 20;
    if (hasSpr('lodge')) {
      drawSpr(ctx, 'lodge', hx, groundY - 58);
    } else {
      // スプライトが無い環境でも「建物がある」ことだけは分かるようにしておく
      fillRect(ctx, hx, groundY - 40, 96, 54, COLORS.woodMid);
      fillRect(ctx, hx - 6, groundY - 52, 108, 12, COLORS.redDark);
      fillRect(ctx, hx + 12, groundY - 30, 20, 16, COLORS.gold);
      fillRect(ctx, hx + 60, groundY - 30, 20, 16, COLORS.gold);
      fillRect(ctx, hx + 38, groundY - 22, 18, 36, COLORS.black);
    }

    // 看板。板はスプライト、文字はフォントで重ねる
    // 看板は 64×24。板面の内寸は62pxで、'DELVERS'（8px字形で48px）が
    // 左右7pxの余白つきで収まる
    const sx0 = hx + 98;
    if (hasSpr('lodge_sign')) {
      drawSpr(ctx, 'lodge_sign', sx0, groundY - 36);
      drawTextCentered(ctx, 'DELVERS', sx0 + 32, groundY - 27, 8, THEME.gold);
    } else {
      fillRect(ctx, sx0, groundY - 36, 64, 24, COLORS.panel2);
      drawTextCentered(ctx, 'DELVERS', sx0 + 32, groundY - 30, 8, THEME.gold);
    }

    // 小物
    if (hasSpr('barrel')) drawSpr(ctx, 'barrel', hx + 88, groundY + 2);
    if (hasSpr('crate')) drawSpr(ctx, 'crate', hx + 102, groundY + 4);
    if (hasSpr('crate')) drawSpr(ctx, 'crate', 300, groundY + 4);
    if (hasSpr('barrel')) drawSpr(ctx, 'barrel', 318, groundY + 2);

    // 焚き火（2コマ）
    if (hasSpr('campfire_0')) {
      drawSpr(ctx, `campfire_${Math.floor(this.t * 4) % 2}`, 168, groundY);
    }

    // 待機中の冒険者だけを小屋の前に立たせる
    let sx = 216;
    for (const jobId of this.jobs()) {
      if (this.nav.state.isBusy(jobId)) continue;
      const bob = Math.floor(this.t * 2 + sx) % 2;
      // 等倍で描く。2倍にするとスプライトの1pxアウトラインが2pxになり、
      // 同じ情景の中に1pxの柵や小屋と2pxの人物が混在してしまう（批評 A-c）
      // 柵より手前（下）に立たせる。柵の高さに重ねると腰から下が隠れる
      drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', sx, groundY + 2 - bob);
      sx += 22;
    }
    ctx.restore();
    fillRect(ctx, 0, SCENE_Y + SCENE_H - 1, VW, 1, THEME.outline);
  }

  /**
   * 派遣スロット＝設計書 §9 の「中央のイベント領域」。
   *
   * この作品は戦闘を見せない設計（§2）なので、プレイヤーが「ゲームが今
   * 何をしているのか」を知る手がかりはここしかない。誰が・どこへ・あと何分か、
   * の3つを必ず1行で読めるようにする。待機中なら「今すぐ出せる」ことを、
   * 装備が欠けているなら「何が足りないか」を、同じ位置に出す。
   */
  private drawSlot(ctx: CanvasRenderingContext2D, jobId: JobId, x: number, y: number): void {
    const st = this.nav.state;
    const w = VW - 16;
    const job = jobDef(jobId);
    const running = st.data.dispatches.find(d => d.jobId === jobId);

    drawPanel(ctx, x, y, w, SLOT_H, { accent: running ? ROLE.progress : undefined });
    drawSprOr(ctx, JOB_SPRITE[jobId], 'portrait', x + SPACE.sm, y + 8);
    drawText(ctx, job.name, x + 24, y + SPACE.sm, TEXT.body, THEME.text);

    const eq = st.data.equipped[jobId];
    const weapon = st.itemById(eq.weapon);
    const armor = st.itemById(eq.armor);

    if (running) {
      const p = st.progressOf(running);
      const stage = stageDef(running.stageId);
      drawText(ctx, `${stage.name}へ潜行中`, x + 24, y + 20, TEXT.body, ROLE.progress);
      drawSprOr(ctx, 'icon_hourglass', 'icon_T1', x + w - 108, y + 3);
      drawTextRight(ctx, `残り ${formatDuration(p.remainingSec)}`, x + w - SPACE.md, y + 5,
        TEXT.body, THEME.text);
      drawProgress(ctx, x + w - 106, y + 24, 98, 8, p.ratio, ROLE.progress);
    } else if (weapon && armor) {
      drawText(ctx, '待機中', x + 24, y + 20, TEXT.body, THEME.dim);
      // 装備中の2点は常時確認する情報（§1 Layer 1）。ここに必ず出す
      let ix = x + w - 44;
      for (const it of [armor, weapon]) {
        fillRect(ctx, ix, y + 11, 20, 20, ROLE.edge);
        drawSprOr(ctx, itemIconName(it), 'icon_W1', ix + 2, y + 13);
        ix -= 24;
      }
    } else {
      drawText(ctx, weapon ? '防具が無い' : armor ? '武器が無い' : '装備が足りない',
        x + 24, y + 20, TEXT.body, ROLE.negative);
    }
  }

  private drawMenu(ctx: CanvasRenderingContext2D, m: MenuEntry, x: number, y: number): void {
    const w = VW - 16;
    // 「やることが無い」状態は全部同じに見せる。
    // 以前は開封だけ暗転し、帰還レポートは中身が0でも明るいままで、
    // 押すと deny 音が鳴るだけだった
    const enabled = !m.needsBadge || m.badge > 0;
    drawNineSlice(ctx, 'button', x, y, w, MENU_H);
    // 暗幕はラベルより先。文字の上からディザを被せると字形が抜けて読めなくなる
    if (!enabled) fillScrim(ctx, x + 1, y + 1, w - 2, MENU_H - 2, THEME.bg, 0.5);
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
      // 未処理の件数。全画面で同じ見た目のバッジを使う
      const txt = String(Math.min(99, m.badge));
      drawBadge(ctx, x + w - 28, y + Math.floor(MENU_H / 2) - 7, txt, ROLE.negative);
    }
  }

  pointerDown(px: number, py: number): void {
    const st = this.nav.state;
    if (this.slotBtnVisible && hitButton(this.slotBtn, px, py)) {
      const cost = st.nextSlot()?.cost ?? 0;
      if (st.unlockSlot()) {
        sfx('confirm');
        this.fb.float(this.slotBtn.x, this.slotBtn.y - 4, -cost, 'G');
        this.fb.notify('冒険者を雇った', ROLE.positive);
      } else {
        sfx('deny');
      }
      return;
    }
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
