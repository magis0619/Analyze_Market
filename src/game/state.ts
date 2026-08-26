import type { HerbDef } from '../data/garden';
import type {
  Dispatch, Item, JobId, RetreatRule, RunResult
} from '../sim/types';
import { Prng } from '../sim/prng';
import { simulateRun } from '../sim/combat';
import { generateItem, starterItem } from '../sim/items';
import { advanceClock, dispatchProgress, OFFLINE_CAP_SEC, type ClockState } from '../sim/offline';
import { jobDef, retreatRuleDef, SLOT_COST, UNLOCK_STAGE_FOR_SLOT } from '../data/jobs';
import { stageDef, STAGES, itemPowerFor } from '../data/stages';
import {
  HERBS, PLOTS_INITIAL, PLOTS_MAX, herbDef, herbForElement, plotCost, potionDef
} from '../data/garden';
import { AFFIXES } from '../data/affixes';
import { notifyReturn, requestNotifyPermission } from './notify';

// 拠点の状態とセーブ。サーバなし、ローカル永続化のみ（§3）。

const SAVE_KEY = 'delvers.save.v1';
const SAVE_VERSION = 3;

export interface CompendiumEntry {
  /** 初めて入手したステージ（§7.4） */
  firstStage: number;
  count: number;
}

export interface EquipSet {
  weapon: string | null;
  armor: string | null;
}

export interface SaveData {
  version: number;
  seed: number;
  gold: number;
  /** 難易度ティア。ステージ10クリアで+1（§7.1） */
  tier: number;
  clearedStages: number[];
  unlockedStages: number[];
  /** 金を払って解放済みの派遣枠数（§7.5）。初期は1 */
  unlockedSlots: number;
  inventory: Item[];
  /** 帰還済み・未開封の戦利品 */
  pending: Item[];
  equipped: Record<JobId, EquipSet>;
  dispatches: Dispatch[];
  /** dispatchId -> 派遣時に確定した結果 */
  results: Record<string, RunResult>;
  /** dispatchId -> 派遣の内容。完了後もレポート表示のために残す */
  history: Record<string, Dispatch>;
  /** 帰還済みで未確認のレポート */
  inbox: string[];
  /** dispatchId -> 戦死で失った装備2点。レポートで「何を失ったか」を見せるため残す */
  lost: Record<string, Item[]>;
  /** 図鑑。キーは `${baseId}|${rarity}` と `unique:${kind}` */
  compendium: Record<string, CompendiumEntry>;
  /** 薬草園（新機能）。畑・種・収穫物・薬 */
  garden: GardenData;
  lastSeen: number;
  nextId: number;
}

/** 畑1枠。null なら空き */
export interface Plot {
  herbId: string;
  /** 植えた時刻（ミリ秒） */
  plantedAt: number;
}

export interface GardenData {
  /** 金を払って開けた畑の数 */
  plots: number;
  /** 各枠の中身。長さは plots に合わせる */
  beds: (Plot | null)[];
  /** herbId -> 手持ちの種の数 */
  seeds: Record<string, number>;
  /** herbId -> 手持ちの収穫物の数 */
  herbs: Record<string, number>;
  /** potionId -> 手持ちの薬の数 */
  potions: Record<string, number>;
}

function defaultGarden(): GardenData {
  return {
    plots: PLOTS_INITIAL,
    beds: Array.from({ length: PLOTS_INITIAL }, () => null),
    // 最初の種は配る。畑があるのに植えるものが無いと、
    // 開幕で「何もできない画面」を見せることになる
    seeds: { ironleaf: 2, embermoss: 1 },
    herbs: {},
    potions: {}
  };
}

