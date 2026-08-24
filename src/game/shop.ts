import { EQUIPMENT } from '../data/equipment';
import { createRegular, maxHpFor, questDepthFor, type RegularState } from '../data/adventurers';
import type { AdvSnapshot, RunOutcome } from '../sim/types';
import { Prng } from '../sim/prng';

// 店のメタ状態。常連1人を最大6ランまで追い、死亡で系譜が交代する（仕様 §3.5）。

export interface CompendiumEntry {
  lootId: string;
  foundBy: string;
  generation: number;
  runIndex: number;
}

export interface LineageNote {
  generation: number;
  name: string;
  fate: 'active' | 'died' | 'retired';
  bestDepth: number;
  runs: number;
}

export class Shop {
  readonly seed: number;
  gold = 0;
  /** 貸出可能な装備ID */
  stock: string[];
  /** 前回のランで消耗し、修理中（次の来店1回だけ貸せない） */
  repairing: string[] = [];
  compendium: CompendiumEntry[] = [];
  lineage: LineageNote[] = [];
  regular: RegularState;
  /** 世代交代時の口上（商談画面のバナー用） */
  arrivalNote: string | null = null;
  totalRuns = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.stock = EQUIPMENT.map(e => e.id);
    this.regular = createRegular(this.seed, 1);
    this.lineage.push({
      generation: 1, name: this.regular.name, fate: 'active', bestDepth: 0, runs: 0
    });
    this.arrivalNote = `${this.regular.name}が初めて店の扉を叩いた`;
  }

  /** 現在のランの決定論シード。 */
  runSeed(): number {
    const r = this.regular;
    return (this.seed ^ (r.generation * 0x9e3779b1) ^ (r.runIndex * 0x85ebca77)) >>> 0;
  }

  advSnapshot(): AdvSnapshot {
    const r = this.regular;
    return {
      name: r.name,
      job: r.job,
      level: r.level,
      gold: r.gold,
      questDepth: questDepthFor(r.runIndex),
      personality: r.personality,
      favoredWeapon: r.favoredWeapon,
      maxHp: maxHpFor(r.level)
    };
  }

  available(): string[] {
    return this.stock.filter(id => !this.repairing.includes(id));
  }

  /** ラン結果を店へ反映し、次の来店状態を作る。 */
  applyOutcome(handed: string[], outcome: RunOutcome): void {
    this.totalRuns++;
    const r = this.regular;
    const note = this.lineage[this.lineage.length - 1];

    // 修理明け
    this.repairing = [];

    for (const lootId of outcome.lootIds) {
      this.compendium.push({
        lootId, foundBy: r.name, generation: r.generation, runIndex: r.runIndex
      });
    }
    this.gold += outcome.goldGained;

    if (outcome.fate === 'died') {
      // 渡した装備は永久に失われる。冒険者は二度と来店しない。
      this.stock = this.stock.filter(id => !handed.includes(id));
      if (note) { note.fate = 'died'; note.runs = r.runIndex; note.bestDepth = Math.max(note.bestDepth, outcome.depth); }
      this.succession(handed, true);
      return;
    }

    // 生還：消耗品は消費、破損品は修理送り（次の来店1回だけ使えない）
    this.stock = this.stock.filter(id => !outcome.consumedEquip.includes(id));
    this.repairing = outcome.brokenEquip.filter(id => this.stock.includes(id));

    r.bestDepth = Math.max(r.bestDepth, outcome.depth);
    if (note) { note.bestDepth = r.bestDepth; note.runs = r.runIndex; }
    r.gold += outcome.goldGained;
    r.level += 1;
    r.runIndex += 1;

    if (r.runIndex > 6) {
      // 6ランを追い切った：引退し、次の系譜へ
      if (note) note.fate = 'retired';
      this.succession(handed, false);
    }
  }

  /** 世代交代。死亡時は遺品が1つだけ戻る。 */
  private succession(handed: string[], died: boolean): void {
    const prev = this.regular;
    const next = createRegular(this.seed, prev.generation + 1);
    const rel = relationLabel(next.generation);
    if (died && handed.length > 0) {
      const rng = new Prng((this.seed ^ (prev.generation * 0x27d4eb2f)) >>> 0);
      const memento = handed[rng.int(handed.length)];
      if (memento !== undefined && !this.stock.includes(memento)) {
        this.stock.push(memento);
        this.arrivalNote =
          `${prev.name}の遺品を携え、${rel}${next.name}が店に来た`;
      } else {
        this.arrivalNote = `${prev.name}の${rel}${next.name}が店に来た`;
      }
    } else if (died) {
      this.arrivalNote = `${prev.name}の訃報を聞き、${rel}${next.name}が店に来た`;
    } else {
      this.arrivalNote =
        `${prev.name}は引退した。弟子の${next.name}が店に来た`;
    }
    this.regular = next;
    this.lineage.push({
      generation: next.generation, name: next.name, fate: 'active', bestDepth: 0, runs: 0
    });
  }
}

/** 「弟子または子」の呼び分け（世代番号で決定論的に切替）。 */
export function relationLabel(generation: number): string {
  return generation % 2 === 0 ? '弟子の' : '子の';
}
