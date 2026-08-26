import type { Element, Item, StageDef } from '../sim/types';
import { itemScore } from './components';

// 派遣先との相性（改善指示書 §2）。
//
// **問題:** 属性タグもダンジョン別の倍率も最初から実装されていた。
// 効いていなかったのは UI で、一覧も比較も「素の秒間火力」しか出していなかった。
// 弱点属性なら1.5倍・耐性属性なら0.5倍という3倍の開きが画面のどこにも出ないので、
// プレイヤーには「一番大きい数字を装備する」以外にやることが無かった。
//
// ここは **UI 層**。sim/ の式を写して読み替えるのではなく、
// 同じ形の計算を1箇所に集めて、画面のどこでも同じ数字が出るようにする。
//
//   武器: raw = 攻撃力 × Σ(配分 × 属性係数) × …   （combat.ts の減衰前）
//   防具: 被ダメージ = … × (1 - 耐性)             （耐性は上限0.75）
//
// 並べ替えにはこの解析値を使う（全候補ぶんを毎フレーム出す必要があるので軽さが要る）。
// **決断の場面——比較画面——では実測を出す**（affinity ではなくシミュレーション）。
// 解析値は「どれを見るか」を決めるためのもので、「どれを選ぶか」は実測で決める。

/** 属性係数（§6.3）。combat.ts の elementMul と同じ規則。 */
export function elementMul(stage: StageDef, elem: Element): number {
  if (stage.resists.includes(elem)) return 0.5;
  if (stage.weakTo === elem) return 1.5;
  return 1.0;
}

/**
 * 武器の属性配分に対する、その派遣先での実効倍率。
 *
 * 配分は正規化されている前提を置かない（0.5/0.5 でも 1.0 単独でも同じ式で通る）。
 */
export function weaponAffinity(item: Item, stage: StageDef): number {
  let sum = 0;
  let weight = 0;
  for (const [k, v] of Object.entries(item.element)) {
    if (v === undefined || v <= 0) continue;
    sum += v * elementMul(stage, k as Element);
    weight += v;
  }
  if (weight <= 0) return elementMul(stage, 'physical');
  return sum / weight;
}

/**
 * 防具の、その派遣先での実効倍率。
 *
 * 敵の攻撃属性に対する耐性がそのまま被ダメージの減少になる（上限75%）。
 * `mixed` のステージは特定の耐性が効かないので 1.0。
 */
export function armorAffinity(item: Item, stage: StageDef): number {
  const enemy = stage.enemyElement;
  if (enemy === 'mixed') return 1.0;
  let resist = 0;
  for (const a of item.affixes) {
    if (a.kind === 'resistPct' && a.element === enemy) resist += a.value / 100;
  }
  resist = Math.min(0.75, resist);
  // 被ダメージが (1-r) になる＝実効的な耐久が 1/(1-r) 倍になる
  return 1 / (1 - resist);
}

export function affinity(item: Item, stage: StageDef): number {
  return item.slot === 'weapon' ? weaponAffinity(item, stage) : armorAffinity(item, stage);
}

/**
 * その派遣先での実効値。一覧の並べ替えと差分表示に使う。
 *
 * 素の `itemScore`（秒間火力／防御）に相性を掛けただけ。
 * **これは目安であって戦績の予測ではない**——敵の硬さ・撤退ライン・
 * ユニーク効果は入っていない。決断は比較画面の実測で下す。
 */
export function effectiveScore(item: Item, stage: StageDef): number {
  return Math.round(itemScore(item) * affinity(item, stage));
}

export type AffinityKind = 'weak' | 'resist' | 'even' | 'guard';

/** 相性の種別。色を1箇所で決める。 */
export function affinityKind(item: Item, stage: StageDef): AffinityKind {
  const a = affinity(item, stage);
  if (item.slot === 'armor') return a > 1.01 ? 'guard' : 'even';
  if (a > 1.01) return 'weak';
  if (a < 0.99) return 'resist';
  return 'even';
}

/**
 * 相性の表示。
 *
 * **語だけでは足りない。** 武器の属性は単一ではなく配分なので、
 * 「半分が雷」の片手剣は ×1.25 になる。これを「弱点を突く」と書くと、
 * 純粋な雷の武器（×1.5）と同じ顔になり、行の左のアイコン（＝主属性は物理）とも
 * 食い違う。倍率をそのまま出せば、どちらの疑問も起きない。
 */
export function affinityText(item: Item, stage: StageDef): string {
  const a = affinity(item, stage);
  const n = `×${a.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}`;
  // 防具は「耐久が1.33倍」より「被害が25%減る」のほうが直に伝わる。
  // ×1.33 と書くと、被害が増えるようにも読めてしまう
  if (item.slot === 'armor') {
    return a > 1.01 ? `被害 -${Math.round((1 - 1 / a) * 100)}%` : '耐性なし';
  }
  if (a >= 1.45) return `弱点 ${n}`;
  if (a > 1.01) return `相性 ${n}`;
  if (a <= 0.55) return `耐性 ${n}`;
  if (a < 0.99) return `不利 ${n}`;
  return '等倍';
}

export const AFFINITY_TONE: Record<AffinityKind, string> = {
  weak: 'up', resist: 'down', even: 'faint', guard: 'def'
};
