// Shared simulation types. This module (and everything under src/sim/)
// must never import Canvas/DOM code (spec C5).

export type PersonalityId = 'timid' | 'greedy' | 'hasty';

export type EquipKind = 'weapon' | 'armor' | 'tool';

export interface EquipmentDef {
  id: string;
  name: string;
  kind: EquipKind;
  /** 軽=1 / 中=2 / 重=3 */
  weight: 1 | 2 | 3;
  /** counts as 軽装 armor (A2 / A4) */
  lightArmor?: boolean;
  note: string;
}

/** Immutable snapshot of the adventurer at the start of a run. */
export interface AdvSnapshot {
  name: string;
  job: string;
  level: number;
  gold: number;
  questDepth: number;
  personality: PersonalityId;
  /** Equipment id (W1..W4) that counts as 相性の合う武器 for E15. */
  favoredWeapon: string;
  maxHp: number;
}

/** Requirements for an equipment-derived option. */
export interface EquipReq {
  /** All of these equipment ids must be carried. */
  items?: string[];
  /** Any one of these equipment ids must be carried. */
  anyOf?: string[];
  /** Requires 軽装: wearing light armor (A2/A4) and not overweight. */
  light?: boolean;
  /** Requires carrying the adventurer's favored weapon (E15). */
  favoredWeapon?: boolean;
}

export interface OptionEffects {
  depth?: number;
  loot?: number;
  rareLoot?: boolean;
  /** seconds added (negative = time lost) */
  time?: number;
  /** damage model when resolving */
  dmg?: 'fight' | 'small' | 'large' | 'none';
  gold?: boolean;
  /** gain a random tool into the carried set (E5) */
  toolGain?: boolean;
  heal?: boolean;
  /** run ends immediately after resolution (returns home alive) */
  endRun?: boolean;
}

export interface EventOptionDef {
  id: string;
  label: string;
  /** present only on equipment-derived options */
  requires?: EquipReq;
  /** auto-picked when the 5s timer expires */
  safe?: boolean;
  /** counts as 逃げる (disabled for 短気) */
  flee?: boolean;
  effects: OptionEffects;
  /** short line for the event log */
  logLine: string;
}

export interface DungeonEventDef {
  id: string;
  name: string;
  minDepth: number;
  maxDepth: number;
  /** icon key for the renderer */
  icon: string;
  /** vein events trigger 強欲's forced dig */
  vein?: boolean;
  options: EventOptionDef[];
}

/** A concrete option offered at a choice point. */
export interface OfferedOption {
  def: EventOptionDef;
  /** equipment ids that justify this option (empty for constant options) */
  sourceEquip: string[];
  /** grayed out (短気の「逃げる」など)。表示はするが選べない */
  disabled: boolean;
  disabledReason?: string;
}

export type SimEvent =
  | { kind: 'depart'; t: number }
  | { kind: 'depth'; t: number; depth: number }
  | { kind: 'log'; t: number; text: string }
  | { kind: 'stratum'; t: number; stratum: number }
  | { kind: 'choice'; t: number; slot: number; eventId: string; eventName: string;
      icon: string; depth: number; options: OfferedOption[];
      /** index auto-resolved by personality (強欲の採掘): no player input */
      forced?: number }
  | { kind: 'resolve'; t: number; slot: number; eventId: string; optionId: string;
      byEquip: string[]; text: string }
  | { kind: 'damage'; t: number; amount: number; hp: number; maxHp: number; text: string }
  | { kind: 'heal'; t: number; amount: number; hp: number; maxHp: number }
  | { kind: 'loot'; t: number; lootId: string; rare: boolean; text: string }
  | { kind: 'gold'; t: number; amount: number }
  | { kind: 'mine'; t: number; seconds: number }
  | { kind: 'retreat'; t: number; reason: string }
  | { kind: 'death'; t: number; cause: string }
  | { kind: 'end'; t: number };

export type RunFate = 'survived' | 'died' | 'retreated';

export interface RunOutcome {
  fate: RunFate;
  /** floor(depth) reached */
  depth: number;
  questDepth: number;
  questMet: boolean;
  lootIds: string[];
  goldGained: number;
  /** equipment ids destroyed by wear (survival) — death loses everything */
  brokenEquip: string[];
  /** equipment ids consumed (傷薬) */
  consumedEquip: string[];
  /** one-line cause for the letter (敗因 or 成功要因) */
  letterLine: string;
  /** equipment id credited in the letter, if any */
  letterEquip?: string;
}

export interface PendingChoice {
  t: number;
  slot: number;
  eventId: string;
  eventName: string;
  icon: string;
  options: OfferedOption[];
  /** index of the option auto-picked on timeout */
  safeIndex: number;
}

export interface SimResult {
  events: SimEvent[];
  /** set when the sim stopped awaiting a player decision */
  pending?: PendingChoice;
  /** set when the run finished */
  outcome?: RunOutcome;
}

export interface SimInput {
  seed: number;
  adventurer: AdvSnapshot;
  /** equipment ids handed over (max 3) */
  equipment: string[];
  /** choice history: option index per resolved choice slot */
  choices: number[];
}