function defaultSave(seed: number, now: number): SaveData {
  const s: SaveData = {
    version: SAVE_VERSION,
    garden: defaultGarden(),
    seed,
    gold: 0,
    tier: 1,
    clearedStages: [],
    unlockedStages: [1],
    unlockedSlots: 1,
    inventory: [],
    pending: [],
    equipped: {
      swordsman: { weapon: null, armor: null },
      guardian: { weapon: null, armor: null },
      skirmisher: { weapon: null, armor: null }
    },
    dispatches: [],
    results: {},
    history: {},
    inbox: [],
    lost: {},
    compendium: {},
    lastSeen: now,
    nextId: 1
  };
  // 初期装備（§4.4 の最低性能を1組だけ渡して始める）
  const w = starterItem('weapon', 'start-w');
  const a = starterItem('armor', 'start-a');
  s.inventory.push(w, a);
  s.equipped.swordsman = { weapon: w.id, armor: a.id };
  return s;
}

export class GameState {
  data: SaveData;

  constructor(seed: number, now: number) {
    this.data = loadSave() ?? defaultSave(seed, now);
    this.data.lastSeen = Math.max(this.data.lastSeen, 0);
    this.tick(now);
  }

  // -------------------------------------------------------------- 時刻

  private clock(): ClockState {
    return { lastSeen: this.data.lastSeen };
  }

  /** 時刻を進め、完了した派遣を回収する。巻き戻しは進行ゼロ（§7.2・C5）。 */
  tick(now: number): void {
    const next = advanceClock(this.clock(), now);
    this.data.lastSeen = next.lastSeen;

    const stillRunning: Dispatch[] = [];
    for (const d of this.data.dispatches) {
      const p = dispatchProgress(d, next);
      if (p.completed) this.collect(d);
      else stillRunning.push(d);
    }
    if (stillRunning.length !== this.data.dispatches.length) {
      this.data.dispatches = stillRunning;
      this.save();
    }
  }

  /** 派遣の進捗（0〜1）と残り秒。 */
  progressOf(d: Dispatch): { ratio: number; remainingSec: number } {
    const p = dispatchProgress(d, this.clock());
    return { ratio: p.ratio, remainingSec: p.remainingSec };
  }

  // -------------------------------------------------------------- 派遣

  /** その職が今すぐ派遣できるか。 */
  isBusy(jobId: JobId): boolean {
    return this.data.dispatches.some(d => d.jobId === jobId);
  }

  /** 解放済みの派遣枠数。金を払った分だけ増える（§7.5）。 */
  slotCount(): number {
    return Math.max(1, Math.min(UNLOCK_STAGE_FOR_SLOT.length, this.data.unlockedSlots));
  }

  /**
   * 次の派遣枠の解放条件（§7.5「ステージクリアと併用」）。
   * ステージを踏破しただけでは増えず、そこから金を払って初めて増える。
   * すでに全枠解放済みなら null。
   */
  nextSlot(): { index: number; needStage: number; cost: number; stageDone: boolean; affordable: boolean } | null {
    const i = this.slotCount();
    if (i >= UNLOCK_STAGE_FOR_SLOT.length) return null;
    const needStage = UNLOCK_STAGE_FOR_SLOT[i] ?? 99;
    const cost = SLOT_COST[i] ?? 0;
    const stageDone = this.data.clearedStages.includes(needStage);
    return { index: i, needStage, cost, stageDone, affordable: this.data.gold >= cost };
  }

  /** 派遣枠を1つ買う。条件を満たしていなければ false。 */
  unlockSlot(): boolean {
    const n = this.nextSlot();
    if (!n || !n.stageDone || !n.affordable) return false;
    this.data.gold -= n.cost;
    this.data.unlockedSlots++;
    this.save();
    return true;
  }

  availableJobs(): JobId[] {
    const order: JobId[] = ['swordsman', 'guardian', 'skirmisher'];
    return order.slice(0, this.slotCount());
  }

  /** 完了済みも含めて派遣の内容を引く（レポート表示用）。 */
  dispatchInfo(id: string): Dispatch | null {
    return this.data.history[id]
      ?? this.data.dispatches.find(d => d.id === id)
      ?? null;
  }

  itemById(id: string | null): Item | null {
    if (!id) return null;
    return this.data.inventory.find(i => i.id === id) ?? null;
  }

