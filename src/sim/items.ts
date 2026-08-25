import { Prng } from './prng';
import type {
  Affix, AffixDef, Element, ElementSplit, Item, Rarity, Slot, UniqueKind
} from './types';
import { BASE_TYPES, baseDef } from '../data/bases';
import { affixPoolFor } from '../data/affixes';
import { UNIQUES } from '../data/uniques';

// 装備生成（仕様書 §5）。このゲームの中核。
//
// 設計原則（§5.1）: 総ダメージ量（バジェット）は狭くしか揺らさず、配分と効果を
// 大きく揺らす。新しい武器が古い武器の単純な上位互換になった時点で失敗である。

/** 攻撃力・防御力の上限（§5.9・C8）。4桁に到達させない。 */
export const POWER_CAP = 999;

/** アフィックス枠の上限（§5.2）。 */
const AFFIX_SLOT_MAX: Record<Slot, number> = { weapon: 4, armor: 3 };

// ---------------------------------------------------------------- レアリティ

interface RarityRule {
  rarity: Rarity;
  weight: number;
  /** アフィックス枠の下限・上限 */
  affixMin: number;
  affixMax: number;
  hasUnique: boolean;
}

// §5.7 レアリティは「枠数」で表現し、数値の高さでは表現しない。
const RARITY_RULES: readonly RarityRule[] = [
  { rarity: 'common', weight: 60, affixMin: 0, affixMax: 0, hasUnique: false },
  { rarity: 'fine',   weight: 28, affixMin: 1, affixMax: 2, hasUnique: false },
  { rarity: 'rare',   weight: 9,  affixMin: 3, affixMax: 4, hasUnique: false },
  // 遺物は「2固定+ランダム1」。稀少より枠は少ないが、ルールを書き換えるユニークが付く
  { rarity: 'relic',  weight: 3,  affixMin: 2, affixMax: 3, hasUnique: true }
];

export function rarityRank(r: Rarity): number {
  return ['common', 'fine', 'rare', 'relic'].indexOf(r);
}

/** 稀少以上はカットインの対象（§5.7・§7.4）。 */
export function hasCutIn(r: Rarity): boolean {
  return r === 'rare' || r === 'relic';
}

function rollRarity(rng: Prng, rarityBonus: number): RarityRule {
  // rarityBonus はステージのレア率補正。稀少・遺物の重みだけを持ち上げる。
  const weights = RARITY_RULES.map(r =>
    r.rarity === 'rare' || r.rarity === 'relic' ? r.weight * rarityBonus : r.weight
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.float() * total;
  for (let i = 0; i < RARITY_RULES.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) {
      const rule = RARITY_RULES[i];
      if (rule) return rule;
    }
  }
  return RARITY_RULES[0] as RarityRule;
}

// ---------------------------------------------------------------- 属性配分

interface SplitShape {
  /** 物理の比率。残りが属性側 */
  physical: number;
  weight: number;
  /** 属性寄せの武器（杖など）での重み */
  casterWeight: number;
}

// §5.2 L2「属性配分は大きく振る」
const SPLIT_SHAPES: readonly SplitShape[] = [
  { physical: 1.0, weight: 30, casterWeight: 5 },
  { physical: 0.7, weight: 25, casterWeight: 15 },
  { physical: 0.5, weight: 20, casterWeight: 25 },
  { physical: 0.3, weight: 15, casterWeight: 30 },
  { physical: 0.0, weight: 10, casterWeight: 25 }
];

const NON_PHYSICAL: readonly Element[] = ['fire', 'lightning', 'poison', 'ice'];

function rollElementSplit(rng: Prng, isCaster: boolean): ElementSplit {
  const weights = SPLIT_SHAPES.map(s => (isCaster ? s.casterWeight : s.weight));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.float() * total;
  let shape = SPLIT_SHAPES[0] as SplitShape;
  for (let i = 0; i < SPLIT_SHAPES.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) { shape = SPLIT_SHAPES[i] as SplitShape; break; }
  }
  const split: ElementSplit = {};
  if (shape.physical > 0) split.physical = shape.physical;
  const rest = 1 - shape.physical;
  if (rest > 0) {
    const elem = rng.pick(NON_PHYSICAL);
    split[elem] = rest;
  }
  return split;
}

/** 表示・判定用に、配分の中で最も比率の高い属性を返す。 */
export function dominantElement(split: ElementSplit): Element {
  let best: Element = 'physical';
  let bestVal = -1;
  for (const [k, v] of Object.entries(split)) {
    if (v !== undefined && v > bestVal) { bestVal = v; best = k as Element; }
  }
  return best;
}

