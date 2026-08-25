// 遭遇テーブル。v1（OUTFITTER）のイベント定義から「選択肢」構造を削除し、
// 名前・出現深度・アイコンだけを残したもの（仕様書 §1.2）。
// DELVERS ではプレイヤーが選択しないため、これは戦闘シミュレーションが
// 引く遭遇の名札としてのみ使う。

export interface EncounterDef {
  id: string;
  name: string;
  /** 出現する深度帯 */
  minDepth: number;
  maxDepth: number;
  /** 描画用アイコンキー */
  icon: string;
}

export const ENCOUNTERS: readonly EncounterDef[] = [
  { id: 'E1', name: '暗い横穴', minDepth: 1, maxDepth: 3, icon: 'cave' },
  { id: 'E2', name: 'ゴブリンの群れ', minDepth: 1, maxDepth: 3, icon: 'goblin' },
  { id: 'E3', name: '崩れた石橋', minDepth: 2, maxDepth: 4, icon: 'bridge' },
  { id: 'E4', name: '露出した鉱脈', minDepth: 2, maxDepth: 4, icon: 'vein' },
  { id: 'E5', name: '行商人の亡骸', minDepth: 3, maxDepth: 5, icon: 'corpse' },
  { id: 'E6', name: '縦穴', minDepth: 4, maxDepth: 6, icon: 'pit' },
  { id: 'E7', name: '石の門番', minDepth: 4, maxDepth: 6, icon: 'golem' },
  { id: 'E8', name: '毒の沼', minDepth: 5, maxDepth: 7, icon: 'swamp' },
  { id: 'E9', name: '宝箱の罠', minDepth: 5, maxDepth: 7, icon: 'chest' },
  { id: 'E10', name: '地下水脈', minDepth: 6, maxDepth: 8, icon: 'water' },
  { id: 'E11', name: '鎧の騎士', minDepth: 8, maxDepth: 10, icon: 'knight' },
  { id: 'E12', name: '崩落', minDepth: 8, maxDepth: 10, icon: 'collapse' },
  { id: 'E13', name: '竜の眠り場', minDepth: 9, maxDepth: 11, icon: 'dragon' },
  { id: 'E14', name: '深部の鉱脈', minDepth: 10, maxDepth: 12, icon: 'deepvein' },
  { id: 'E15', name: '最深部の番人', minDepth: 12, maxDepth: 99, icon: 'guardian' }
] as const;
