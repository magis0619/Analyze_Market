import type { GameScreen, Nav } from '../game/app';
import type { Item, JobId, Slot } from '../sim/types';
import { VW, VH } from '../render/screen';
import { drawText, drawTextCentered, drawTextRight, textWidth } from '../render/font';
import { drawSpr, fillRect, strokeRect1 } from '../render/draw';
import { sellValue } from '../sim/items';
import { Prng } from '../sim/prng';
import { jobDef } from '../data/jobs';
import { sfx } from '../render/audio';
import { THEME } from './theme';
import { type Btn, drawBtn, hitBtn, inRect } from './widgets';
import {
  RARITY_LABEL, drawItemDetail, drawItemRow, itemName, sortItems,
  type SortKey
} from './itemview';

// インベントリ（§4.1／§10 担当5。ベンチマーク: Path of Exile）。
//
// 設計の芯:
//  - 200個あっても「欲しい物を見つける」「ゴミをまとめて捨てる」が数タップで終わること。
//  - 装備中の品は絶対に事故で売れないこと（緑の縦線＋「装備中」バッジ＋売却対象から除外）。
//
// C10（200個で1秒以上かかったら不合格）への対応:
//  - 並べ替え・絞り込みの結果は view にキャッシュし、状態が変わった時だけ作り直す。
//  - draw() は配列生成・ソート・文字列組み立てを一切しない。表示文字列は
//    rebuild()／refreshSelection() の中で作り、フレーム間で使い回す。
//  - 描画は可視行だけ（仮想スクロール）。所持数が増えても描画コストは一定。

type SlotFilter = 'all' | 'weapon' | 'armor';
/** 'commonOnly' = 並のみ（ゴミ掃除用）／'fineUp' = 上質以上のみ */
type RarityFilter = 'all' | 'commonOnly' | 'fineUp';

const JOB_ORDER: readonly JobId[] = ['swordsman', 'guardian', 'skirmisher'];
const SORT_KEYS: readonly SortKey[] = ['power', 'rarity', 'slot', 'recent'];
const SORT_LABELS: readonly string[] = ['威力', 'レア', '種別', '新着'];
const SLOT_FILTERS: readonly SlotFilter[] = ['all', 'weapon', 'armor'];
const SLOT_LABELS: readonly string[] = ['全部', '武器', '防具'];
const RARITY_FILTERS: readonly RarityFilter[] = ['all', 'commonOnly', 'fineUp'];
const RARITY_FILTER_LABELS: readonly string[] = ['全レア', '並のみ', '上質以上'];

const HEADER_H = 24;
const ROW_H = 34;
const STRIDE = 36;
const LIST_X = 7;
const LIST_W = 338;
const LIST_Y = 70;
const LIST_BOTTOM = 598;
const LIST_H = LIST_BOTTOM - LIST_Y;
const BAR_X = 348;
const BAR_W = 5;
/** 詳細シートが最も高くなったときの上端の目安（実際は中身から計算する） */
const SHEET_Y = 240;
const DRAG_SLOP = 6;

function fmtGold(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i] ?? '';
  }
  return out;
}

/**
 * 比較に使う代表値。武器は威力だけではベースタイプ間で比べられないため、
 * itemview の詳細パネルと同じ「秒間火力＝威力×速度」を使う（画面間で指標を変えない）。
 */
function scoreOf(item: Item): number {
  return item.slot === 'weapon' ? Math.round(item.power * item.speed) : item.power;
}

/** drawItemDetail が使う高さと同じ式（レイアウト計算のために先読みする）。 */
function detailHeight(item: Item): number {
  return 62 + (item.affixes.length + (item.unique ? 2 : 0)) * 12;
}

function signed(n: number, digits = 0): string {
  const v = digits > 0 ? n.toFixed(digits) : String(Math.round(n));
  return n > 0 ? `+${v}` : v;
}

export class InventoryScreen implements GameScreen {
  private readonly nav: Nav;

  // ------------------------------------------------------------ 表示状態
  private sort: SortKey = 'recent';
  private slotF: SlotFilter = 'all';
  private rarF: RarityFilter = 'all';

