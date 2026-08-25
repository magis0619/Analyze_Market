import type { UniqueDef, UniqueKind } from '../sim/types';

// L4 ユニーク効果（仕様書 §5.5）。遺物にのみ付く（3%）。
// 「ルールを書き換える1行」であること。数値を盛るだけの効果は入れない。
//
// slot を必ず指定すること。指定が無いと生成側が武器用の効果を防具に載せてしまい、
// 戦闘側が読まない＝カットインで見せた1行が嘘になる。

export const UNIQUES: readonly UniqueDef[] = [
  // --- 武器 ---
  {
    kind: 'noCritFlatPower', slot: 'weapon',
    name: '静かな刃',
    text: '会心が発生しない。代わりに全攻撃の威力が常時 +25%'
  },
  {
    kind: 'slowTriple', slot: 'weapon',
    name: '重き一撃',
    text: '攻撃速度が半減。1撃が3倍、かつ範囲攻撃になる'
  },
  {
    kind: 'killStack', slot: 'weapon',
    name: '喰らう者',
    text: '敵を倒すたびに攻撃力 +1（そのステージ中のみ）'
  },
  // --- 防具 ---
  {
    kind: 'wardStack', slot: 'armor',
    name: '積年の盾',
    text: '被弾するたびに防御 +2（そのステージ中のみ）'
  },
  {
    kind: 'lastStand', slot: 'armor',
    name: '背水の鎧',
    text: 'HPが25%を切っている間、受けるダメージが半減する'
  },
  {
    kind: 'thorns', slot: 'armor',
    name: '棘の外套',
    text: '被弾するたび、受けたダメージの40%を相手に返す'
  },
  // --- 両方 ---
  {
    kind: 'greedyGlass', slot: 'both',
    name: '強欲の器',
    text: 'ドロップ +50%、被ダメージ +25%'
  }
] as const;

const byKind = new Map(UNIQUES.map(u => [u.kind, u]));

export function uniqueDef(kind: UniqueKind): UniqueDef {
  const def = byKind.get(kind);
  if (!def) throw new Error(`unknown unique: ${kind}`);
  return def;
}

/** そのスロットに付けてよいユニーク（§5.5）。必ず1件以上返る。 */
export function uniquesForSlot(slot: 'weapon' | 'armor'): readonly UniqueDef[] {
  return UNIQUES.filter(u => u.slot === slot || u.slot === 'both');
}
