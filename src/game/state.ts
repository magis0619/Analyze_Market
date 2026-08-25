import type {
  Dispatch, Item, JobId, RetreatRule, RunResult
} from '../sim/types';
import { Prng } from '../sim/prng';
import { simulateRun } from '../sim/combat';
import { generateItem, starterItem } from '../sim/items';
import { advanceClock, dispatchProgress, type ClockState } from '../sim/offline';
import { jobDef, retreatRuleDef, UNLOCK_STAGE_FOR_SLOT } from '../data/jobs';
import { stageDef, STAGES, itemPowerFor } from '../data/stages';
import { AFFIXES } from '../data/affixes';

// 拠点の状態とセーブ。サーバなし、ローカル永続化のみ（§3）。

const SAVE_KEY = 'delvers.save.v1';
const SAVE_VERSION = 1;

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
  /** 図鑑。キーは `${baseId}|${rarity}` と `unique:${kind}` */
  compendium: Record<string, CompendiumEntry>;
  lastSeen: number;
  nextId: number;
}

function defaultSave(seed: number, now: number): SaveData {
  const s: SaveData = {
    version: SAVE_VERSION,
    seed,
    gold: 0,
    tier: 1,
    clearedStages: [],
    unlockedStages: [1],
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

  /** 解放済みの派遣枠数（§4.2 ステージ3で2人目、6で3人目）。 */
  slotCount(): number {
    let n = 1;
    for (let i = 1; i < UNLOCK_STAGE_FOR_SLOT.length; i++) {
      const need = UNLOCK_STAGE_FOR_SLOT[i] ?? 99;
      if (this.data.clearedStages.includes(need)) n++;
    }
    return n;
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
  dispatch(jobId: JobId, stageId: number, rule: RetreatRule, now: number): boolean {
    if (this.isBusy(jobId)) return false;
    const eq = this.data.equipped[jobId];
    const weapon = this.itemById(eq.weapon);
    const armor = this.itemById(eq.armor);
    if (!weapon || !armor) return false;

    const job = jobDef(jobId);
    const stage = stageDef(stageId);
    const seed = (this.data.seed ^ (this.data.nextId * 0x9e3779b1)) >>> 0;
    const result = simulateRun({
      seed, job, weapon, armor,
      rule: retreatRuleDef(rule), stage, tier: this.data.tier
    });

    const id = `d${this.data.nextId++}`;
    // 戦利品のIDを一意にし直す（生成側は run 内での連番しか知らないため）
    result.loot = result.loot.map(it => ({ ...it, id: `${id}-${it.id}` }));
    this.data.results[id] = result;
    const record: Dispatch = {
      id, jobId, stageId,
      weaponId: weapon.id, armorId: armor.id,
      retreatRule: rule, seed,
      startedAt: now,
      durationSec: result.durationSec
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
          // 難易度+1、全ステージが再解放される（§7.1 無限ティア）
          this.data.tier++;
          this.data.clearedStages = [];
          this.data.unlockedStages = [1];
        }
      }
    }
    this.data.inbox.push(d.id);
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
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
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
