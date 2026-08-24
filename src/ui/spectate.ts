import type { App, GameScreen } from '../game/app';
import { VW, VH } from '../render/screen';
import { simulate, RUN_SECONDS } from '../sim/simulate';
import type { OfferedOption, PendingChoice, SimEvent } from '../sim/types';
import { STRATA } from '../render/palette';
import { drawNineSlice, drawSpr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, textWidth } from '../render/font';
import { THEME } from './theme';
import { Effects } from '../render/effects';
import { sfx } from '../render/audio';
import { lootDef } from '../data/loot';
import { equipDef } from '../data/equipment';
import { Prng } from '../sim/prng';
import { inRect } from './widgets';

// 観戦フェーズ：決定論シミュレーションの結果 (SimEvent[]) を時間軸に沿って
// 再生するだけの画面。ここにゲームロジックを持たせない（仕様 §4）。

const METER_W = 20;
const DUN_X = METER_W;
const DUN_W = 244;
const LOG_X = DUN_X + DUN_W;
const LOG_W = VW - LOG_X;
const PPD = 48;            // 1深度あたりのピクセル
const HERO_SCREEN_Y = 250; // 冒険者の固定表示位置
const CHOICE_SECONDS = 5;

interface LogEntry { text: string; color: string; }
interface Marker { depth: number; icon: string; }
interface Banner { text: string; color: string; t: number; }

function rowHash(n: number): number {
  return ((n * 2654435761) >>> 0);
}

// はしごは1本の縦穴に通す（蛇行させると梯子が宙に浮いて見える）。
// 代わりに行ごとに掘り広げた欠けを添えて単調さを消す。
const SHAFT_COL = 7;

function shaftCenter(_row: number): number {
  return SHAFT_COL;
}

/** その行で追加で開いている列（横に掘り広げた跡）。なければ -1。 */
function shaftNotch(row: number): number {
  const h = rowHash(row);
  if (h % 4 !== 0) return -1;
  return SHAFT_COL + ((h >> 3) & 1 ? 2 : -2);
}

export class SpectateScreen implements GameScreen {
  private clock = 0;
  private cursor = 0;
  private events: SimEvent[];
  private pending: PendingChoice | null = null;
  private panelOpen = false;
  private panelTimer = 0;
  private panelFlash = 0;
  private displayDepth = 0;
  private targetDepth = 0;
  private hp: number;
  private maxHp: number;
  private miningUntil = 0;
  private hitBlink = 0;
  private dead = false;
  private retreatT = -1;
  private log: LogEntry[] = [];
  private markers: Marker[] = [];
  private banners: Banner[] = [];
  private effects = new Effects();
  private finished = false;
  private finishT = 0;
  private rareZoom = 0;

  constructor(private app: App) {
    const run = app.run;
    if (!run) throw new Error('no active run');
    this.maxHp = run.adv.maxHp;
    this.hp = run.adv.maxHp;
    const res = simulate({
      seed: run.seed, adventurer: run.adv,
      equipment: run.equipment, choices: run.choices
    });
    this.events = res.events;
    this.pending = res.pending ?? null;
    if (res.outcome) run.outcome = res.outcome;
    this.pushLog(`${run.adv.name}が潜り始めた`, THEME.dim);
  }

  private pushLog(text: string, color: string): void {
    this.log.push({ text, color });
    if (this.log.length > 18) this.log.shift();
  }

  private pushBanner(text: string, color: string): void {
    this.banners.push({ text, color, t: 2.4 });
  }

  private heroRow(): number {
    return Math.max(0, Math.floor((this.displayDepth * PPD) / 16));
  }

  private heroScreenX(): number {
    return DUN_X + shaftCenter(this.heroRow()) * 16;
  }