  /**
   * 派遣する。結果はこの時点で確定させ、実時間は「見せるタイミング」だけを決める。
   * これによりオフライン計算が分割しても一括しても一致する（C4）。
   */
  dispatch(
    jobId: JobId, stageId: number, rule: RetreatRule, now: number,
    potionId: string | null = null
  ): boolean {
    if (this.isBusy(jobId)) return false;
    const eq = this.data.equipped[jobId];
    const weapon = this.itemById(eq.weapon);
    const armor = this.itemById(eq.armor);
    if (!weapon || !armor) return false;
    // 薬は**出発の瞬間に消費する**。持たせたのに手元にも残っていると、
    // 同じ1本を何人にも持たせられてしまう
    const usable = potionId && (this.data.garden.potions[potionId] ?? 0) > 0 ? potionId : null;

    // 帰還通知の許可は、初めて派遣を出したこの瞬間にだけ求める（§7.2）。
    // 起動直後に求めても何のための許可か分からず、まず拒否される。
    requestNotifyPermission();

    const job = jobDef(jobId);
    const stage = stageDef(stageId);
    const seed = (this.data.seed ^ (this.data.nextId * 0x9e3779b1)) >>> 0;
    const p = usable ? potionDef(usable) : null;
    const result = simulateRun({
      seed, job, weapon, armor,
      rule: retreatRuleDef(rule), stage, tier: this.data.tier,
      potion: p ? { element: p.element, resist: p.resist, name: p.name } : null
    });
    if (usable) {
      this.data.garden.potions[usable] = (this.data.garden.potions[usable] ?? 0) - 1;
    }

    const id = `d${this.data.nextId++}`;
    // 戦利品のIDを一意にし直す（生成側は run 内での連番しか知らないため）
    result.loot = result.loot.map(it => ({ ...it, id: `${id}-${it.id}` }));
    this.data.results[id] = result;
    const record: Dispatch = {
      id, jobId, stageId,
      weaponId: weapon.id, armorId: armor.id,
      retreatRule: rule, seed,
      potionId: usable,
      startedAt: now,
      // オフライン進行は8時間で頭打ちになる（§7.2）。深淵(480分)を重装兵
      // (所要+15%)で踏破すると 33,120秒となり、上限28,800秒を超えて
      // 「永久に完了しない派遣」になってしまう。仕様の3つの数値
      // （480分 / 8時間上限 / +15%）は同時には満たせないため、
      // 「派遣は必ず上限内に終わる」を優先してクランプする。
      durationSec: Math.min(result.durationSec, OFFLINE_CAP_SEC)
    };
    this.data.dispatches.push(record);
    this.data.history[id] = record;
    this.save();
    return true;
  }

