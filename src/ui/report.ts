import type { GameScreen, Nav } from '../game/app';
import type { Item, RunResult, StageDef } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSprOr, fillRect, fillScrim, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, wrapText } from '../render/font';
import { THEME } from './theme';
import { COLORS } from '../render/palette';
import { drawBtn, hitBtn, type Btn } from './widgets';
import { jobDef, retreatRuleDef } from '../data/jobs';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { itemIconName, itemName, RARITY_COLOR } from './itemview';
import { Effects } from '../render/effects';

// 帰還レポート（§7.3）。ベンチマークは Idle Slayer、観点は「何が起きたか3秒で分かるか」。
//
// **見どころ3行が最重要。** なぜその結果になったかが分からないと、完全な運ゲーに
// 感じられる（§7.3）。結果1行 → 見どころ3行 → 到達深度グラフ → 戦利品、の順で
// 上から重要度が下がるように積む。
//
// レイアウトは固定座標ではなく上から積み上げて決める。見どころは長さが可変で、
// 固定座標だと長い回に下の深度グラフへめり込んでいた。

const PAD = 8;
const GRAPH_W = 104;
const FOOTER_H = 70;

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
    const stage = stageDef(d?.stageId ?? 1);

    // ヘッダ
    fillRect(ctx, 0, 0, VW, 26, THEME.panel);
    drawText(ctx, '帰還レポート', PAD, 8, 12, THEME.text);
    drawTextRight(ctx, stage.name, VW - PAD, 8, 12, THEME.dim);

    let y = 30;
    y = this.drawOutcome(ctx, r, y);
    y = this.drawHighlights(ctx, r, y);

    // 残りの縦を深度グラフと戦利品で分け合う。ここで初めて高さが決まる
    const bodyTop = y + 14;
    const bodyH = Math.max(120, VH - FOOTER_H - bodyTop);
    this.drawDepthGraph(ctx, r, stage, PAD + 4, bodyTop, GRAPH_W, bodyH);
    const lx = PAD + 4 + GRAPH_W + 12;
    this.drawSpoils(ctx, r, lx, bodyTop, VW - lx - PAD, bodyH);

    // 添え情報
    const job = d ? jobDef(d.jobId).name : '';
    const rule = d ? retreatRuleDef(d.retreatRule).name : '';
    drawText(ctx, `${job}／${rule}／到達 ${r.depth}/${r.encountersTotal}`,
      12, VH - FOOTER_H + 8, 8, THEME.dim);

    this.nextBtn.label = r.outcome === 'death' ? '拠点へ戻る'
      : r.loot.length > 0 ? `未鑑定品 ${r.loot.length}個を開封する` : '拠点へ戻る';
    drawBtn(ctx, this.nextBtn, 12);

    this.effects.applyDesaturate(ctx, 0, 26, VW, VH - 26);
    this.effects.drawParticles(ctx);
  }

  /** 結果1行。戦死のときだけ帯を敷いて、他の回と取り違えようがなくする。 */
  private drawOutcome(ctx: CanvasRenderingContext2D, r: RunResult, y: number): number {
    const accent = r.outcome === 'death' ? THEME.red
      : r.outcome === 'clear' ? THEME.green : THEME.gold;

    if (r.outcome === 'death') {
      // 戦死バナー。ここだけ地の色を反転させ、一目で「今回は失った回」と分かるようにする
      const bh = 26;
      fillRect(ctx, 0, y, VW, bh, THEME.redDark);
      fillRect(ctx, 0, y, VW, 1, THEME.red);
      fillRect(ctx, 0, y + bh - 1, VW, 1, THEME.red);
      // 帯の左右を髑髏で挟む
      drawSprOr(ctx, 'skull', 'icon_skull_small', 10, y + 5);
      drawSprOr(ctx, 'skull', 'icon_skull_small', VW - 26, y + 5);
      drawTextCentered(ctx, '戦　死', VW / 2, y + 5, 12, THEME.text);
      y += bh + 4;
    }

    const lines = wrapText(r.headline, VW - 2 * PAD - 16, 12, 3);
    const h = 16 + lines.length * 19;
    drawNineSlice(ctx, 'frame', PAD, y, VW - 2 * PAD, h);
    lines.forEach((ln, i) => drawText(ctx, ln, PAD + 8, y + 8 + i * 19, 12, accent));
    return y + h;
  }

  /** 見どころ。行数が可変なので、枠の高さを中身から決める。 */
  private drawHighlights(ctx: CanvasRenderingContext2D, r: RunResult, y: number): number {
    y += 18;
    drawText(ctx, '見どころ', PAD + 4, y - 13, 8, THEME.dim);
    const w = VW - 2 * PAD;
    const wrapped = r.highlights.map(l => wrapText(l, w - 34, 8, 3));
    const h = 14 + wrapped.reduce((n, ls) => n + ls.length * 13 + 4, 0);
    drawNineSlice(ctx, 'frame', PAD, y, w, h);
    let hy = y + 7;
    wrapped.forEach((lines, i) => {
      // 1行目（最も効いた要因）だけ金の点で立てる
      fillRect(ctx, PAD + 8, hy + 4, 4, 4, i === 0 ? THEME.gold : THEME.dim);
      lines.forEach((ln, k) => drawText(ctx, ln, PAD + 18, hy + k * 13, 8, THEME.text));
      hy += lines.length * 13 + 4;
    });
    return y + h;
  }

  /**
   * 到達深度の縦断面（A-10）。
   *
   * 以前はタイルを敷き詰めただけで、どこまで潜ったのかも、どこで何があったのかも
   * 読み取れなかった。ここでは (1) 深さに応じて地層の色を変え、(2) 遭遇ごとに
   * 目盛りを刻み、(3) 到達点より下を未踏として暗く沈め、(4) HP 推移を折れ線で
   * 重ねる。1枚で「どこまで／どう削られて／どこで終わったか」が読めること。
   */
  private drawDepthGraph(
    ctx: CanvasRenderingContext2D, r: RunResult, stage: StageDef,
    x: number, y: number, w: number, h: number
  ): void {
    const total = Math.max(1, r.encountersTotal);
    drawText(ctx, '到達深度', x, y - 13, 8, THEME.dim);

    const rowH = h / total;
    const reachedY = Math.round((r.depth / total) * h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // 地層。深いほど暗く冷たい色へ落とす
    const bands = [COLORS.woodDark, COLORS.stoneDark, COLORS.panel2, COLORS.abyss];
    for (let i = 0; i < total; i++) {
      const band = bands[Math.min(bands.length - 1, Math.floor((i / total) * bands.length))]
        ?? COLORS.stoneDark;
      const y0 = y + Math.round(i * rowH);
      const y1 = y + Math.round((i + 1) * rowH);
      fillRect(ctx, x, y0, w, y1 - y0, band);
      // 岩肌のざらつき（決定的なハッシュなので毎フレーム同じ模様になる）
      const hsh = ((i * 2654435761) >>> 0);
      for (let k = 0; k < 5; k++) {
        const hx = (hsh >> (k * 3)) % Math.max(1, w - 6);
        const hy = y0 + ((hsh >> (k * 5)) % Math.max(1, y1 - y0));
        fillRect(ctx, x + hx, hy, 2, 1, THEME.outline);
      }
    }

    // 掘り抜いた縦穴（到達したところまで）
    const shaftX = x + Math.floor(w / 2) - 7;
    fillRect(ctx, shaftX, y, 14, reachedY, THEME.outline);
    for (let ly = 0; ly < reachedY; ly += 16) drawSprOr(ctx, 'ladder', 'weight_pip', shaftX - 1, y + ly);

    // 未踏の領域を沈める。「まだ下がある」ことを見せるのが狙い
    if (reachedY < h) fillScrim(ctx, x, y + reachedY, w, h - reachedY, THEME.outline, 0.62);

    // 遭遇ごとの目盛り。最後の1つ（ボス）だけ髑髏で立てる
    for (let i = 1; i <= total; i++) {
      const ly = y + Math.round(i * rowH);
      const reached = i <= r.depth;
      if (i === total) {
        drawSprOr(ctx, 'icon_skull_small', 'skull', x + w - 12, ly - 12);
      } else {
        fillRect(ctx, x, ly, reached ? 6 : 3, 1, reached ? THEME.dim : THEME.faint);
        fillRect(ctx, x + w - (reached ? 6 : 3), ly, reached ? 6 : 3, 1, reached ? THEME.dim : THEME.faint);
      }
    }

    // HP 推移。縦穴の左脇に、右へ行くほど HP が減る向きで引く
    const curve = r.hpCurve;
    const trackX = x + 3;
    const trackW = Math.max(4, shaftX - trackX - 3);
    for (let i = 1; i < curve.length; i++) {
      const v0 = curve[i - 1] ?? 1;
      const v1 = curve[i] ?? 1;
      const y0 = y + Math.round(((i - 1) / total) * h);
      const y1 = y + Math.round((i / total) * h);
      const x0 = trackX + Math.round((1 - v0) * trackW);
      const x1 = trackX + Math.round((1 - v1) * trackW);
      const steps = Math.max(1, y1 - y0);
      const col = v1 > 0.5 ? THEME.green : v1 > 0.25 ? THEME.gold : THEME.red;
      for (let k = 0; k <= steps; k++) {
        fillRect(ctx, Math.round(x0 + ((x1 - x0) * k) / steps), y0 + k, 2, 1, col);
      }
    }

    // 到達点。戦死なら倒れた姿、それ以外は立ち姿
    const markY = Math.min(h - 18, Math.max(0, reachedY - 8));
    drawSprOr(ctx, r.outcome === 'death' ? 'hero_dead' : 'hero_walk_0', 'portrait',
      shaftX - 1, y + markY);
    ctx.restore();

    strokeRect1(ctx, x, y, w, h, THEME.panelLight);
    drawTextCentered(ctx, `${r.depth} / ${total}`, x + w / 2, y + h + 4, 8,
      r.outcome === 'death' ? THEME.red : THEME.text);
    drawTextCentered(ctx, r.bossDefeated ? `${stage.name} 踏破` : '',
      x + w / 2, y + h + 18, 8, THEME.green);
  }

  /** 戦利品、または失ったもの。 */
  private drawSpoils(
    ctx: CanvasRenderingContext2D, r: RunResult,
    x: number, y: number, w: number, h: number
  ): void {
    if (r.outcome === 'death') {
      drawText(ctx, '失ったもの', x, y - 13, 8, THEME.red);
      drawNineSlice(ctx, 'frame', x, y, w, h);
      const lost = this.nav.state.data.lost[this.dispatchId] ?? [];
      let ly = y + 8;
      // 装備2点は現物を見せる。名前と枠色まで出さないと「何を失ったか」が伝わらない
      lost.slice(0, 2).forEach((it: Item) => {
        fillRect(ctx, x + 8, ly, 26, 26, THEME.outline);
        strokeRect1(ctx, x + 8, ly, 26, 26, RARITY_COLOR[it.rarity]);
        drawSprOr(ctx, itemIconName(it), 'icon_W1', x + 13, ly + 5);
        // 砕けた印として×を重ねる
        for (let k = 0; k < 26; k++) {
          fillRect(ctx, x + 8 + k, ly + k, 1, 1, THEME.red);
          fillRect(ctx, x + 33 - k, ly + k, 1, 1, THEME.red);
        }
        drawText(ctx, itemName(it), x + 40, ly + 2, 8, RARITY_COLOR[it.rarity]);
        drawText(ctx, it.slot === 'weapon'
          ? `秒間${Math.round(it.power * it.speed)}` : `防御${it.power}`,
          x + 40, ly + 15, 8, THEME.faint);
        ly += 32;
      });
      if (lost.length === 0) {
        drawText(ctx, '装備していた2点', x + 8, ly, 8, THEME.red);
        ly += 16;
      }
      ly += 6;
      fillRect(ctx, x + 8, ly, w - 16, 1, THEME.panelLight);
      ly += 8;
      drawText(ctx, `未鑑定品 ${r.loot.length}個も失われた`, x + 8, ly, 8, THEME.red);
      ly += 16;
      drawText(ctx, `持ち帰るはずだった ${r.gold}G`, x + 8, ly, 8, THEME.red);
      ly += 22;
      // 救い：本人は帰る。ここが無いと「詰んだ」と受け取られる
      wrapText('冒険者本人は無事に帰還した。最低限の装備は支給される。',
        w - 20, 8, 4).forEach((ln, i) => {
        drawText(ctx, ln, x + 8, ly + i * 13, 8, THEME.dim);
      });
      return;
    }

    drawText(ctx, '戦利品', x, y - 13, 8, THEME.dim);
    drawNineSlice(ctx, 'frame', x, y, w, h);
    // 未鑑定のまま見せる（中身は開封まで分からない）
    const cols = 4;
    const cell = 36;
    r.loot.slice(0, 10).forEach((_it, i) => {
      const cx = x + 10 + (i % cols) * cell;
      const cy = y + 10 + Math.floor(i / cols) * cell;
      fillRect(ctx, cx, cy, 30, 30, THEME.outline);
      strokeRect1(ctx, cx, cy, 30, 30, THEME.panelLight);
      // 蝋で封じた包み。中身は開封まで伏せる
      fillRect(ctx, cx + 12, cy + 12, 6, 6, THEME.redDark);
      drawTextCentered(ctx, '?', cx + 15, cy + 8, 12, THEME.dim);
    });
    let ly = y + 10 + Math.ceil(Math.min(10, r.loot.length) / cols) * cell + 8;
    drawText(ctx, `未鑑定品 ${r.loot.length}個`, x + 10, ly, 8, THEME.gold);
    ly += 16;
    drawText(ctx, `${r.gold}G を持ち帰った`, x + 10, ly, 8, THEME.gold);
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
export function highlightLineCount(lines: string[], width = VW - 2 * PAD - 34): number {
  return lines.reduce((n, l) => n + wrapText(l, width, 8, 3).length, 0);
}

export { RARITY_COLOR, itemIconName };
