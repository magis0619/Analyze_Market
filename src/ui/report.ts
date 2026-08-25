import type { GameScreen, Nav } from '../game/app';
import type { RunResult } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSpr, drawSprOr, fillRect, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, drawTextWrapped, wrapText } from '../render/font';
import { THEME } from './theme';
import { drawBtn, hitBtn, type Btn } from './widgets';
import { jobDef, retreatRuleDef } from '../data/jobs';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { itemIconName, RARITY_COLOR } from './itemview';
import { Effects } from '../render/effects';

// 帰還レポート（§7.3）。ベンチマークは Idle Slayer、観点は「何が起きたか3秒で分かるか」。
//
// **見どころ3行が最重要。** なぜその結果になったかが分からないと、完全な運ゲーに
// 感じられる（§7.3）。結果1行 → 見どころ3行 → 到達深度グラフ → 戦利品、の順で
// 上から重要度が下がるように積む。

const GRAPH_X = 12;
const GRAPH_Y = 232;
const GRAPH_W = 96;
const GRAPH_H = 200;

export class ReportScreen implements GameScreen {
  private result: RunResult | null;
  private effects = new Effects();
  private t = 0;
  private nextBtn: Btn = { x: 12, y: VH - 46, w: VW - 24, h: 38, label: '', accent: true };
  private died: boolean;

  constructor(private nav: Nav, private dispatchId: string) {
    this.result = nav.state.data.results[dispatchId] ?? null;
    this.died = this.result?.outcome === 'death';
    if (this.died) {
      sfx('death');
      this.effects.holdDeath();
    } else {
      sfx('letter');
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.effects.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.result;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    if (!r) {
      drawTextCentered(ctx, 'レポートがない', VW / 2, 200, 12, THEME.dim);
      this.nextBtn.label = '拠点へ';
      drawBtn(ctx, this.nextBtn, 12);
      return;
    }

    const d = this.nav.state.dispatchInfo(this.dispatchId);
    const stageId = d?.stageId ?? 1;
    const stage = stageDef(stageId);

    // ヘッダ
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawText(ctx, '帰還レポート', 8, 8, 12, THEME.text);
    drawTextRight(ctx, stage.name, VW - 8, 8, 12, THEME.dim);

    // --- 結果1行（§7.3）---
    const accent = r.outcome === 'death' ? THEME.red
      : r.outcome === 'clear' ? THEME.green : THEME.gold;
    drawNineSlice(ctx, 'frame', 8, 32, VW - 16, 46);
    drawTextWrapped(ctx, r.headline, 16, 42, VW - 32, 12, accent, 2);

    // --- 見どころ3行（最重要）---
    drawText(ctx, '見どころ', 12, 86, 8, THEME.dim);
    // 枠は中身の行数で決める。固定高だと下半分が空いて「情報が薄い画面」に見える
    const wrapped = r.highlights.map(l => wrapText(l, VW - 46, 8, 3));
    const boxH = 16 + wrapped.reduce((n, w) => n + w.length * 13 + 4, 0);
    drawNineSlice(ctx, 'frame', 8, 98, VW - 16, boxH);
    let hy = 106;
    wrapped.forEach((lines, i) => {
      fillRect(ctx, 16, hy + 3, 4, 4, i === 0 ? THEME.gold : THEME.dim);
      lines.forEach((ln, k) => drawText(ctx, ln, 26, hy + k * 13, 8, THEME.text));
      hy += lines.length * 13 + 4;
    });

    // --- 到達深度グラフ（v1の縦断面を静止画に転用 §1.1）---
    this.drawDepthGraph(ctx, r, stage.encounters);

    // --- 戦利品 ---
    const lx = GRAPH_X + GRAPH_W + 12;
    drawText(ctx, '戦利品', lx, GRAPH_Y - 14, 8, THEME.dim);
    drawNineSlice(ctx, 'frame', lx, GRAPH_Y, VW - lx - 12, GRAPH_H);
    if (r.outcome === 'death') {
      drawTextWrapped(ctx, '戦利品は全て失われた。装備していた2点も砕けて還らなかった。',
        lx + 8, GRAPH_Y + 12, VW - lx - 28, 8, THEME.red, 4);
      drawTextWrapped(ctx, '（冒険者本人は無事に帰還した。最低限の装備は支給される）',
        lx + 8, GRAPH_Y + 66, VW - lx - 28, 8, THEME.dim, 4);
    } else {
      // 未鑑定のまま見せる（中身は開封まで分からない）
      const cols = 4;
      r.loot.slice(0, 10).forEach((_it, i) => {
        const cx = lx + 10 + (i % cols) * 40;
        const cy = GRAPH_Y + 12 + Math.floor(i / cols) * 40;
        fillRect(ctx, cx, cy, 32, 32, THEME.outline);
        strokeRect1(ctx, cx, cy, 32, 32, THEME.panelLight);
        // 未鑑定なので中身は伏せる
        drawTextCentered(ctx, '?', cx + 16, cy + 10, 12, THEME.dim);
      });
      drawText(ctx, `未鑑定品 ${r.loot.length}個`, lx + 10, GRAPH_Y + GRAPH_H - 34, 8, THEME.gold);
      drawText(ctx, `${r.gold}G を持ち帰った`, lx + 10, GRAPH_Y + GRAPH_H - 20, 8, THEME.gold);
    }

    // 添え情報
    const job = d ? jobDef(d.jobId).name : '';
    const rule = d ? retreatRuleDef(d.retreatRule).name : '';
    drawText(ctx, `${job}／${rule}／到達 ${r.depth}/${r.encountersTotal}`, 12, VH - 62, 8, THEME.dim);

    this.nextBtn.label = r.outcome === 'death' ? '拠点へ戻る'
      : r.loot.length > 0 ? `未鑑定品 ${r.loot.length}個を開封する` : '拠点へ戻る';
    drawBtn(ctx, this.nextBtn, 12);

    this.effects.applyDesaturate(ctx, 0, 26, VW, VH - 26);
    this.effects.drawParticles(ctx);
  }

  /** 到達深度の縦断面。v1のタイルをそのまま使う（リアルタイム降下は不要・静止画1枚）。 */
  private drawDepthGraph(ctx: CanvasRenderingContext2D, r: RunResult, total: number): void {
    drawText(ctx, '到達深度', GRAPH_X, GRAPH_Y - 14, 8, THEME.dim);
    ctx.save();
    ctx.beginPath();
    ctx.rect(GRAPH_X, GRAPH_Y, GRAPH_W, GRAPH_H);
    ctx.clip();

    const rows = Math.ceil(GRAPH_H / 16);
    for (let row = 0; row < rows; row++) {
      const s = Math.min(3, Math.floor((row / rows) * 4));
      for (let col = 0; col < Math.ceil(GRAPH_W / 16); col++) {
        const h = ((row * 31 + col * 17) * 2654435761) >>> 0;
        drawSpr(ctx, `tile_s${s}_${(h & 1) === 0 ? 'a' : 'b'}`,
          GRAPH_X + col * 16, GRAPH_Y + row * 16);
      }
    }
    // 掘り抜いた縦穴
    const shaftX = GRAPH_X + Math.floor(GRAPH_W / 2) - 8;
    const reached = Math.round((r.depth / Math.max(1, total)) * GRAPH_H);
    fillRect(ctx, shaftX, GRAPH_Y, 16, reached, THEME.outline);
    for (let y = 0; y < reached; y += 16) {
      drawSpr(ctx, 'ladder', shaftX, GRAPH_Y + y);
    }

    // HP推移を縦穴の脇に折れ線で描く
    const curve = r.hpCurve;
    for (let i = 1; i < curve.length; i++) {
      const y0 = GRAPH_Y + Math.round(((i - 1) / Math.max(1, total)) * GRAPH_H);
      const y1 = GRAPH_Y + Math.round((i / Math.max(1, total)) * GRAPH_H);
      const v0 = curve[i - 1] ?? 1;
      const v1 = curve[i] ?? 1;
      const x0 = GRAPH_X + 4 + Math.round((1 - v0) * 20);
      const x1 = GRAPH_X + 4 + Math.round((1 - v1) * 20);
      const steps = Math.max(1, y1 - y0);
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / steps);
        const y = y0 + k;
        fillRect(ctx, x, y, 2, 2, v1 > 0.5 ? THEME.green : v1 > 0.25 ? THEME.gold : THEME.red);
      }
    }

