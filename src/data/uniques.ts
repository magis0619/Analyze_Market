import type { UniqueDef, UniqueKind } from '../sim/types';

// L4 ユニーク効果（仕様書 §5.5）。遺物にのみ付く（3%）。
// 「ルールを書き換える1行」であること。数値を盛るだけの効果は入れない。

export const UNIQUES: readonly UniqueDef[] = [
  {
    kind: 'noCritFlatPower',
    name: '静かな刃',
    text: '会心が発生しない。代わりに全攻撃の威力が常時 +25%'
  },
  {
    kind: 'slowTriple',
    name: '重き一撃',
    text: '攻撃速度が半減。1撃が3倍、かつ範囲攻撃になる'
  },
  {
    kind: 'killStack',
    name: '喰らう者',
    text: '敵を倒すたびに攻撃力 +1（そのステージ中のみ）'
  },
  {
    kind: 'greedyGlass',
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