  /** 絞り込み＋並べ替え済みのキャッシュ。dirty のときだけ作り直す */
  private view: Item[] = [];
  private dirty = true;
  private lastInvLen = -1;

  private scroll = 0;
  private maxScroll = 0;
  private vel = 0;

  private selectedId: string | null = null;
  private compareJob: JobId = 'swordsman';
  /** 詳細シートの上端。中身の高さに合わせて下寄せする（一覧の文脈を残す） */
  private sheetTop = SHEET_Y;

  // ------------------------------------------------------------ 派生キャッシュ
  private equippedBy = new Map<string, string>();
  private equippedIds = new Set<string>();
  /** 装備中の最高値（武器＝秒間火力／防具＝防御）。乗り換え候補の目印に使う */
  private bestEqScore: Record<Slot, number> = { weapon: 0, armor: 0 };
  private bulkIds: string[] = [];
  private bulkGold = 0;
  private bulkRare = 0;
  private bulkRelic = 0;
  private headerCount = '';
  private viewCount = '';
  private goldShown = -1;
  private goldStr = '0';
  private emptyHint = '';
  private emptyHint2 = '';

  // 選択中アイテムの比較差分（refreshSelection でのみ作る）
  private diffText: string[] = [];
  private diffColor: string[] = [];
  private compareLabel = '';

  // ------------------------------------------------------------ 入力
  private dragMode: 'none' | 'list' | 'bar' = 'none';
  private downX = 0;
  private downY = 0;
  private downScroll = 0;
  private moved = false;
  private lastMoveY = 0;
  private lastMoveT = 0;

  private confirm: { count: number; gold: number; warn: string; single: boolean } | null = null;
  private toast = '';
  private toastT = 0;

  // ------------------------------------------------------------ ボタン
  private sortBtns: Btn[] = [];
  private slotBtns: Btn[] = [];
  private rarBtns: Btn[] = [];
  private jobBtns: Btn[] = [];
  private backBtn: Btn = { x: 7, y: 604, w: 96, h: 30, label: '拠点へ' };
  private bulkBtn: Btn = { x: 109, y: 604, w: 244, h: 30, label: '' };
  private lockBtn: Btn = { x: 7, y: 604, w: 78, h: 30, label: 'ロック' };
  private reidBtn: Btn = { x: 89, y: 604, w: 112, h: 30, label: '再鑑定' };
  private sellBtn: Btn = { x: 205, y: 604, w: 82, h: 30, label: '売却' };
  private closeBtn: Btn = { x: 291, y: 604, w: 62, h: 30, label: '閉じる' };
  private yesBtn: Btn = { x: 40, y: 346, w: 130, h: 30, label: '売る', accent: true };
  private noBtn: Btn = { x: 190, y: 346, w: 130, h: 30, label: 'やめる' };

  constructor(nav: Nav) {
    this.nav = nav;
    for (let i = 0; i < 4; i++) {
      this.sortBtns.push({ x: 7 + i * 87, y: 26, w: 85, h: 18, label: SORT_LABELS[i] ?? '' });
    }
    for (let i = 0; i < 3; i++) {
      this.slotBtns.push({ x: 7 + i * 55, y: 48, w: 53, h: 18, label: SLOT_LABELS[i] ?? '' });
      this.rarBtns.push({ x: 181 + i * 58, y: 48, w: 56, h: 18, label: RARITY_FILTER_LABELS[i] ?? '' });
    }
    JOB_ORDER.forEach((j, i) => {
      this.jobBtns.push({ x: 213 + i * 47, y: SHEET_Y + 5, w: 45, h: 17, label: jobDef(j).name });
    });
    const avail = this.nav.state.availableJobs();
    this.compareJob = avail[0] ?? 'swordsman';
  }

  // ================================================================ キャッシュ再構築

