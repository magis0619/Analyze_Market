import type { EquipmentDef } from '../sim/types';

// 装備12種（仕様 §3.6）。バランスを崩す追加・変更は禁止。
export const EQUIPMENT: readonly EquipmentDef[] = [
  { id: 'W1', name: '鉄の剣',   kind: 'weapon', weight: 2, note: '汎用' },
  { id: 'W2', name: '短刀',     kind: 'weapon', weight: 1, note: '罠解除に使える' },
  { id: 'W3', name: '大槌',     kind: 'weapon', weight: 3, note: '複数敵に有効' },
  { id: 'W4', name: '銀の細剣', kind: 'weapon', weight: 1, note: '特定の敵に特効' },
  { id: 'A1', name: '鉄鎧',     kind: 'armor',  weight: 3, note: '毒・物理に強い' },
  { id: 'A2', name: '革鎧',     kind: 'armor',  weight: 1, lightArmor: true, note: '軽装扱い' },
  { id: 'A3', name: '木の盾',   kind: 'armor',  weight: 2, note: '受け流し' },
  { id: 'A4', name: 'マント',   kind: 'armor',  weight: 1, lightArmor: true, note: '軽装扱い・隠密' },
  { id: 'T1', name: 'ランタン', kind: 'tool',   weight: 1, note: '暗所の探索' },
  { id: 'T2', name: 'つるはし', kind: 'tool',   weight: 2, note: '採掘' },
  { id: 'T3', name: '縄梯子',   kind: 'tool',   weight: 2, note: '縦穴・退避' },
  { id: 'T4', name: '傷薬',     kind: 'tool',   weight: 1, note: '1回だけ回復' }
] as const;

const byId = new Map(EQUIPMENT.map(e => [e.id, e]));

export function equipDef(id: string): EquipmentDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown equipment: ${id}`);
  return def;
}

/** 重量上限。超えると「重装」判定（軽装専用の選択肢が開かない）。 */
export function weightLimit(level: number): number {
  return 4 + Math.ceil(level / 2);
}

export function totalWeight(equipIds: readonly string[]): number {
  return equipIds.reduce((sum, id) => sum + equipDef(id).weight, 0);
}

export function isOverweight(equipIds: readonly string[], level: number): boolean {
  return totalWeight(equipIds) > weightLimit(level);
}

/** 軽装 = 重装でなく、装着中の防具がすべて軽装扱い（A2/A4）で、防具を1つ以上持つ。 */
export function isLightOutfit(equipIds: readonly string[], level: number): boolean {
  if (isOverweight(equipIds, level)) return false;
  const armors = equipIds.filter(id => equipDef(id).kind === 'armor');
  return armors.length > 0 && armors.every(id => equipDef(id).lightArmor === true);
}
