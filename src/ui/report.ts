import type { GameScreen, Nav } from '../game/app';
import type { Item, RunResult, StageDef } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawNineSlice, drawSprOr, fillRect, fillScrim, strokeRect1 } from '../render/draw';
import { drawText, drawTextCentered, drawTextRight, wrapText } from '../render/font';
import { THEME } from './theme';
import { COLORS } from '../render/palette';
import { Feedback, drawButton, drawHeader, hitButton, type Button } from './components';
import { ROLE } from './tokens';
import { jobDef, retreatRuleDef } from '../data/jobs';
import { stageDef } from '../data/stages';
import { sfx } from '../render/audio';
import { elementLabel, itemIconName, itemName, RARITY_COLOR } from './itemview';
import { dominantElement } from '../sim/items';
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
/** グラフ下の目盛りに使う高さ */
const LABEL_H = 20;

export class ReportScreen implements GameScreen {
  private result: RunResult | null;
  private effects = new Effects();
  private t = 0;
  private nextBtn: Button = { x: 12, y: VH - 46, w: VW - 24, h: 38, label: '', accent: true };
  private died: boolean;
  private fb = new Feedback();
  /** 稼ぎの演出を出したか（1回だけ） */
  private announced = false;

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
    this.fb.update(dt);

    // §8「数値変化をイベントとして扱う」。
    // 帰還して初めてレポートを開いた1回だけ、稼ぎを数字で立てる。
    // 毎フレーム動かすものではないので、一度出したら二度と出さない。
    if (!this.announced && this.t > 0.35) {
      this.announced = true;
      const r = this.result;
      if (r && r.outcome !== 'death') {
        if (r.gold > 0) this.fb.float(VW - 96, 44, r.gold, 'G');
        if (r.loot.length > 0) this.fb.notify(`未鑑定品 ${r.loot.length}個`, ROLE.gold);
      } else if (r) {
        this.fb.notify('装備2点を失った', ROLE.negative);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.result;
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    if (!r) {
      drawTextCentered(ctx, 'レポートがない', VW / 2, 200, 12, THEME.dim);
      this.nextBtn.label = '拠点へ';
      drawButton(ctx, this.nextBtn, 12);
      return;
    }

    const d = this.nav.state.dispatchInfo(this.dispatchId);
    const stage = stageDef(d?.stageId ?? 1);

    drawHeader(ctx, VW, {
      title: '帰還レポート',
      gold: this.nav.state.data.gold,
      meta: stage.name
    });

    let y = 30;
    y = this.drawOutcome(ctx, r, y);
    y = this.drawHighlights(ctx, r, y);

    // 残りの縦を深度グラフと戦利品で分け合う。ここで初めて高さが決まる
    const bodyTop = y + 14;
    // グラフの下には到達数の目盛りを出すので、その分を先に差し引く。
    // 差し引かないと「5 / 13」がパネルの縁に食い込んで読めない
    const bodyH = Math.max(120, VH - FOOTER_H - bodyTop - LABEL_H);
    this.drawDepthGraph(ctx, r, PAD + 4, bodyTop, GRAPH_W, bodyH);
    const lx = PAD + 4 + GRAPH_W + 12;
    const used = this.drawSpoils(ctx, r, lx, bodyTop, VW - lx - PAD, bodyH + LABEL_H);
    // 戦利品／損失の下に余った縦を「次にどうするか」で埋める。
    // §7.3 が求めるのは「なぜこうなったか」だが、分かっただけで手が打てないと
    // 結局は運ゲーに感じられる。答え合わせは次の一手まで含めて完結する
    const adviceH = this.drawAdvice(ctx, r, stage, lx, bodyTop + used + 18,
      VW - lx - PAD, bodyH + LABEL_H - used - 18);
    // まだ縦が余っていたら、その回の実数を出す。
    // 見どころは言葉での答え合わせなので、数字でも裏を取れるようにしておく
    const statTop = bodyTop + used + 18 + adviceH + (adviceH > 0 ? 18 : 0);
    this.drawStats(ctx, r, lx, statTop, VW - lx - PAD, bodyTop + bodyH + LABEL_H - statTop);

    // 添え情報
    const job = d ? jobDef(d.jobId).name : '';
    const rule = d ? retreatRuleDef(d.retreatRule).name : '';
    drawText(ctx, `${job}／${rule}／到達 ${r.depth}/${r.encountersTotal}`,
      12, VH - FOOTER_H + 8, 8, THEME.dim);

    this.nextBtn.label = r.outcome === 'death' ? '拠点へ戻る'
      : r.loot.length > 0 ? `未鑑定品 ${r.loot.length}個を開封する` : '拠点へ戻る';
    drawButton(ctx, this.nextBtn, 12);

    this.effects.applyDesaturate(ctx, 0, 26, VW, VH - 26);
    this.effects.drawParticles(ctx);
    // §6 の深さ: 通知と飛ぶ数字は必ず最前面
    this.fb.draw(ctx, VW, VH);
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
    ctx: CanvasRenderingContext2D, r: RunResult,
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

    // 掘り抜いた縦穴は右端に寄せる。中央に置くと HP の折れ線に
    // 39px（1px≒HP2.5%）しか残らず、地層のざらつきに紛れて読めなかった
    const shaftX = x + w - 20;
    fillRect(ctx, shaftX, y, 14, reachedY, THEME.outline);
    for (let ly = 0; ly < reachedY; ly += 16) drawSprOr(ctx, 'ladder', 'icon_T1', shaftX - 1, y + ly);

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

    // HP 推移。縦穴の左脇に、右へ行くほど HP が減る向きで引く。
    // 線だけだと地層に紛れてただの引っかき傷に見えるので、
    // 左端に「満タンの位置」の基準線を1本立てて、線が右へ寄るほど
    // 削られていると読めるようにする
    const curve = r.hpCurve;
    const trackX = x + 3;
    const trackW = Math.max(4, shaftX - trackX - 3);
    // 満タンの基準線（左端）と、撤退ラインの目盛り
    fillRect(ctx, trackX, y, 1, Math.max(1, reachedY), THEME.faint);
    fillRect(ctx, trackX + trackW, y, 1, Math.max(1, reachedY), THEME.faint);
    // 到達点より下（＝踏み込んでいない領域）には引かない。
    // hpCurve は初期値1.0＋各遭遇＋終端で depth より要素が多いため、
    // そのまま回すと倒れた冒険者の下へさらに1遭遇分だけ線が伸びて、
    // 「死んだ後もHPが減り続けている」絵になっていた。
    const lastPoint = Math.min(curve.length, r.depth + 1);
    for (let i = 1; i < lastPoint; i++) {
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
    drawTextCentered(ctx, r.bossDefeated ? '踏破' : `${r.depth} / ${total}`,
      x + w / 2, y + h + 5, 8,
      r.bossDefeated ? THEME.green : r.outcome === 'death' ? THEME.red : THEME.text);
    // 折れ線の意味は「左が満タン・右が0」。凡例は軸のある側に置く
    drawText(ctx, '満', x, y - 13, 8, THEME.faint);
    drawText(ctx, '0', x + Math.max(4, shaftX - x - 3) - 6, y - 13, 8, THEME.faint);
  }

  /**
   * 次にどこを変えるか。実際のこの回の内容から引く。
   * 一般論（「装備を強化しよう」）は書かない——それは何も言っていないのと同じ。
   */
  private advice(r: RunResult, stage: StageDef): string[] {
    const st = this.nav.state;
    const d = st.dispatchInfo(this.dispatchId);
    const lost = st.data.lost[this.dispatchId] ?? [];
    const weapon = st.itemById(d?.weaponId ?? null) ?? lost.find(i => i.slot === 'weapon') ?? null;
    const armor = st.itemById(d?.armorId ?? null) ?? lost.find(i => i.slot === 'armor') ?? null;
    const out: string[] = [];

    if (weapon) {
      const dom = dominantElement(weapon.element);
      if (stage.resists.includes(dom)) {
        out.push(stage.weakTo
          ? `${elementLabel(dom)}は${stage.name}の耐性属性で火力が半減する。${elementLabel(stage.weakTo)}の武器なら1.5倍になる`
          : `${elementLabel(dom)}は${stage.name}の耐性属性。別の属性の武器に持ち替えたい`);
      } else if (stage.weakTo && dom !== stage.weakTo) {
        out.push(`${stage.name}の弱点は${elementLabel(stage.weakTo)}。${elementLabel(stage.weakTo)}寄りの武器なら火力が1.5倍になる`);
      }
    }
    const enemyElem = stage.enemyElement === 'mixed' ? null : stage.enemyElement;
    if (enemyElem && armor && !armor.affixes.some(a => a.kind === 'resistPct' && a.element === enemyElem)) {
      out.push(`敵は${elementLabel(enemyElem)}で攻めてくる。${elementLabel(enemyElem)}耐性の付いた防具を探すと生存が伸びる`);
    }
    if (r.outcome === 'death' && d?.retreatRule === 'reckless') {
      out.push('深追いはHP0まで戦う。標準か慎重にしておけば、装備を失わずに戦利品を持ち帰れた');
    }
    if (r.depth / Math.max(1, r.encountersTotal) < 0.35) {
      out.push('装備がこの階層に届いていない。一段浅いステージを回して稼ぐのが近道');
    }
    return out.slice(0, 3);
  }

  private drawAdvice(
    ctx: CanvasRenderingContext2D, r: RunResult, stage: StageDef,
    x: number, y: number, w: number, h: number
  ): number {
    if (h < 46) return 0;
    const lines = this.advice(r, stage);
    if (lines.length === 0) return 0;
    const wrapped = lines.map(l => wrapText(l, w - 26, 8, 3));
    let need = 14;
    const shown: string[][] = [];
    for (const ls of wrapped) {
      if (need + ls.length * 13 + 4 > h) break;
      shown.push(ls);
      need += ls.length * 13 + 4;
    }
    if (shown.length === 0) return 0;
    drawText(ctx, '次の一手', x, y - 13, 8, THEME.dim);
    drawNineSlice(ctx, 'frame', x, y, w, need);
    let ly = y + 7;
    for (const ls of shown) {
      fillRect(ctx, x + 8, ly + 4, 4, 4, THEME.green);
      ls.forEach((ln, k) => drawText(ctx, ln, x + 18, ly + k * 13, 8, THEME.dim));
      ly += ls.length * 13 + 4;
    }
    return need;
  }

  /** その回の実数。余白が無ければ何も描かない。 */
  private drawStats(
    ctx: CanvasRenderingContext2D, r: RunResult,
    x: number, y: number, w: number, h: number
  ): void {
    const st = r.stats;
    const rows: [string, string][] = [
      ['与えた', `${st.dealt}`],
      ['受けた', `${st.taken}`],
      ['撃破', `${st.kills}体`],
      ['会心', `${st.crits}/${st.hits}`],
      ['最大の一撃', `${st.biggestHit}`]
    ];
    if (st.evaded > 0) rows.push(['回避', `${st.evaded}回`]);
    const need = 14 + rows.length * 13;
    if (h < need + 14) return;
    drawText(ctx, 'この回の数字', x, y - 13, 8, THEME.dim);
    drawNineSlice(ctx, 'frame', x, y, w, need);
    rows.forEach(([k, v], i) => {
      drawText(ctx, k, x + 8, y + 7 + i * 13, 8, THEME.dim);
      drawTextRight(ctx, v, x + w - 8, y + 7 + i * 13, 8, THEME.text);
    });
  }

  /** 戦利品、または失ったもの。使用した高さを返す。 */
  private drawSpoils(
    ctx: CanvasRenderingContext2D, r: RunResult,
    x: number, y: number, w: number, h: number
  ): number {
    if (r.outcome === 'death') {
      drawText(ctx, '失ったもの', x, y - 13, 8, THEME.red);
      // 枠は中身の分だけにする。深度2で死ぬと戦利品も金もゼロなので、
      // 高さを固定すると下半分が丸ごと空いて「情報が抜けた画面」に見える
      const lost = this.nav.state.data.lost[this.dispatchId] ?? [];
      const extra = (r.loot.length > 0 ? 1 : 0) + (r.gold > 0 ? 1 : 0);
      const bodyLines = wrapText('冒険者本人は無事に帰還した。最低限の装備は支給される。', w - 20, 8, 4);
      const need = 16 + Math.max(1, Math.min(2, lost.length)) * 32
        + (extra > 0 ? 15 + extra * 16 : 0) + 10 + bodyLines.length * 13;
      drawNineSlice(ctx, 'frame', x, y, w, Math.min(h, need));
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
        ly += 32;
      }
      // 拾う前に死んだ回は戦利品も金もゼロ。「0個も失われた」は日本語として
      // おかしいうえ、失っていないものを損失として並べることになるので出さない
      if (extra > 0) {
        ly += 3;
        fillRect(ctx, x + 8, ly, w - 16, 1, THEME.panelLight);
        ly += 8;
        if (r.loot.length > 0) {
          drawText(ctx, `未鑑定品 ${r.loot.length}個も失われた`, x + 8, ly, 8, THEME.red);
          ly += 16;
        }
        if (r.gold > 0) {
          drawText(ctx, `持ち帰るはずだった ${r.gold}G`, x + 8, ly, 8, THEME.red);
          ly += 16;
        }
      }
      ly += 10;
      // 救い：本人は帰る。ここが無いと「詰んだ」と受け取られる
      bodyLines.forEach((ln, i) => drawText(ctx, ln, x + 8, ly + i * 13, 8, THEME.dim));
      return Math.min(h, need);
    }

    drawText(ctx, '戦利品', x, y - 13, 8, THEME.dim);
    // 未鑑定のまま見せる（中身は開封まで分からない）
    const cols = 4;
    const cell = 36;
    const gridRows = Math.max(1, Math.ceil(Math.min(10, r.loot.length) / cols));
    const need = Math.min(h, 10 + gridRows * cell + 8 + 32);
    drawNineSlice(ctx, 'frame', x, y, w, need);
    r.loot.slice(0, 10).forEach((_it, i) => {
      const cx = x + 10 + (i % cols) * cell;
      const cy = y + 10 + Math.floor(i / cols) * cell;
      fillRect(ctx, cx, cy, 30, 30, THEME.outline);
      strokeRect1(ctx, cx, cy, 30, 30, THEME.panelLight);
      // 蝋で封じた包み。中身は開封まで伏せる
      fillRect(ctx, cx + 12, cy + 12, 6, 6, THEME.redDark);
      drawTextCentered(ctx, '?', cx + 15, cy + 8, 12, THEME.dim);
    });
    let ly = y + 10 + gridRows * cell + 8;
    drawText(ctx, `未鑑定品 ${r.loot.length}個`, x + 10, ly, 8, THEME.gold);
    ly += 16;
    drawText(ctx, `${r.gold}G を持ち帰った`, x + 10, ly, 8, THEME.gold);
    return need;
  }

  pointerDown(px: number, py: number): void {
    if (!hitButton(this.nextBtn, px, py)) return;
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