  /** 完了した派遣を回収する。 */
  private collect(d: Dispatch): void {
    const result = this.data.results[d.id];
    if (!result) return;

    if (result.outcome === 'death') {
      // 死亡：戦利品は全ロスト、装備2点が消滅（冒険者本人は無事に帰る §4.1）
      // 何を失ったのかはレポートで見せる必要があるので、消す前に控えておく。
      // 「気づいたら手持ちから消えていた」では喪失が伝わらない。
      this.data.lost[d.id] = this.data.inventory.filter(
        i => i.id === d.weaponId || i.id === d.armorId
      ).map(i => ({ ...i }));
      this.data.inventory = this.data.inventory.filter(
        i => i.id !== d.weaponId && i.id !== d.armorId
      );
      const eq = this.data.equipped[d.jobId];
      if (eq.weapon === d.weaponId) eq.weapon = null;
      if (eq.armor === d.armorId) eq.armor = null;
      this.ensureStarterGear(d.jobId);
    } else {
      this.data.pending.push(...result.loot);
      this.data.gold += result.gold;
      if (result.outcome === 'clear') {
        if (!this.data.clearedStages.includes(d.stageId)) {
          this.data.clearedStages.push(d.stageId);
        }
        if (d.stageId === 10) {
          // 難易度+1。§7.1 の「全ステージが再解放される」は、文字どおり
          // 「全ステージがまた挑戦できるようになる」ことを指す。
          // clearedStages を消すと slotCount() の根拠が消えて冒険者2人が
          // ロスターから外れ、解放費用も払い直しになる——踏破の報酬が罰に
          // 変わってしまうので、消さずに全ステージを開放する。
          this.data.tier++;
          this.data.unlockedStages = STAGES.map(s2 => s2.id);
        }
      }
    }
    // 潜った先の属性の種を持ち帰る（薬草園）。
    // **乱数は引かない。** 派遣の結果はすでに確定しているので、
    // そこから決まる数にしておけば、何度読み直しても同じになる。
    const stage = stageDef(d.stageId);
    const elem = stage.enemyElement === 'mixed' ? 'physical' : stage.enemyElement;
    const herb = herbForElement(elem);
    const got = 1 + Math.floor(result.depth / 4);
    this.data.garden.seeds[herb.id] = (this.data.garden.seeds[herb.id] ?? 0) + got;

    this.data.inbox.push(d.id);

    // §7.2「帰還時にローカル通知を送る」。画面を見ていないときだけ鳴らす
    notifyReturn(
      jobDef(d.jobId).name,
      stageDef(d.stageId).name,
      result.outcome === 'death' ? '戦死' : result.outcome === 'clear' ? '踏破' : '撤退'
    );
  }

  /** 装備を失ったら最低性能の初期装備を無限に支給する（§4.4）。 */
  ensureStarterGear(jobId: JobId): void {
    const eq = this.data.equipped[jobId];
    if (!eq.weapon) {
      const w = starterItem('weapon', `sw${this.data.nextId++}`);
      this.data.inventory.push(w);
      eq.weapon = w.id;
    }
    if (!eq.armor) {
      const a = starterItem('armor', `sa${this.data.nextId++}`);
      this.data.inventory.push(a);
      eq.armor = a.id;
    }
  }

  // -------------------------------------------------------------- 開封

  /** 未鑑定品を全て開封してインベントリに入れる（§7.4 一括開封）。 */
  openAll(): Item[] {
    const opened = this.data.pending.map(it => ({ ...it, identified: true }));
    for (const it of opened) {
      const key = `${it.baseId}|${it.rarity}`;
      const e = this.data.compendium[key];
      if (e) e.count++;
      else this.data.compendium[key] = { firstStage: it.fromStage, count: 1 };
      if (it.unique) {
        const uk = `unique:${it.unique}`;
        const ue = this.data.compendium[uk];
        if (ue) ue.count++;
        else this.data.compendium[uk] = { firstStage: it.fromStage, count: 1 };
      }
    }
    this.data.inventory.push(...opened);
    this.data.pending = [];
    this.save();
    return opened;
  }

  // -------------------------------------------------------------- 薬草園

  /**
   * 畑1枠の育ち具合（0〜1）。
   *
   * **オフラインに上限を置かない。** 派遣は8時間で頭打ちにしているが
   * （SPEC §7.2・見ていない間に全部終わると遊ぶものが無くなるため）、
   * 畑は逆に「放っておいて構わない」ことが売りなので、
   * 寝ている間もそのまま育つ。腐りもしない。
   */
  plotProgress(index: number): { herb: HerbDef; ratio: number; remainingSec: number } | null {
    const bed = this.data.garden.beds[index];
    if (!bed) return null;
    const herb = herbDef(bed.herbId);
    const elapsed = Math.max(0, (this.clock().lastSeen - bed.plantedAt) / 1000);
    const ratio = Math.max(0, Math.min(1, elapsed / herb.growSec));
    return { herb, ratio, remainingSec: Math.max(0, herb.growSec - elapsed) };
  }

  /** 収穫できる枠の数。拠点のバッジに出す */
  readyCount(): number {
    let n = 0;
    for (let i = 0; i < this.data.garden.beds.length; i++) {
      if ((this.plotProgress(i)?.ratio ?? 0) >= 1) n++;
    }
    return n;
  }

