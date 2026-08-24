import { DUNGEON_EVENTS } from '../data/events';
import { isLightOutfit, isOverweight } from '../data/equipment';
import type { AdvSnapshot } from '../sim/types';

// 見送りフェーズの天秤（成功見込みの暗示）。
// 数値は出さない。未来のシミュレーション結果を覗かず、
// 「装備がどれだけの場面で選択肢を開き得るか」だけから傾きを決める。

/** -2（不安）〜 +2（期待） */
export function estimateTilt(adv: AdvSnapshot, equipment: string[]): number {
  let opened = 0;
  const light = isLightOutfit(equipment, adv.level);
  for (const ev of DUNGEON_EVENTS) {
    for (const opt of ev.options) {
      const req = opt.requires;
      if (!req) continue;
      let ok = true;
      if (req.items) ok = req.items.every(id => equipment.includes(id));
      if (ok && req.anyOf) ok = req.anyOf.some(id => equipment.includes(id));
      if (ok && req.favoredWeapon) ok = equipment.includes(adv.favoredWeapon);
      if (ok && req.light) ok = light;
      if (ok) { opened++; break; }
    }
  }
  let score = opened; // 0..15
  const hasWeapon = equipment.some(id => id.startsWith('W'));
  const hasArmor = equipment.some(id => id.startsWith('A'));
  if (isOverweight(equipment, adv.level)) score -= 2;
  if (adv.personality === 'hasty' && !hasWeapon) score -= 2;
  if (adv.personality === 'timid' && equipment.includes('T4')) score += 1;
  // 深い依頼ほど身を守る備えがないと不安が勝つ
  if (adv.questDepth >= 7 && !hasArmor && !hasWeapon) score -= 2;
  if (adv.questDepth >= 9 && !equipment.includes('T4') && !hasArmor) score -= 1;
  if (equipment.includes(adv.favoredWeapon)) score += 1;
  if (score <= 0) return -2;
  if (score <= 2) return -1;
  if (score <= 4) return 0;
  if (score <= 6) return 1;
  return 2;
}
