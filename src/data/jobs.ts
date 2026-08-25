import type { JobDef, JobId, RetreatRule, RetreatRuleDef } from '../sim/types';

// 冒険者は成長せず、死亡しても失われない（仕様書 §4.2）。
// 職業は固定の器であり、レベルもステータス成長も持たない。

export const JOBS: readonly JobDef[] = [
  {
    id: 'swordsman', name: '剣士',
    hp: 100,
    armorRestriction: [],
    damageTakenMul: 1.0,
    timeMul: 1.0,
    evasion: 0,
    bonusDrops: 0,
    desc: '基準値。補正なし。あらゆる防具を装備できる'
  },
  {
    id: 'guardian', name: '重装兵',
    hp: 140,
    armorRestriction: ['heavy'],
    damageTakenMul: 0.8,
    timeMul: 1.15,
    evasion: 0,
    bonusDrops: 0,
    desc: '重防具のみ。被ダメージ -20%／所要時間 +15%'
  },
  {
    id: 'skirmisher', name: '遊撃兵',
    hp: 70,
    armorRestriction: ['light'],
    damageTakenMul: 1.0,
    timeMul: 0.8,
    evasion: 0.15,
    bonusDrops: 1,
    desc: '軽防具のみ。回避 +15%／所要時間 -20%／ドロップ +1'
  }
] as const;

const byId = new Map(JOBS.map(j => [j.id, j]));

export function jobDef(id: JobId): JobDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown job: ${id}`);
  return def;
}

/** その職がその防具ベースを装備できるか（§4.2）。 */
export function canEquipArmor(job: JobDef, armorTags: readonly string[]): boolean {
  if (job.armorRestriction.length === 0) return true;
  return job.armorRestriction.some(t => armorTags.includes(t));
}

// 撤退ルール（§4.3）。撤退成功時、その時点までの戦利品は全て持ち帰る。
export const RETREAT_RULES: readonly RetreatRuleDef[] = [
  {
    id: 'reckless', name: '深追い', threshold: 0,
    desc: 'HP0まで戦う。最深到達だが死亡リスク最大'
  },
  {
    id: 'standard', name: '標準', threshold: 0.3,
    desc: 'HP30%を切った時点で帰還'
  },
  {
    id: 'cautious', name: '慎重', threshold: 0.5,
    desc: 'HP50%を切った時点で帰還'
  }
] as const;

const ruleById = new Map(RETREAT_RULES.map(r => [r.id, r]));

export function retreatRuleDef(id: RetreatRule): RetreatRuleDef {
  const def = ruleById.get(id);
  if (!def) throw new Error(`unknown retreat rule: ${id}`);
  return def;
}

/** 派遣枠の解放条件（§4.2）。初期は剣士1人。 */
export const UNLOCK_STAGE_FOR_SLOT: readonly number[] = [0, 3, 6];