  plant(index: number, herbId: string): boolean {
    const g = this.data.garden;
    if (index < 0 || index >= g.beds.length || g.beds[index]) return false;
    if ((g.seeds[herbId] ?? 0) <= 0) return false;
    g.seeds[herbId] = (g.seeds[herbId] ?? 0) - 1;
    g.beds[index] = { herbId, plantedAt: this.clock().lastSeen };
    this.save();
    return true;
  }

  /** 育ちきった枠を収穫する。育っていなければ何もしない（早取りはさせない）。 */
  harvest(index: number): number {
    const p = this.plotProgress(index);
    if (!p || p.ratio < 1) return 0;
    const g = this.data.garden;
    g.herbs[p.herb.id] = (g.herbs[p.herb.id] ?? 0) + p.herb.yield;
    g.beds[index] = null;
    this.save();
    return p.herb.yield;
  }

  harvestAll(): number {
    let n = 0;
    for (let i = 0; i < this.data.garden.beds.length; i++) n += this.harvest(i);
    return n;
  }

  buySeed(herbId: string): boolean {
    const herb = herbDef(herbId);
    if (this.data.gold < herb.seedCost) return false;
    this.data.gold -= herb.seedCost;
    this.data.garden.seeds[herbId] = (this.data.garden.seeds[herbId] ?? 0) + 1;
    this.save();
    return true;
  }

  nextPlotCost(): number | null {
    const g = this.data.garden;
    if (g.plots >= PLOTS_MAX) return null;
    return plotCost(g.plots);
  }

  expandGarden(): boolean {
    const cost = this.nextPlotCost();
    if (cost === null || this.data.gold < cost) return false;
    this.data.gold -= cost;
    this.data.garden.plots++;
    this.data.garden.beds.push(null);
    this.save();
    return true;
  }

  /** その薬を今すぐ作れるか。主材料2つ＋別の薬草1つ（data/garden.ts）。 */
  canBrew(potionId: string): boolean {
    const p = potionDef(potionId);
    const g = this.data.garden;
    if ((g.herbs[p.main] ?? 0) < 2) return false;
    let others = 0;
    for (const h of HERBS) {
      if (h.id === p.main) continue;
      others += g.herbs[h.id] ?? 0;
    }
    return others >= p.other;
  }

  /**
   * 調合する。主材料以外は**数の多いものから減らす**。
   *
   * 少ないほうから使うと、あと1つで別の薬が作れた材料を潰してしまう。
   * どれを使うか毎回選ばせるのは、この作品の「決めるのは3つだけ」に反する。
   */
  brew(potionId: string): boolean {
    if (!this.canBrew(potionId)) return false;
    const p = potionDef(potionId);
    const g = this.data.garden;
    g.herbs[p.main] = (g.herbs[p.main] ?? 0) - 2;
    let need = p.other;
    const pool = HERBS.filter(h => h.id !== p.main)
      .sort((a, b) => (g.herbs[b.id] ?? 0) - (g.herbs[a.id] ?? 0));
    for (const h of pool) {
      while (need > 0 && (g.herbs[h.id] ?? 0) > 0) {
        g.herbs[h.id] = (g.herbs[h.id] ?? 0) - 1;
        need--;
      }
      if (need === 0) break;
    }
    g.potions[potionId] = (g.potions[potionId] ?? 0) + 1;
    this.save();
    return true;
  }

  // -------------------------------------------------------------- 金

  /** ステージ解放（§7.5）。 */
  unlockStage(stageId: number): boolean {
    const stage = stageDef(stageId);
    if (this.data.unlockedStages.includes(stageId)) return false;
    if (this.data.gold < stage.unlockCost) return false;
    // 直前のステージをクリアしていること
    if (stageId > 1 && !this.data.clearedStages.includes(stageId - 1)) return false;
    this.data.gold -= stage.unlockCost;
    this.data.unlockedStages.push(stageId);
    this.save();
    return true;
  }