  /** 表示リストと、それに紐づく文字列・集計を作り直す。1フレームに高々1回。 */
  private rebuild(): void {
    const st = this.nav.state;
    const inv = st.data.inventory;

    // 装備中の把握（事故売却を防ぐ最重要情報）
    this.equippedBy.clear();
    this.equippedIds.clear();
    this.bestEqScore.weapon = 0;
    this.bestEqScore.armor = 0;
    const avail = st.availableJobs();
    for (const j of avail) {
      const eq = st.data.equipped[j];
      const name = jobDef(j).name;
      for (const id of [eq.weapon, eq.armor]) {
        if (!id) continue;
        this.equippedIds.add(id);
        const prev = this.equippedBy.get(id);
        this.equippedBy.set(id, prev ? `${prev}・${name}` : name);
        const it = st.itemById(id);
        if (it && scoreOf(it) > this.bestEqScore[it.slot]) this.bestEqScore[it.slot] = scoreOf(it);
      }
    }

    // 絞り込み（O(n)）→ 並べ替え（O(n log n)）。200個なら 0.1ms 未満。
    const filtered: Item[] = [];
    for (const it of inv) {
      if (this.slotF !== 'all' && it.slot !== this.slotF) continue;
      if (this.rarF === 'commonOnly' && it.rarity !== 'common') continue;
      if (this.rarF === 'fineUp' && it.rarity === 'common') continue;
      filtered.push(it);
    }
    this.view = sortItems(filtered, this.sort);

    // 一括売却の対象（ロック品・装備中は必ず除外）
    this.bulkIds.length = 0;
    this.bulkGold = 0;
    this.bulkRare = 0;
    this.bulkRelic = 0;
    for (const it of this.view) {
      if (it.locked || this.equippedIds.has(it.id)) continue;
      this.bulkIds.push(it.id);
      this.bulkGold += sellValue(it);
      if (it.rarity === 'rare') this.bulkRare++;
      else if (it.rarity === 'relic') this.bulkRelic++;
    }

    const scope = this.rarF === 'commonOnly' ? '並' : this.rarF === 'fineUp' ? '上質以上' : '表示中';
    this.bulkBtn.label = this.bulkIds.length > 0
      ? `${scope}を${this.bulkIds.length}個売る ${fmtGold(this.bulkGold)}G`
      : '売れる装備がない';
    this.bulkBtn.disabled = this.bulkIds.length === 0;
    this.bulkBtn.accent = this.bulkIds.length > 0;

    this.headerCount = `所持 ${inv.length}`;
    this.viewCount = `表示 ${this.view.length}`;
    this.emptyHint = inv.length === 0 ? '装備をまだ持っていない' : '条件に合う装備がない';
    this.emptyHint2 = inv.length === 0 ? '派遣して戦利品を持ち帰ろう' : '絞り込みを「全部／全レア」に戻す';

    this.maxScroll = Math.max(0, this.view.length * STRIDE - LIST_H);
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
    if (this.scroll < 0) this.scroll = 0;

    // 選択中の品が売られて消えていたら選択を解除する
    if (this.selectedId && !st.itemById(this.selectedId)) this.selectedId = null;

    this.lastInvLen = inv.length;
    this.dirty = false;
    this.refreshSelection();
  }

  private selected(): Item | null {
    return this.selectedId ? this.nav.state.itemById(this.selectedId) : null;
  }

  private equippedFor(slot: Slot, job: JobId): Item | null {
    const set = this.nav.state.data.equipped[job];
    return this.nav.state.itemById(slot === 'weapon' ? set.weapon : set.armor);
  }

