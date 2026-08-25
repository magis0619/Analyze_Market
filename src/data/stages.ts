import type { StageDef } from '../sim/types';

// ステージ構成（仕様書 §7.1）。全10。各ステージ末にボスを配置する。
// クリア後も再挑戦可能。ステージ10クリアで難易度+1、全ステージ再解放（無限ティア）。
//
// 敵属性は「その敵が纏う属性」＝プレイヤーが受けるダメージの属性。
// 弱点属性はその属性で殴ると1.5倍、耐性属性は0.5倍（§6.3）。
// §6.4 に従い、これらは出撃前のステージ選択画面で必ず明示すること。

export const STAGES: readonly StageDef[] = [
  {
    id: 1, name: '廃坑', minutes: 5,
    enemyElement: 'physical', weakTo: null, resists: [],
    encounters: 9, dropBias: 'weapon', rarityBonus: 1.0, unlockCost: 0
  },
  {
    id: 2, name: '苔の回廊', minutes: 10,
    enemyElement: 'poison', weakTo: 'fire', resists: ['poison'],
    encounters: 10, dropBias: 'armor', rarityBonus: 1.05, unlockCost: 120
  },
  {
    id: 3, name: '灼熱坑', minutes: 20,
    enemyElement: 'fire', weakTo: 'lightning', resists: ['fire'],
    encounters: 11, dropBias: 'weapon', rarityBonus: 1.1, unlockCost: 320
  },
  {
    id: 4, name: '氷結層', minutes: 40,
    enemyElement: 'ice', weakTo: 'fire', resists: ['ice'],
    encounters: 12, dropBias: 'even', rarityBonus: 1.15, unlockCost: 700
  },
  {
    id: 5, name: '雷鳴洞', minutes: 60,
    enemyElement: 'lightning', weakTo: 'poison', resists: ['lightning'],
    encounters: 13, dropBias: 'weapon', rarityBonus: 1.2, unlockCost: 1300
  },
  {
    id: 6, name: '腐界', minutes: 90,
    enemyElement: 'poison', weakTo: 'fire', resists: ['poison', 'physical'],
    encounters: 14, dropBias: 'armor', rarityBonus: 1.28, unlockCost: 2400
  },
  {
    id: 7, name: '溶岩回廊', minutes: 120,
    enemyElement: 'fire', weakTo: 'ice', resists: ['fire'],
    encounters: 15, dropBias: 'even', rarityBonus: 1.36, unlockCost: 4200
  },
  {
    id: 8, name: '骸の間', minutes: 180,
    enemyElement: 'physical', weakTo: 'lightning', resists: ['physical', 'poison'],
    encounters: 16, dropBias: 'weapon', rarityBonus: 1.45, unlockCost: 7000
  },
  {
    id: 9, name: '深層祭壇', minutes: 300,
    enemyElement: 'mixed', weakTo: null, resists: ['fire', 'ice'],
    encounters: 17, dropBias: 'even', rarityBonus: 1.7, unlockCost: 12000
  },
  {
    id: 10, name: '深淵', minutes: 480,
    enemyElement: 'mixed', weakTo: null, resists: ['fire', 'ice', 'lightning'],
    encounters: 18, dropBias: 'even', rarityBonus: 2.0, unlockCost: 20000
  }
] as const;

const byId = new Map(STAGES.map(s => [s.id, s]));

export function stageDef(id: number): StageDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown stage: ${id}`);
  return def;
}

/** 難易度ティアを含めた敵の強さ倍率。ステージ10クリアで難易度+1（§7.1）。 */
export function difficultyMul(tier: number): number {
  return Math.pow(2.2, tier - 1);
}

/** そのステージで出るアイテムの itemPower（§5.9 の上限999は生成側でクランプ）。 */
export function itemPowerFor(stageId: number, tier: number): number {
  return Math.round((80 + stageId * 24) * Math.pow(1.35, tier - 1));
}

/** ボス名。 */
export function bossName(stageId: number): string {
  const names: Record<number, string> = {
    1: '坑道の主', 2: '苔喰らい', 3: '灼熱の炉番', 4: '氷牙', 5: '雷鳴の主',
    6: '腐肉の女王', 7: '溶岩喰い', 8: '骸の王', 9: '祭壇の守護者', 10: '深淵の目'
  };
  return names[stageId] ?? '深き者';
}