    // 到達点のマーカー
    const markY = GRAPH_Y + Math.min(GRAPH_H - 16, reached);
    drawSprOr(ctx, r.outcome === 'death' ? 'hero_dead' : 'hero_walk_0', 'portrait',
      shaftX, markY - 8);
    ctx.restore();

    strokeRect1(ctx, GRAPH_X, GRAPH_Y, GRAPH_W, GRAPH_H, THEME.panelLight);
    // 目盛り
    for (let i = 0; i <= total; i += Math.max(1, Math.floor(total / 4))) {
      const y = GRAPH_Y + Math.round((i / Math.max(1, total)) * GRAPH_H);
      fillRect(ctx, GRAPH_X, Math.min(GRAPH_Y + GRAPH_H - 1, y), 4, 1, THEME.dim);
    }
    drawTextCentered(ctx, `${r.depth} / ${total}`, GRAPH_X + GRAPH_W / 2, GRAPH_Y + GRAPH_H + 4, 8,
      r.outcome === 'death' ? THEME.red : THEME.text);
  }

  pointerDown(px: number, py: number): void {
    if (!hitBtn(this.nextBtn, px, py)) return;
    const st = this.nav.state;
    st.data.inbox = st.data.inbox.filter(id => id !== this.dispatchId);
    st.save();
    sfx('confirm');
    const r = this.result;
    if (r && r.outcome !== 'death' && st.data.pending.length > 0) {
      this.nav.goOpening(st.data.pending);
    } else {
      this.nav.goBase();
    }
  }
}

/** 見どころが3行に収まっているかの目安（テスト用）。 */
export function highlightLineCount(lines: string[], width = VW - 46): number {
  return lines.reduce((n, l) => n + wrapText(l, width, 8, 3).length, 0);
}

export { RARITY_COLOR, itemIconName };