  reidentifyCost(item: Item): number {
    const rank = ['common', 'fine', 'rare', 'relic'].indexOf(item.rarity);
    return Math.round(60 * Math.pow(2.4, rank) * (1 + item.power / 200));
  }

  /** 再鑑定：アフィックス1つをランダムに振り直す（§7.5）。 */
  reidentify(itemId: string, rng: Prng): boolean {
    const item = this.data.inventory.find(i => i.id === itemId);
    if (!item || item.affixes.length === 0) return false;
    const cost = this.reidentifyCost(item);
    if (this.data.gold < cost) return false;
    this.data.gold -= cost;
    const idx = rng.int(item.affixes.length);
    const target = item.affixes[idx];
    if (!target) return false;
    const def = AFFIXES.find(a => a.kind === target.kind);
    if (!def) return false;
    const value = def.min + rng.float() * (def.max - def.min);
    const t = (value - def.min) / Math.max(0.0001, def.max - def.min);
    item.affixes[idx] = {
      kind: target.kind,
      value,
      tier: Math.max(1, Math.min(5, Math.floor(t * 5) + 1)),
      ...(target.element ? { element: target.element } : {})
    };
    this.save();
    return true;
  }

  /** 売却。ゴミ装備が金に変わらないと純粋なストレスになる（§7.5）。 */
  sell(ids: string[], valueOf: (i: Item) => number): number {
    let total = 0;
    const equippedIds = new Set(
      Object.values(this.data.equipped).flatMap(e => [e.weapon, e.armor])
    );
    const keep: Item[] = [];
    for (const it of this.data.inventory) {
      if (ids.includes(it.id) && !it.locked && !equippedIds.has(it.id)) {
        total += valueOf(it);
      } else {
        keep.push(it);
      }
    }
    this.data.inventory = keep;
    this.data.gold += total;
    this.save();
    return total;
  }

  // -------------------------------------------------------------- 保存

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // 保存に失敗しても進行は続ける
    }
  }

  reset(seed: number, now: number): void {
    this.data = defaultSave(seed, now);
    this.save();
  }
}

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData> & { version: number };
    // v1 → v2: 派遣枠に金の費用が付いた（§7.5）。
    // すでに条件ステージを踏破していた分は、支払い済みとみなして解放したまま渡す。
    // 遊んでいた人から枠を取り上げないため。
    if (parsed.version === 1) {
      let n = 1;
      for (let i = 1; i < UNLOCK_STAGE_FOR_SLOT.length; i++) {
        if ((parsed.clearedStages ?? []).includes(UNLOCK_STAGE_FOR_SLOT[i] ?? 99)) n++;
      }
      parsed.unlockedSlots = n;
      parsed.version = SAVE_VERSION;
    }
    // v2 → v3: 薬草園が増えた。既存のセーブには畑を初期状態で足すだけで、
    // 今までの持ち物・進捗には一切触れない
    if (parsed.version === 2) {
      parsed.garden = defaultGarden();
      parsed.version = SAVE_VERSION;
    }
    if (parsed.version !== SAVE_VERSION) return null;
    if (typeof parsed.unlockedSlots !== 'number') parsed.unlockedSlots = 1;
    if (!parsed.lost) parsed.lost = {};
    if (!parsed.garden) parsed.garden = defaultGarden();
    return parsed as SaveData;
  } catch {
    return null;
  }
}

/** デバッグ用：任意のステージのドロップを直接生成する（開封演出の確認に使う）。 */
export function debugLoot(seed: number, stageId: number, count: number): Item[] {
  const rng = new Prng(seed);
  const stage = stageDef(stageId);
  return Array.from({ length: count }, (_, i) => generateItem(rng, {
    itemPower: itemPowerFor(stage.id, 1),
    slot: i % 2 === 0 ? 'weapon' : 'armor',
    stageId: stage.id,
    rarityBonus: stage.rarityBonus,
    id: `dbg-${i}`
  }));
}

export { STAGES };