  update(dt: number): void {
    const run = this.app.run;
    if (!run) return;

    for (const b of this.banners) b.t -= dt;
    this.banners = this.banners.filter(b => b.t > 0);
    this.effects.update(dt);
    if (this.hitBlink > 0) this.hitBlink -= dt;
    if (this.rareZoom > 0 && this.effects.freeze === 0) this.rareZoom = 0;

    if (this.panelOpen) {
      this.panelTimer -= dt;
      this.panelFlash += dt;
      if (this.app.auto && this.panelTimer < CHOICE_SECONDS - 0.7) {
        this.autoPick();
        return;
      }
      if (this.panelTimer <= 0 && this.pending) {
        this.select(this.pending.safeIndex);
      }
      return;
    }
    if (this.effects.freeze > 0) return;

    if (this.finished) {
      this.finishT += dt;
      if (this.finishT > (this.dead ? 1.0 : 0.8)) {
        this.app.gotoResult();
      }
      return;
    }

    this.clock += dt * this.app.speed;
    // 表示深度をなめらかに追従させる
    const rate = 0.6 * this.app.speed;
    if (this.displayDepth < this.targetDepth) {
      this.displayDepth = Math.min(this.targetDepth, this.displayDepth + rate * dt);
    }

    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor];
      if (!ev || ev.t > this.clock) break;
      this.cursor++;
      this.processEvent(ev);
      if (this.panelOpen || this.effects.freeze > 0) return;
    }
  }

  private autoPick(): void {
    if (!this.pending) return;
    const rng = new Prng((this.app.run?.seed ?? 1) ^ (this.pending.slot * 977) ^ 0x51f);
    const enabled = this.pending.options
      .map((o, i) => ({ o, i }))
      .filter(e => !e.o.disabled);
    const pick = enabled.length > 0 ? rng.pick(enabled).i : 0;
    this.select(pick);
  }

  private processEvent(ev: SimEvent): void {
    const run = this.app.run;
    if (!run) return;
    switch (ev.kind) {
      case 'depart':
        break;
      case 'depth':
        this.targetDepth = ev.depth;
        break;
      case 'stratum':
        if (ev.stratum > 0) {
          const names = ['表土', '岩盤', '深層', '深淵'];
          this.pushLog(`${names[ev.stratum] ?? ''}に入った`, THEME.dim);
        }
        break;
      case 'log':
        this.pushLog(ev.text, THEME.dim);
        break;
      case 'choice': {
        this.markers.push({ depth: ev.depth, icon: ev.icon });
        if (ev.forced !== undefined) {
          this.pushBanner(`強欲が疼く──「${ev.eventName}」を必ず掘る！`, THEME.gold);
          this.pushLog(`${ev.eventName}に出くわした`, THEME.text);
        } else if (this.pending && ev.slot === this.pending.slot) {
          this.panelOpen = true;
          this.panelTimer = CHOICE_SECONDS;
          this.panelFlash = 0;
          const hasEquipOpt = this.pending.options.some(o => o.sourceEquip.length > 0);
          if (hasEquipOpt) sfx('unlock');
          else sfx('tap');
          this.pushLog(`${ev.eventName}に出くわした`, THEME.text);
        } else {
          this.pushLog(`${ev.eventName}に出くわした`, THEME.text);
        }
        break;
      }
      case 'resolve':
        this.pushLog(ev.text, ev.byEquip.length > 0 ? THEME.gold : THEME.dim);
        break;
      case 'damage':
        this.hp = ev.hp;
        this.hitBlink = 0.5;
        sfx('damage');
        this.pushLog(`${ev.text}で ${ev.amount} の傷`, THEME.red);
        break;
      case 'heal':
        this.hp = ev.hp;
        sfx('loot');
        this.pushLog(`傷薬で ${ev.amount} 回復`, THEME.green);
        break;
      case 'loot': {
        const def = lootDef(ev.lootId);
        if (ev.rare) {
          sfx('rare');
          this.rareZoom = 1;
          this.effects.holdRare(this.heroScreenX() + 8, HERO_SCREEN_Y + 8);
          this.pushBanner(`レア発見！「${def.name}」`, THEME.gold);
          this.pushLog(`★${def.name}を掘り当てた！`, THEME.gold);
        } else {
          sfx('loot');
          this.pushLog(`${def.name}を手に入れた`, THEME.gold);
        }
        break;
      }
      case 'gold':
        sfx('loot');
        this.pushLog(`${ev.amount}Gを拾った`, THEME.gold);
        break;
      case 'mine':
        this.miningUntil = Math.max(this.miningUntil, ev.t + ev.seconds);
        this.pushLog(`採掘に${ev.seconds}秒を費やす`, THEME.dim);
        break;
      case 'retreat':
        this.retreatT = this.clock;
        this.pushBanner('臆病──ここまでだ、と踵を返した', THEME.blue);
        this.pushLog(ev.reason, THEME.blue);
        break;
      case 'death':
        this.dead = true;
        sfx('death');
        this.effects.holdDeath();
        this.pushBanner(`${this.app.run?.adv.name}は帰らなかった`, THEME.red);
        this.pushLog(`${ev.cause}に倒れた……`, THEME.red);
        this.finished = true;
        break;
      case 'end':
        this.finished = true;
        if (!this.dead && this.retreatT < 0) {
          this.pushLog('地上へ戻り始めた', THEME.dim);
        }
        break;
    }
  }

  private select(index: number): void {
    const run = this.app.run;
    if (!run || !this.pending) return;
    const opt = this.pending.options[index];
    if (!opt || opt.disabled) { sfx('deny'); return; }
    sfx('confirm');
    run.choices.push(index);
    const slot = this.pending.slot;
    const res = simulate({
      seed: run.seed, adventurer: run.adv,
      equipment: run.equipment, choices: run.choices
    });
    this.events = res.events;
    this.pending = res.pending ?? null;
    if (res.outcome) run.outcome = res.outcome;
    // 同じ選択イベントの直後から再生を続ける（それ以前は決定論により同一）
    const idx = this.events.findIndex(e => e.kind === 'choice' && e.slot === slot);
    this.cursor = idx >= 0 ? idx + 1 : this.cursor;
    this.panelOpen = false;
  }

  // ---------------------------------------------------------------- draw

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    const zoomed = this.effects.freeze > 0 && (this.rareZoom > 0 || this.dead);

    ctx.save();
    ctx.beginPath();
    ctx.rect(DUN_X, 0, DUN_W, VH);
    ctx.clip();
    if (zoomed) {
      const hx = this.heroScreenX() + 8;
      const hy = HERO_SCREEN_Y + 8;
      ctx.translate(hx, hy);
      ctx.scale(2, 2);
      ctx.translate(-hx, -hy);
    }
    this.drawWorld(ctx);
    this.effects.drawParticles(ctx);
    ctx.restore();
    this.effects.applyDesaturate(ctx, DUN_X, 0, DUN_W, VH);

    this.drawMeter(ctx);
    this.drawLog(ctx);
    this.drawHud(ctx);

    let by = 30;
    for (const b of this.banners) {
      const w = textWidth(b.text, 12) + 16;
      fillRect(ctx, Math.floor((DUN_X + DUN_W / 2) - w / 2), by - 4, w, 20, 'rgba(13,10,18,0.85)');
      drawTextCentered(ctx, b.text, DUN_X + DUN_W / 2, by, 12, b.color);
      by += 24;
    }

    if (this.panelOpen && this.pending) this.drawPanel(ctx, this.pending);
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const scroll = Math.round(this.displayDepth * PPD) - HERO_SCREEN_Y;
    const firstRow = Math.floor(scroll / 16) - 1;
    const lastRow = Math.floor((scroll + VH) / 16) + 1;

    for (let r = firstRow; r <= lastRow; r++) {
      const sy = r * 16 - scroll;
      if (r < 0) {
        // 地上（夜空・星・店）
        fillRect(ctx, DUN_X, sy, DUN_W, 16, '#0c0810');
        for (let col = 0; col < Math.ceil(DUN_W / 16); col++) {
          const h = rowHash(r * 53 + col * 7);
          if (h % 5 === 0) {
            fillRect(ctx, DUN_X + col * 16 + (h % 13), sy + ((h >> 4) % 13), 1, 1, '#b8b0a8');
          }
        }
        if (r === -1) {
          fillRect(ctx, DUN_X, sy + 12, DUN_W, 4, '#3c6430');
          // 店（穴の左脇の小屋）
          const hx = DUN_X + (SHAFT_COL - 3) * 16;
          fillRect(ctx, hx, sy - 10, 36, 22, '#5a3c22');
          fillRect(ctx, hx - 4, sy - 16, 44, 8, '#802828');
          fillRect(ctx, hx - 2, sy - 10, 40, 2, THEME.outline);
          fillRect(ctx, hx + 24, sy - 4, 8, 16, '#e8c84c');
          fillRect(ctx, hx + 6, sy - 4, 10, 8, '#0c0810');
        }
        continue;
      }
      const s = Math.min(3, Math.floor(r / 9));
      const theme = STRATA[s];
      const c = shaftCenter(r);
      const notch = shaftNotch(r);
      for (let col = 0; col < Math.ceil(DUN_W / 16); col++) {
        const sx = DUN_X + col * 16;
        if ((col >= c - 1 && col <= c + 1) || col === notch) {
          drawSpr(ctx, `wall_s${s}`, sx, sy);
        } else {
          const variant = (rowHash(r * 31 + col) & 1) === 0 ? 'a' : 'b';
          drawSpr(ctx, `tile_s${s}_${variant}`, sx, sy);
        }
      }
      // 地層の境界線
      if (r % 9 === 0 && r > 0 && theme) {
        fillRect(ctx, DUN_X, sy, DUN_W, 1, THEME.outline);
      }
      drawSpr(ctx, 'ladder', DUN_X + c * 16, sy);
    }

    // イベントマーカー
    for (const m of this.markers) {
      const my = Math.round(m.depth * PPD) - scroll;
      if (my < -16 || my > VH + 16) continue;
      const row = Math.floor((m.depth * PPD) / 16);
      const mc = shaftCenter(row);
      drawSpr(ctx, `ev_${m.icon}`, DUN_X + (mc + 1) * 16 + 2, my - 8);
    }

    // 冒険者
    const hx = this.heroScreenX();
    const hy = HERO_SCREEN_Y;
    const mining = this.clock < this.miningUntil;
    if (this.dead) {
      drawSpr(ctx, 'hero_dead', hx, hy);
    } else if (this.hitBlink > 0 && Math.floor(this.hitBlink * 12) % 2 === 0) {
      drawSpr(ctx, 'hero_hit', hx, hy);
    } else if (mining) {
      drawSpr(ctx, `hero_mine_${Math.floor(this.clock * 4) % 2}`, hx, hy);
    } else {
      const moving = this.displayDepth < this.targetDepth - 0.001 || !this.finished;
      const f = moving ? Math.floor(this.clock * 5) % 4 : 0;
      drawSpr(ctx, `hero_walk_${f}`, hx, hy);
    }
  }

  private drawMeter(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, METER_W, VH, THEME.outline);
    const scroll = Math.round(this.displayDepth * PPD) - HERO_SCREEN_Y;
    const quest = this.app.run?.adv.questDepth ?? 0;
    for (let d = 0; d <= 12; d++) {
      const y = d * PPD - scroll;
      if (y < -8 || y > VH + 8) continue;
      fillRect(ctx, METER_W - 6, y, 6, 1, THEME.faint);
      if (d % 2 === 0) drawText(ctx, String(d), 2, y - 4, 8, THEME.dim);
      if (d === quest) {
        fillRect(ctx, METER_W - 8, y - 1, 8, 3, THEME.gold);
        drawText(ctx, String(d), 2, y - 4, 8, THEME.gold);
      }
    }
    // 現在位置
    fillRect(ctx, METER_W - 4, HERO_SCREEN_Y + 7, 4, 3, THEME.red);
  }

  private drawLog(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, LOG_X, 0, LOG_W, VH, THEME.panel);
    fillRect(ctx, LOG_X, 0, 1, VH, THEME.outline);
    drawText(ctx, '記録', LOG_X + 6, 6, 8, THEME.dim);
    fillRect(ctx, LOG_X + 4, 17, LOG_W - 8, 1, THEME.faint);

    // 下から積む。1行11px、最大2行。
    let y = VH - 14;
    for (let i = this.log.length - 1; i >= 0 && y > 24; i--) {
      const e = this.log[i];
      if (!e) continue;
      const lines = this.wrapLog(e.text);
      y -= lines.length * 11;
      lines.forEach((ln, j) => {
        drawText(ctx, ln, LOG_X + 5, y + j * 11, 8, e.color);
      });
      y -= 3;
    }
  }

  private wrapLog(text: string): string[] {
    const maxW = LOG_W - 10;
    const lines: string[] = [];
    let cur = '';
    for (const ch of text) {
      if (textWidth(cur + ch, 8) > maxW && cur.length > 0) {
        lines.push(cur);
        cur = ch;
        if (lines.length === 2) break;
      } else {
        cur += ch;
      }
    }
    if (lines.length < 2 && cur.length > 0) lines.push(cur);
    return lines;
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const run = this.app.run;
    if (!run) return;
    fillRect(ctx, DUN_X, 0, DUN_W, 16, 'rgba(13,10,18,0.8)');
    drawText(ctx, `${run.adv.name} Lv${run.adv.level}`, DUN_X + 4, 4, 8, THEME.text);
    // HP
    drawSpr(ctx, 'heart', DUN_X + 110, 4);
    const bw = 70;
    fillRect(ctx, DUN_X + 122, 6, bw, 6, THEME.outline);
    const ratio = Math.max(0, this.hp) / this.maxHp;
    fillRect(ctx, DUN_X + 123, 7, Math.round((bw - 2) * ratio), 4,
      ratio > 0.5 ? THEME.green : ratio > 0.25 ? THEME.gold : THEME.red);
    drawTextRight(ctx, `深度${Math.floor(this.displayDepth)}`, DUN_X + DUN_W - 4, 4, 8, THEME.dim);
  }

  private drawPanel(ctx: CanvasRenderingContext2D, pending: PendingChoice): void {
    const px = 4, pw = VW - 8;
    const rows = pending.options.length;
    const ph = 58 + rows * 40;
    const py = VH - ph - 4;
    drawNineSlice(ctx, 'frame', px, py, pw, ph);
    drawSpr(ctx, `ev_${pending.icon}`, px + 10, py + 8, 2);
    drawText(ctx, pending.eventName, px + 48, py + 14, 12, THEME.text);
    // 5秒タイマー
    const ratio = this.panelTimer / CHOICE_SECONDS;
    fillRect(ctx, px + 8, py + 40, pw - 16, 4, THEME.outline);
    fillRect(ctx, px + 9, py + 41, Math.round((pw - 18) * ratio), 2,
      ratio < 0.35 ? THEME.red : THEME.gold);

    pending.options.forEach((o, i) => {
      const oy = py + 50 + i * 40;
      this.drawOption(ctx, o, px + 8, oy, pw - 16, 36, i === pending.safeIndex);
    });
  }

  private drawOption(
    ctx: CanvasRenderingContext2D, o: OfferedOption,
    x: number, y: number, w: number, h: number, isSafe: boolean
  ): void {
    drawNineSlice(ctx, 'button', x, y, w, h);
    const fromEquip = o.sourceEquip.length > 0;
    if (fromEquip && !o.disabled) strokeRect1(ctx, x, y, w, h, THEME.gold);
    const color = o.disabled ? THEME.faint : fromEquip ? THEME.gold : THEME.text;
    drawText(ctx, o.def.label, x + 10, y + Math.floor((h - 12) / 2), 12, color);
    // 根拠となる装備アイコン（因果の表示）。開いた瞬間は1回光る。
    const blink = this.panelFlash < 0.75 && Math.floor(this.panelFlash * 10) % 2 === 0;
    o.sourceEquip.forEach((id, j) => {
      const ix = x + w - 24 - j * 22;
      const iy = y + Math.floor((h - 16) / 2);
      if (fromEquip && blink) {
        fillRect(ctx, ix - 2, iy - 2, 20, 20, THEME.gold);
      }
      drawSpr(ctx, `icon_${id}`, ix, iy);
    });
    if (o.disabled) {
      ctx.fillStyle = 'rgba(26,20,32,0.5)';
      ctx.fillRect(x, y, w, h);
      drawTextRight(ctx, `選べない（${o.disabledReason ?? ''}）`, x + w - 6, y + 4, 8, THEME.red);
    } else if (isSafe) {
      drawText(ctx, '5秒で自動', x + 10, y + h - 11, 8, THEME.faint);
    }
    if (fromEquip && !o.disabled) {
      drawText(ctx, `${o.sourceEquip.map(id => equipDef(id).name).join('と')}があるから選べる`,
        x + 10, y + h - 11, 8, THEME.goldDark);
    }
  }

  pointerDown(x: number, y: number): void {
    if (!this.panelOpen || !this.pending) return;
    const px = 4, pw = VW - 8;
    const rows = this.pending.options.length;
    const ph = 58 + rows * 40;
    const py = VH - ph - 4;
    for (let i = 0; i < rows; i++) {
      const oy = py + 50 + i * 40;
      if (inRect(x, y, px + 8, oy, pw - 16, 36)) {
        this.select(i);
        return;
      }
    }
  }
}

export const SPECTATE_MAX_SECONDS = RUN_SECONDS;