  /** 詳細パネルの比較文字列とボタン状態を作る（選択・比較先が変わった時だけ）。 */
  private refreshSelection(): void {
    this.diffText.length = 0;
    this.diffColor.length = 0;
    const item = this.selected();
    if (!item) return;

    const st = this.nav.state;
    const avail = st.availableJobs();
    if (!avail.includes(this.compareJob)) this.compareJob = avail[0] ?? 'swordsman';
    // 比較先が空なら、そのスロットを装備している職に自動で寄せる
    if (!this.equippedFor(item.slot, this.compareJob)) {
      const other = avail.find(j => this.equippedFor(item.slot, j));
      if (other) this.compareJob = other;
    }
    const cmp = this.equippedFor(item.slot, this.compareJob);
    this.compareLabel = `${jobDef(this.compareJob).name}の装備中`;

    if (cmp && cmp.id !== item.id) {
      const push = (t: string, d: number): void => {
        this.diffText.push(t);
        this.diffColor.push(d > 0 ? THEME.green : d < 0 ? THEME.red : THEME.dim);
      };
      const ds = scoreOf(item) - scoreOf(cmp);
      push(`${item.slot === 'weapon' ? '秒間火力' : '防御'} ${signed(ds)}`, ds);
      if (item.slot === 'weapon') {
        const dspd = item.speed - cmp.speed;
        push(`速度 ${signed(dspd, 2)}`, dspd);
        const dc = item.crit - cmp.crit;
        push(`会心 ${signed(dc, 1)}%`, dc);
      }
      const da = item.affixes.length - cmp.affixes.length;
      push(`枠 ${signed(da)}`, da);
    }

    // シートの高さを中身から決め、ボタン列の上に下寄せで置く
    const sameAsEquipped = !!cmp && cmp.id === item.id;
    let h = 28 + detailHeight(item) + 4;
    if (this.equippedIds.has(item.id)) h += 14;
    h += (cmp && !sameAsEquipped) ? 16 + 4 + 12 + detailHeight(cmp) : 16;
    h += 8;
    this.sheetTop = Math.max(LIST_Y, LIST_BOTTOM - h);
    for (const b of this.jobBtns) b.y = this.sheetTop + 5;

    const isEq = this.equippedIds.has(item.id);
    this.lockBtn.label = item.locked ? 'ロック解除' : 'ロック';
    this.lockBtn.accent = !!item.locked;
    const cost = st.reidentifyCost(item);
    this.reidBtn.label = item.affixes.length > 0 ? `再鑑定 ${fmtGold(cost)}G` : '再鑑定 不可';
    this.reidBtn.disabled = item.affixes.length === 0 || st.data.gold < cost;
    this.sellBtn.label = isEq ? '装備中' : item.locked ? 'ロック中' : `売却 ${fmtGold(sellValue(item))}G`;
    this.sellBtn.disabled = isEq || !!item.locked;
    JOB_ORDER.forEach((j, i) => {
      const b = this.jobBtns[i];
      if (!b) return;
      b.disabled = !avail.includes(j);
      b.accent = j === this.compareJob;
    });
  }

  // ================================================================ 更新

  update(dt: number): void {
    if (this.dirty || this.nav.state.data.inventory.length !== this.lastInvLen) this.rebuild();

    const gold = this.nav.state.data.gold;
    if (gold !== this.goldShown) {
      this.goldShown = gold;
      this.goldStr = fmtGold(gold);
    }

    if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);

