import type { PersonalityId } from '../sim/types';
import { Prng } from '../sim/prng';

// 系譜（世代）ごとの冒険者生成。常連1人を最大6ランまで追う（仕様 §3.5）。

const NAMES = ['カイ', 'ロッテ', 'ガルド', 'ミラ', 'ユーン', 'ベルタ', 'ドッド', 'セラ'] as const;
const JOBS = ['剣士', '坑夫あがり', '狩人', '傭兵くずれ'] as const;
const WEAPONS = ['W1', 'W2', 'W3', 'W4'] as const;
const PERSONALITY_IDS: readonly PersonalityId[] = ['timid', 'greedy', 'hasty'];

export interface RegularState {
  /** 系譜の通し番号（1始まり） */
  generation: number;
  name: string;
  job: string;
  personality: PersonalityId;
  favoredWeapon: string;
  level: number;
  gold: number;
  /** 次に挑むランの番号 1..6 */
  runIndex: number;
  /** 生還した到達深度の最大 */
  bestDepth: number;
}

/** ラン番号に応じた依頼（目標深度）。回を追うごとに深くなる。 */
export function questDepthFor(runIndex: number): number {
  const table = [4, 6, 7, 9, 10, 12] as const;
  return table[Math.min(runIndex, 6) - 1] ?? 12;
}

export function maxHpFor(level: number): number {
  return 10 + level * 2;
}

/** 世代番号と店シードから常連を決定論的に生成する。 */
export function createRegular(shopSeed: number, generation: number): RegularState {
  const rng = new Prng((shopSeed ^ (generation * 0x51ed2701)) >>> 0);
  return {
    generation,
    name: NAMES[rng.int(NAMES.length)] ?? 'カイ',
    job: JOBS[rng.int(JOBS.length)] ?? '剣士',
    personality: PERSONALITY_IDS[rng.int(PERSONALITY_IDS.length)] ?? 'timid',
    favoredWeapon: WEAPONS[rng.int(WEAPONS.length)] ?? 'W1',
    level: 1,
    gold: 20 + rng.int(30),
    runIndex: 1,
    bestDepth: 0
  };
}
