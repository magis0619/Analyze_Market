import type { AffixDef, AffixKind } from '../sim/types';

// L3 アフィックス（仕様書 §5.4）。MVP は合計8種で開始する。
//
// **重要な制約（§5.4・C9）**: 回復効果は防具側にのみ実装する。武器に回復を
// 付けてはならない。回復量は割合ではなく固定値とし、深層のダメージインフレに
// 自然と置いていかれる設計にする（回復付き武器が常に最適解になる破綻を防ぐため）。
//
// tags は「このアフィックスを引けるベースタイプ」を決める（§5.8
// 「AFFIX_POOL を必ずベースタイプでフィルタすること。武器種ごとに引ける池が
// 違うことが収集動機になる」）。ベースの tags と1つでも交差すれば引ける。

export const AFFIXES: readonly AffixDef[] = [
  // --- 武器用 5種 ---
  {
    kind: 'attackPct', name: '攻撃力', slot: 'weapon',
    min: 8, max: 15, isPercent: true,
    // 全武器が引ける（physical か elemental のどちらかを必ず持つ）
    tags: ['physical', 'elemental']
  },
  {
    kind: 'critDmgPct', name: '会心ダメージ', slot: 'weapon',
    min: 15, max: 40, isPercent: true,
    // 会心を活かせる武器のみ：短剣・片手剣・弓
    tags: ['crit']
  },
  {
    kind: 'elementFlat', name: '属性ダメージ', slot: 'weapon',
    min: 4, max: 12, isPercent: false,
    // 属性を乗せられる武器：杖・弓・槍
    tags: ['elemental', 'ranged', 'reach'],
    elemental: true
  },
  {
    kind: 'lowHpPct', name: '窮地の威力', slot: 'weapon',
    min: 20, max: 50, isPercent: true,
    // 打たれ強い前衛向け：両手剣・片手剣・槍
    tags: ['heavy', 'slow', 'balanced']
  },
  {
    kind: 'comboSpeedPct', name: '連撃加速', slot: 'weapon',
    min: 3, max: 8, isPercent: true,
    // 手数型のみ：短剣・弓
    tags: ['fast']
  },
  // --- 防具用 3種 ---
  {
    kind: 'defensePct', name: '防御', slot: 'armor',
    min: 8, max: 15, isPercent: true,
    tags: ['light', 'medium', 'heavy']
  },
  {
    kind: 'resistPct', name: '属性耐性', slot: 'armor',
    min: 10, max: 30, isPercent: true,
    // 厚い鎧のみ：中鎧・重鎧
    tags: ['medium', 'heavy', 'sturdy'],
    elemental: true
  },
  {
    kind: 'killHeal', name: '撃破時回復', slot: 'armor',
    min: 2, max: 6, isPercent: false,
    // 動き回る鎧のみ：軽鎧・中鎧
    tags: ['light', 'medium', 'evasive', 'balanced']
  }
] as const;

/** そのベースタイプが引けるアフィックスだけを返す（§5.8）。 */
export function affixPoolFor(slot: 'weapon' | 'armor', baseTags: readonly string[]): AffixDef[] {
  return AFFIXES.filter(a =>
    a.slot === slot && a.tags.some(t => baseTags.includes(t))
  );
}

const byKind = new Map(AFFIXES.map(a => [a.kind, a]));

export function affixDef(kind: AffixKind): AffixDef {
  const def = byKind.get(kind);
  if (!def) throw new Error(`unknown affix: ${kind}`);
  return def;
}
