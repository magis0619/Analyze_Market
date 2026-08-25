import type { BaseTypeDef, Slot } from '../sim/types';

// L0 ベースタイプ（仕様書 §5.2）。
//
// 設計: **揃えているのは素の DPS ではなく、実測の到達深度。**
//
// 以前は「攻撃力 × 攻撃速度」が全ベースで同値（≒63 @itemPower100）になるよう
// 組んでいた。しかしシミュレーションが報いるのは素の DPS ではなく実効 DPS で、
// 両者は一致しない。敵1体のHPに対して一撃が大きすぎれば超過分は死体に吸われ、
// 一撃が敵HPのわずかに下に着地すれば必要打数が倍になる。結果、DPS が揃っていても
// 到達深度は 39%〜50% の幅で開き、片手剣（＝§5.3 が基準として数値を固定している
// ベース、初期装備でもある）が10ステージ中6で最下位に固定されていた。
// 一度は両手剣が同じ位置にいて、薙ぎ払いを入れて直したつもりが、
// 問題が片手剣へ横滑りしただけだった。
//
// そこで invariant を「素の DPS」から「実測の到達深度」に変えた。
// 片手剣の数値を固定したまま他のベースの mul を較正し、**実際にドロップする
// 装備（アフィックス込み）** での10ステージ×90回の実測で、全6ベースが
// 54.0〜55.2% に収まるようにしてある。素のベースだけで較正すると、
// アフィックスが乗った実プレイでは再びずれる（実際、素のベースで揃えた版は
// 両手剣が10ステージ中8で1位だった）。揃えるべきは手にする品のほうである。
// この結果、素の DPS は 54.6〜63.0 とばらつくが、それでよい。
// **プレイヤーが体験するのは DPS ではなく到達深度である。**
//
// ベースの個性は数値ではなく、以下の仕組みで付ける（§5.1）:
//   heavy    … 薙ぎ払い。倒しきって余った分が次の敵へ流れる（群れに強い）
//   balanced … 敵防御の35%を無視する
//   fast/crit… 高い会心率
//   caster   … 属性アフィックスの池が広い
// mul を触ったら必ず較正をやり直すこと。片方だけ動かすと必ずどれかが底に落ちる。
//
// 片手剣の数値は §5.3 の表（itemPower100 で 攻撃力45〜55／速度1.20〜1.32／会心5.0〜7.0%）に
// 厳密に一致させてある。他のベースはそこから DPS 等価になるよう導出した。

export const BASE_TYPES: readonly BaseTypeDef[] = [
  // --- 武器 6種 ---
  {
    id: 'dagger', name: '短剣', slot: 'weapon',
    mul: 0.265, speed: 2.10, critMin: 9.0, critMax: 13.0,
    tags: ['fast', 'crit', 'physical']
  },
  {
    id: 'sword', name: '片手剣', slot: 'weapon',
    mul: 0.50, speed: 1.26, critMin: 5.0, critMax: 7.0,
    tags: ['balanced', 'crit', 'physical']
  },
  {
    id: 'greatsword', name: '両手剣', slot: 'weapon',
    mul: 0.850, speed: 0.66, critMin: 4.0, critMax: 6.0,
    tags: ['slow', 'heavy', 'physical']
  },
  {
    id: 'spear', name: '槍', slot: 'weapon',
    mul: 0.552, speed: 1.02, critMin: 5.0, critMax: 7.0,
    tags: ['balanced', 'reach', 'physical']
  },
  {
    id: 'bow', name: '弓', slot: 'weapon',
    mul: 0.423, speed: 1.50, critMin: 7.0, critMax: 9.0,
    tags: ['fast', 'crit', 'ranged']
  },
  {
    id: 'staff', name: '杖', slot: 'weapon',
    mul: 0.547, speed: 1.14, critMin: 4.0, critMax: 6.0,
    tags: ['caster', 'elemental']
  },
  // --- 防具 3種 ---
  {
    id: 'light', name: '軽鎧', slot: 'armor',
    mul: 0.40, speed: 0, critMin: 0, critMax: 0,
    tags: ['light', 'evasive']
  },
  {
    id: 'medium', name: '中鎧', slot: 'armor',
    mul: 0.52, speed: 0, critMin: 0, critMax: 0,
    tags: ['medium', 'balanced']
  },
  {
    id: 'heavy', name: '重鎧', slot: 'armor',
    mul: 0.66, speed: 0, critMin: 0, critMax: 0,
    tags: ['heavy', 'sturdy']
  }
] as const;

const byId = new Map(BASE_TYPES.map(b => [b.id, b]));

export function baseDef(id: string): BaseTypeDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown base type: ${id}`);
  return def;
}

export function basesForSlot(slot: Slot): BaseTypeDef[] {
  return BASE_TYPES.filter(b => b.slot === slot);
}
