import type { Element } from '../sim/types';

// 敵の名札（仕様書 §6.2）。
//
// 以前はここに v1（OUTFITTER）のイベント表をそのまま流用していた。
// あの表は「暗い横穴」「崩れた石橋」「縦穴」「崩落」のような**場所や事故**の
// 名前で、プレイヤーが選択肢を選ぶための札だった。DELVERS では同じ札を
// そのまま敵の名前に使っていたため、レポートに「縦穴に倒れた」「崩落の群れ」
// といった日本語が出ていた。倒す相手の名前が要るので、敵として書き直す。
//
// 戦闘の数値はステージ側（TUNING と enemyScale）が決めるので、ここは
// 「どのステージ帯に、何が出るか」だけを持つ。

export interface EnemyDef {
  id: string;
  name: string;
  /** 出現するステージ帯（§7.1 の番号） */
  minStage: number;
  maxStage: number;
  /** 見た目の属性。数値には影響せず、名札の説得力のためだけに使う */
  flavor: Element;
  /** 描画用アイコンキー */
  icon: string;
}

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'M1', name: '坑道ネズミ', minStage: 1, maxStage: 2, flavor: 'physical', icon: 'goblin' },
  { id: 'M2', name: 'ゴブリン', minStage: 1, maxStage: 3, flavor: 'physical', icon: 'goblin' },
  { id: 'M3', name: '苔まみれの屍', minStage: 2, maxStage: 4, flavor: 'poison', icon: 'corpse' },
  { id: 'M4', name: '毒胞子のキノコ', minStage: 2, maxStage: 4, flavor: 'poison', icon: 'swamp' },
  { id: 'M5', name: '灼熱のコウモリ', minStage: 3, maxStage: 5, flavor: 'fire', icon: 'dragon' },
  { id: 'M6', name: '燃える石像', minStage: 3, maxStage: 6, flavor: 'fire', icon: 'golem' },
  { id: 'M7', name: '氷牙のオオカミ', minStage: 4, maxStage: 6, flavor: 'ice', icon: 'goblin' },
  { id: 'M8', name: '凍える亡霊', minStage: 4, maxStage: 7, flavor: 'ice', icon: 'corpse' },
  { id: 'M9', name: '雷を纏う蟲', minStage: 5, maxStage: 7, flavor: 'lightning', icon: 'swamp' },
  { id: 'M10', name: '帯電した石塊', minStage: 5, maxStage: 8, flavor: 'lightning', icon: 'golem' },
  { id: 'M11', name: '腐肉喰らい', minStage: 6, maxStage: 8, flavor: 'poison', icon: 'corpse' },
  { id: 'M12', name: '溶岩のトカゲ', minStage: 7, maxStage: 9, flavor: 'fire', icon: 'dragon' },
  { id: 'M13', name: '骸の剣士', minStage: 8, maxStage: 10, flavor: 'physical', icon: 'knight' },
  { id: 'M14', name: '鎧の亡骸', minStage: 8, maxStage: 10, flavor: 'physical', icon: 'knight' },
  { id: 'M15', name: '祭壇の守り手', minStage: 9, maxStage: 10, flavor: 'lightning', icon: 'guardian' },
  { id: 'M16', name: '深淵の影', minStage: 10, maxStage: 10, flavor: 'ice', icon: 'guardian' }
] as const;

/** そのステージに出る敵。帯から漏れたら近いものを返す（必ず1件は返す）。 */
export function enemiesForStage(stageId: number): readonly EnemyDef[] {
  const hit = ENEMIES.filter(e => stageId >= e.minStage && stageId <= e.maxStage);
  return hit.length > 0 ? hit : ENEMIES;
}
