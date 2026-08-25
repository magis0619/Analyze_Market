import type { BaseTypeDef, Slot } from '../sim/types';

// L0 ベースタイプ（仕様書 §5.2）。
//
// 設計: どのベースも「攻撃力 × 攻撃速度」の素の DPS がほぼ同値（≒63 @itemPower100）に
// なるよう mul と speed を組んである。§5.1「総ダメージ量は狭くしか揺らさず、
// 配分と効果を大きく揺らす」に従い、差は会心率・引けるアフィックス池・
// そして「1撃の大きさ vs 手数」が敵防御に対して持つ意味で付ける。
// （ダメージ式が `攻撃力 - 敵防御` なので、手数型は敵防御に弱く、
//   大振り型は敵防御に強い。これが自動的なトレードオフになる）
//
// ただし「素の DPS が同値」だけでは大振り型は必ず負ける。敵1体のHPに対して
// 一撃が大きすぎると、超過分がそのまま死体に吸われて捨てられるからだ。
// 実測でも両手剣は全ステージ最下位だった（ステージ4で踏破率49.9%、
// 首位の短剣は72.5%）。そこで heavy タグの武器だけは超過ダメージを
// 次の敵へ繰り越す（sim/combat.ts の薙ぎ払い）。これで大振り型は
// 「1体ずつなら普通、群れには滅法強い」という取り柄を持つようになる。
//
// 片手剣の数値は §5.3 の表（itemPower100 で 攻撃力45〜55／速度1.20〜1.32／会心5.0〜7.0%）に
// 厳密に一致させてある。他のベースはそこから DPS 等価になるよう導出した。

export const BASE_TYPES: readonly BaseTypeDef[] = [
  // --- 武器 6種 ---
  {
    id: 'dagger', name: '短剣', slot: 'weapon',
    mul: 0.30, speed: 2.10, critMin: 9.0, critMax: 13.0,
    tags: ['fast', 'crit', 'physical']
  },
  {
    id: 'sword', name: '片手剣', slot: 'weapon',
    mul: 0.50, speed: 1.26, critMin: 5.0, critMax: 7.0,
    tags: ['balanced', 'crit', 'physical']
  },
  {
    id: 'greatsword', name: '両手剣', slot: 'weapon',
    mul: 0.95, speed: 0.66, critMin: 4.0, critMax: 6.0,
    tags: ['slow', 'heavy', 'physical']
  },
  {
    id: 'spear', name: '槍', slot: 'weapon',
    mul: 0.62, speed: 1.02, critMin: 5.0, critMax: 7.0,
    tags: ['balanced', 'reach', 'physical']
  },
  {
    id: 'bow', name: '弓', slot: 'weapon',
    mul: 0.42, speed: 1.50, critMin: 7.0, critMax: 9.0,
    tags: ['fast', 'crit', 'ranged']
  },
  {
    id: 'staff', name: '杖', slot: 'weapon',
    mul: 0.55, speed: 1.14, critMin: 4.0, critMax: 6.0,
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