// ---------------------------------------------------------------- ティア

/**
 * 内部の連続値を5段階のティアに丸める（§5.6）。
 * 画面には ★ の数だけを出し、`+11.3%` と `+11.7%` の差は見せない。
 */
export function tierOf(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  const t = (value - min) / (max - min);
  return Math.max(1, Math.min(5, Math.floor(t * 5) + 1));
}

// ---------------------------------------------------------------- 生成

function rollAffixes(
  rng: Prng, pool: AffixDef[], count: number
): Affix[] {
  const picked: Affix[] = [];
  const remaining = [...pool];
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const idx = rng.int(remaining.length);
    const def = remaining.splice(idx, 1)[0];
    if (!def) break;
    const value = def.min + rng.float() * (def.max - def.min);
    const affix: Affix = {
      kind: def.kind,
      value,
      tier: tierOf(value, def.min, def.max)
    };
    if (def.elemental) affix.element = rng.pick(NON_PHYSICAL);
    picked.push(affix);
  }
  return picked;
}

export interface GenerateOptions {
  itemPower: number;
  slot: Slot;
  stageId: number;
  /** ステージのレア率補正 */
  rarityBonus: number;
  /** アイテムIDの生成に使う一意な接頭辞 */
  id: string;
}

export function generateItem(rng: Prng, opts: GenerateOptions): Item {
  const candidates = BASE_TYPES.filter(b => b.slot === opts.slot);
  const base = rng.pick(candidates);
  const rule = rollRarity(rng, opts.rarityBonus);

  // --- L1 基礎値（§5.3）---
  // 攻撃力と攻撃速度は厳密な逆相関にする。片方が高ロールならもう片方は必ず低ロール。
  // これにより素の DPS が狭い範囲に収まり、差は L2・L3 で付く（§5.1）。
  const t = rng.float();
  const center = opts.itemPower * base.mul;
  let power: number;
  let speed = 0;
  let crit = 0;
  if (opts.slot === 'weapon') {
    // t=0 → 攻撃力+10% / 速度-4.8%、t=1 → 攻撃力-10% / 速度+4.8%
    power = center * (1.10 - 0.20 * t);
    speed = base.speed * (0.952 + 0.096 * t);
    crit = base.critMin + rng.float() * (base.critMax - base.critMin);
  } else {
    // 防具は速度を持たないので、素直に ±10%
    power = center * (0.90 + 0.20 * rng.float());
  }
  // §5.9・C8: 4桁に到達させない
  power = Math.min(POWER_CAP, Math.round(power));
  speed = Math.round(speed * 100) / 100;
  crit = Math.round(crit * 10) / 10;

  // --- L2 属性配分（武器のみ）---
  const element: ElementSplit = opts.slot === 'weapon'
    ? rollElementSplit(rng, base.tags.includes('elemental'))
    : {};

  // --- L3 アフィックス（§5.8: ベースタイプで池をフィルタする）---
  const pool = affixPoolFor(opts.slot, base.tags);
  const wanted = rule.affixMin + rng.int(rule.affixMax - rule.affixMin + 1);
  const count = Math.min(wanted, AFFIX_SLOT_MAX[opts.slot]);
  const affixes = rollAffixes(rng, pool, count);

  // --- L4 ユニーク ---
  const unique: UniqueKind | null = rule.hasUnique ? rng.pick(UNIQUES).kind : null;

  return {
    id: opts.id,
    baseId: base.id,
    slot: opts.slot,
    rarity: rule.rarity,
    power,
    speed,
    crit,
    element,
    affixes,
    unique,
    identified: false,
    fromStage: opts.stageId
  };
}

/** 死亡して装備を全て失ったときに無限支給される最低性能の初期装備（§4.4）。 */
export function starterItem(slot: Slot, id: string): Item {
  const base = slot === 'weapon' ? baseDef('sword') : baseDef('light');
  return {
    id,
    baseId: base.id,
    slot,
    rarity: 'common',
    power: Math.round(60 * base.mul),
    speed: slot === 'weapon' ? base.speed : 0,
    crit: slot === 'weapon' ? base.critMin : 0,
    element: slot === 'weapon' ? { physical: 1 } : {},
    affixes: [],
    unique: null,
    identified: true,
    fromStage: 0
  };
}

/** 売却価格。ゴミ装備が金に変わらないと純粋なストレスになる（§7.5）。 */
export function sellValue(item: Item): number {
  const rarityMul: Record<Rarity, number> = {
    common: 1, fine: 2.5, rare: 7, relic: 20
  };
  return Math.max(1, Math.round(item.power * 0.25 * rarityMul[item.rarity]));
}