    // 慣性スクロール（指を離した後の惰性）
    if (this.dragMode === 'none' && this.vel !== 0) {
      this.scroll += this.vel * dt;
      this.vel *= Math.exp(-6 * dt);
      if (Math.abs(this.vel) < 12) this.vel = 0;
      if (this.scroll < 0) { this.scroll = 0; this.vel = 0; }
      if (this.scroll > this.maxScroll) { this.scroll = this.maxScroll; this.vel = 0; }
    }
  }

  // ================================================================ 描画

  draw(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, VH, THEME.bg);
    this.drawHeader(ctx);
    this.drawControls(ctx);
    this.drawList(ctx);
    this.drawBottom(ctx);
    if (this.selectedId) this.drawSheet(ctx);
    if (this.confirm) this.drawConfirm(ctx);
    if (this.toastT > 0) {
      const w = textWidth(this.toast, 8) + 16;
      const x = Math.floor((VW - w) / 2);
      fillRect(ctx, x, 566, w, 20, THEME.outline);
      strokeRect1(ctx, x, 566, w, 20, THEME.gold);
      drawTextCentered(ctx, this.toast, Math.floor(VW / 2), 572, 8, THEME.text);
    }
  }

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    fillRect(ctx, 0, 0, VW, HEADER_H, THEME.panel);
    fillRect(ctx, 0, HEADER_H - 1, VW, 1, THEME.outline);
    drawText(ctx, '所持品', 7, 5, 12, THEME.text);
    drawText(ctx, this.headerCount, 56, 8, 8, THEME.dim);
    drawText(ctx, this.viewCount, 112, 8, 8, THEME.dim);
    drawSpr(ctx, 'coin', VW - 8 - textWidth(this.goldStr, 12) - 11, 7);
    drawTextRight(ctx, this.goldStr, VW - 8, 6, 12, THEME.gold);
  }

  private drawControls(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.sortBtns.length; i++) {
      const b = this.sortBtns[i];
      if (!b) continue;
      b.accent = SORT_KEYS[i] === this.sort;
      drawBtn(ctx, b, 8);
    }
    for (let i = 0; i < 3; i++) {
      const sb = this.slotBtns[i];
      if (sb) { sb.accent = SLOT_FILTERS[i] === this.slotF; drawBtn(ctx, sb, 8); }
      const rb = this.rarBtns[i];
      if (rb) { rb.accent = RARITY_FILTERS[i] === this.rarF; drawBtn(ctx, rb, 8); }
    }
    // 2グループの境目（種別｜レアリティ）
    fillRect(ctx, 172, 50, 1, 14, THEME.panelLight);
  }

  private drawList(ctx: CanvasRenderingContext2D): void {
    const view = this.view;
    if (view.length === 0) {
      drawTextCentered(ctx, this.emptyHint, Math.floor(VW / 2), LIST_Y + 60, 8, THEME.dim);
      drawTextCentered(ctx, this.emptyHint2, Math.floor(VW / 2), LIST_Y + 80, 8, THEME.dim);
      return;
    }
    const off = Math.round(this.scroll);
    const first = Math.max(0, Math.floor(off / STRIDE));
    const last = Math.min(view.length - 1, Math.floor((off + LIST_H) / STRIDE));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, LIST_Y, VW, LIST_H);
    ctx.clip();
    for (let i = first; i <= last; i++) {
      const it = view[i];
      if (!it) continue;
      const y = LIST_Y + i * STRIDE - off;
      const eqName = this.equippedBy.get(it.id);
      drawItemRow(ctx, it, LIST_X, y, LIST_W, ROW_H, {
        selected: it.id === this.selectedId,
        showSellValue: eqName === undefined
      });
      this.drawRowOverlay(ctx, it, LIST_X, y, LIST_W, ROW_H, eqName);
    }
    ctx.restore();

    // スクロールバー（200個を一気に飛ばすための掴める帯）
    if (this.maxScroll > 0) {
      fillRect(ctx, BAR_X, LIST_Y, BAR_W, LIST_H, THEME.panel);
      const th = Math.max(24, Math.round((LIST_H * LIST_H) / (view.length * STRIDE)));
      const ty = LIST_Y + Math.round((LIST_H - th) * (this.scroll / this.maxScroll));
      fillRect(ctx, BAR_X, ty, BAR_W, th, THEME.panelLight);
      fillRect(ctx, BAR_X + 1, ty + 1, BAR_W - 2, th - 2, THEME.gold);
    }
  }

  /** 共有部品の上に、装備中・ロック・更新候補の目印を重ねる。 */
  private drawRowOverlay(
    ctx: CanvasRenderingContext2D, item: Item,
    x: number, y: number, w: number, h: number, eqName: string | undefined
  ): void {
    if (eqName !== undefined) {
      fillRect(ctx, x + 1, y + 1, 3, h - 2, THEME.green);
      drawTextRight(ctx, `装備中 ${eqName}`, x + w - (item.locked ? 22 : 6), y + 5, 8, THEME.green);
    } else if (this.bestEqScore[item.slot] > 0 && scoreOf(item) > this.bestEqScore[item.slot]) {
      // 装備中の最高値を超えている＝乗り換え候補。200個から拾い上げるための目印。
      // 錠前バッジと重ならないよう、ロック品では左へ寄せる
      drawTextRight(ctx, `▲${scoreOf(item) - this.bestEqScore[item.slot]}`,
        x + w - (item.locked ? 22 : 6), y + h - 13, 8, THEME.green);
    }
    if (item.locked) {
      // itemview の icon_lock は未実装で防具アイコンに落ちるため、錠前を自前で描く
      const lx = x + w - 20;
      const ly = y + Math.floor((h - 16) / 2);
      fillRect(ctx, lx, ly, 16, 16, THEME.outline);
      fillRect(ctx, lx + 5, ly + 3, 6, 1, THEME.gold);
      fillRect(ctx, lx + 4, ly + 4, 1, 3, THEME.gold);
      fillRect(ctx, lx + 11, ly + 4, 1, 3, THEME.gold);
      fillRect(ctx, lx + 3, ly + 7, 10, 7, THEME.gold);
      fillRect(ctx, lx + 7, ly + 9, 2, 3, THEME.outline);
    }
  }

  private drawBottom(ctx: CanvasRenderingContext2D): void {
    if (this.selectedId) return; // 詳細パネル側のボタンに差し替わる
    fillRect(ctx, 0, LIST_BOTTOM, VW, VH - LIST_BOTTOM, THEME.panel);
    fillRect(ctx, 0, LIST_BOTTOM, VW, 1, THEME.outline);
    drawBtn(ctx, this.backBtn, 8);
    drawBtn(ctx, this.bulkBtn, 8);
  }

  private drawSheet(ctx: CanvasRenderingContext2D): void {
    const item = this.selected();
    if (!item) return;
    const top = this.sheetTop;
    ctx.fillStyle = 'rgba(15,11,20,0.66)';
    ctx.fillRect(0, 0, VW, top);
    fillRect(ctx, 0, top, VW, VH - top, THEME.panel);
    fillRect(ctx, 0, top, VW, 1, THEME.gold);

    drawText(ctx, '比較する冒険者', 7, top + 9, 8, THEME.dim);
    for (const b of this.jobBtns) drawBtn(ctx, b, 8);

    let y = top + 28;
    const h1 = drawItemDetail(ctx, item, 6, y, 348);
    y += h1 + 4;

    const eqName = this.equippedBy.get(item.id);
    if (eqName !== undefined) {
      drawText(ctx, `${eqName} が装備中（売却できない）`, 8, y, 8, THEME.green);
      y += 14;
    }

    const cmp = this.equippedFor(item.slot, this.compareJob);
    if (!cmp) {
      drawText(ctx, `${jobDef(this.compareJob).name}はこの部位が空（そのまま装備できる）`,
        8, y + 4, 8, THEME.dim);
    } else if (cmp.id === item.id) {
      drawText(ctx, `これが ${jobDef(this.compareJob).name} の装備中の品`, 8, y + 4, 8, THEME.green);
    } else {
      // 差分（選択品 − 装備中）を1行にまとめ、その下に装備中の品を並べる
      fillRect(ctx, 6, y, 348, 16, THEME.panelLight);
      let dx = 10;
      for (let i = 0; i < this.diffText.length; i++) {
        const t = this.diffText[i] ?? '';
        drawText(ctx, t, dx, y + 4, 8, this.diffColor[i] ?? THEME.dim);
        dx += textWidth(t, 8) + 10;
      }
      y += 20;
      drawText(ctx, this.compareLabel, 8, y, 8, THEME.dim);
      y += 12;
      drawItemDetail(ctx, cmp, 6, y, 348);
    }

    fillRect(ctx, 0, LIST_BOTTOM, VW, VH - LIST_BOTTOM, THEME.panel);
    fillRect(ctx, 0, LIST_BOTTOM, VW, 1, THEME.outline);
    drawBtn(ctx, this.lockBtn, 8);
    drawBtn(ctx, this.reidBtn, 8);
    drawBtn(ctx, this.sellBtn, 8);
    drawBtn(ctx, this.closeBtn, 8);
  }

  private drawConfirm(ctx: CanvasRenderingContext2D): void {
    const c = this.confirm;
    if (!c) return;
    ctx.fillStyle = 'rgba(15,11,20,0.72)';
    ctx.fillRect(0, 0, VW, VH);
    const x = 30, y = 246, w = 300, h = 140;
    fillRect(ctx, x, y, w, h, THEME.panel);
    strokeRect1(ctx, x, y, w, h, THEME.gold);
    drawTextCentered(ctx, '売却の確認', VW / 2, y + 10, 12, THEME.text);
    drawTextCentered(ctx, `${c.count}個を売却して ${fmtGold(c.gold)}G`, VW / 2, y + 34, 12, THEME.gold);
    drawTextCentered(ctx, 'ロック品と装備中の品は除外済み', VW / 2, y + 54, 8, THEME.dim);
    if (c.warn) drawTextCentered(ctx, c.warn, VW / 2, y + 70, 8, THEME.red);
    drawBtn(ctx, this.yesBtn, 12);
    drawBtn(ctx, this.noBtn, 12);
  }

  // ================================================================ 入力

  pointerDown(x: number, y: number): void {
    this.vel = 0;
    if (this.confirm) {
      if (hitBtn(this.yesBtn, x, y)) this.doSell();
      else if (hitBtn(this.noBtn, x, y)) { this.confirm = null; sfx('tap'); }
      return;
    }
    if (this.selectedId) {
      this.sheetDown(x, y);
      return;
    }
    // 並べ替え・絞り込み
    for (let i = 0; i < this.sortBtns.length; i++) {
      const b = this.sortBtns[i];
      const k = SORT_KEYS[i];
      if (b && k && hitBtn(b, x, y)) { this.setSort(k); return; }
    }
    for (let i = 0; i < 3; i++) {
      const sb = this.slotBtns[i];
      const sf = SLOT_FILTERS[i];
      if (sb && sf && hitBtn(sb, x, y)) { this.setSlotFilter(sf); return; }
      const rb = this.rarBtns[i];
      const rf = RARITY_FILTERS[i];
      if (rb && rf && hitBtn(rb, x, y)) { this.setRarityFilter(rf); return; }
    }
    if (hitBtn(this.backBtn, x, y)) { sfx('tap'); this.nav.goBase(); return; }
    if (inRect(x, y, this.bulkBtn.x, this.bulkBtn.y, this.bulkBtn.w, this.bulkBtn.h)) {
      this.askBulkSell();
      return;
    }

    if (inRect(x, y, BAR_X - 6, LIST_Y, BAR_W + 12, LIST_H) && this.maxScroll > 0) {
      this.dragMode = 'bar';
      this.scrollToBar(y);
      return;
    }
    if (inRect(x, y, 0, LIST_Y, VW, LIST_H)) {
      this.dragMode = 'list';
      this.downX = x;
      this.downY = y;
      this.downScroll = this.scroll;
      this.moved = false;
      this.lastMoveY = y;
      this.lastMoveT = this.nav.now();
    }
  }

  pointerMove(x: number, y: number): void {
    if (this.dragMode === 'bar') { this.scrollToBar(y); return; }
    if (this.dragMode !== 'list') return;
    const dy = y - this.downY;
    if (!this.moved && (Math.abs(dy) > DRAG_SLOP || Math.abs(x - this.downX) > DRAG_SLOP)) {
      this.moved = true;
    }
    if (this.moved) {
      this.scroll = Math.max(0, Math.min(this.maxScroll, this.downScroll - dy));
      const now = this.nav.now();
      const dt = Math.max(1, now - this.lastMoveT);
      this.vel = ((this.lastMoveY - y) * 1000) / dt;
      this.lastMoveY = y;
      this.lastMoveT = now;
    }
  }

  pointerUp(_x: number, y: number): void {
    if (this.dragMode === 'list' && !this.moved) {
      const idx = Math.floor((y - LIST_Y + Math.round(this.scroll)) / STRIDE);
      const it = this.view[idx];
      if (it && y >= LIST_Y && y < LIST_BOTTOM) {
        this.selectedId = it.id;
        this.refreshSelection();
        sfx('tap');
      }
      this.vel = 0;
    }
    if (this.dragMode === 'list' && this.moved && this.nav.now() - this.lastMoveT > 120) {
      this.vel = 0; // 指を止めてから離したら滑らせない
    }
    this.dragMode = 'none';
  }

  private scrollToBar(y: number): void {
    const t = (y - LIST_Y) / LIST_H;
    this.scroll = Math.max(0, Math.min(this.maxScroll, t * this.maxScroll));
    this.vel = 0;
  }

  private sheetDown(x: number, y: number): void {
    const item = this.selected();
    if (!item) { this.selectedId = null; return; }
    if (y < this.sheetTop) { this.selectedId = null; sfx('tap'); return; }
    for (let i = 0; i < this.jobBtns.length; i++) {
      const b = this.jobBtns[i];
      const j = JOB_ORDER[i];
      if (b && j && hitBtn(b, x, y)) {
        this.compareJob = j;
        this.refreshSelection();
        sfx('tap');
        return;
      }
    }
    if (hitBtn(this.closeBtn, x, y)) { this.selectedId = null; sfx('tap'); return; }
    if (hitBtn(this.lockBtn, x, y)) {
      item.locked = !item.locked;
      this.nav.state.save();
      this.dirty = true;
      this.showToast(item.locked ? `${itemName(item)} をロックした` : 'ロックを外した');
      sfx('tap');
      return;
    }
    if (inRect(x, y, this.reidBtn.x, this.reidBtn.y, this.reidBtn.w, this.reidBtn.h)) {
      const cost = this.nav.state.reidentifyCost(item);
      if (item.affixes.length === 0) {
        sfx('deny');
        this.showToast('振り直せるアフィックスがない');
        return;
      }
      if (this.nav.state.data.gold < cost) {
        sfx('deny');
        this.showToast(`金が足りない（あと ${fmtGold(cost - this.nav.state.data.gold)}G）`);
        return;
      }
      const seed = (this.nav.state.data.seed ^ Math.floor(this.nav.now())) >>> 0;
      if (this.nav.state.reidentify(item.id, new Prng(seed))) {
        this.showToast(`アフィックスを振り直した -${fmtGold(cost)}G`);
        this.dirty = true;
        sfx('rare');
      } else {
        sfx('deny');
      }
      return;
    }
    if (inRect(x, y, this.sellBtn.x, this.sellBtn.y, this.sellBtn.w, this.sellBtn.h)) {
      if (this.equippedIds.has(item.id)) {
        sfx('deny');
        this.showToast('装備中の品は売れない');
        return;
      }
      if (item.locked) {
        sfx('deny');
        this.showToast('ロック中の品は売れない（先に解除する）');
        return;
      }
      this.confirm = {
        count: 1, gold: sellValue(item), single: true,
        warn: item.rarity === 'rare' || item.rarity === 'relic'
          ? `${RARITY_LABEL[item.rarity]}を手放そうとしている` : ''
      };
      sfx('tap');
    }
  }

  // ================================================================ 操作

  private setSort(k: SortKey): void {
    if (this.sort === k) return;
    this.sort = k;
    this.scroll = 0;
    this.vel = 0;
    this.dirty = true;
    sfx('tap');
  }

  private setSlotFilter(f: SlotFilter): void {
    if (this.slotF === f) return;
    this.slotF = f;
    this.scroll = 0;
    this.vel = 0;
    this.dirty = true;
    sfx('tap');
  }

  private setRarityFilter(f: RarityFilter): void {
    if (this.rarF === f) return;
    this.rarF = f;
    this.scroll = 0;
    this.vel = 0;
    this.dirty = true;
    sfx('tap');
  }

  private askBulkSell(): void {
    if (this.bulkIds.length === 0) {
      sfx('deny');
      this.showToast('表示中はロック品と装備中だけ');
      return;
    }
    let warn = '';
    if (this.bulkRelic > 0 || this.bulkRare > 0) {
      const parts: string[] = [];
      if (this.bulkRare > 0) parts.push(`稀少 ${this.bulkRare}`);
      if (this.bulkRelic > 0) parts.push(`遺物 ${this.bulkRelic}`);
      warn = `${parts.join('・')} が含まれている`;
    }
    this.confirm = { count: this.bulkIds.length, gold: this.bulkGold, warn, single: false };
    sfx('tap');
  }

  private doSell(): void {
    const c = this.confirm;
    if (!c) return;
    const ids = c.single
      ? (this.selectedId ? [this.selectedId] : [])
      : this.bulkIds;
    const gained = this.nav.state.sell(ids, sellValue);
    this.confirm = null;
    if (c.single) this.selectedId = null;
    this.dirty = true;
    this.showToast(`${c.count}個を売却して +${fmtGold(gained)}G`);
    sfx('loot');
  }

  private showToast(text: string): void {
    this.toast = text;
    this.toastT = 1.8;
  }
}
