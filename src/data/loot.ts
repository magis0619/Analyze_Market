export interface LootDef {
  id: string;
  name: string;
  rare: boolean;
  /** 出現する深度帯 */
  minDepth: number;
  maxDepth: number;
  /** 図鑑の一言 */
  note: string;
}

export const LOOT: readonly LootDef[] = [
  { id: 'L1',  name: '銅鉱石',     rare: false, minDepth: 1,  maxDepth: 4,  note: '浅層でよく採れる。鍋になる' },
  { id: 'L2',  name: '洞窟茸',     rare: false, minDepth: 1,  maxDepth: 4,  note: '暗がりで育つ。意外と美味い' },
  { id: 'L3',  name: 'ゴブリンの牙', rare: false, minDepth: 1, maxDepth: 4,  note: '魔除けとして売れる' },
  { id: 'L4',  name: '鉄鉱石',     rare: false, minDepth: 3,  maxDepth: 7,  note: '中層の主産物。武具の素' },
  { id: 'L5',  name: '夜光苔',     rare: false, minDepth: 3,  maxDepth: 7,  note: '淡く光る。灯り要らず' },
  { id: 'L6',  name: '古い懐中時計', rare: false, minDepth: 4, maxDepth: 8,  note: '止まったまま。誰の物か' },
  { id: 'L7',  name: '銀鉱石',     rare: false, minDepth: 6,  maxDepth: 10, note: '深層の輝き。細剣の素' },
  { id: 'L8',  name: '騎士の紋章', rare: false, minDepth: 8,  maxDepth: 12, note: '朽ちた鎧に残っていた' },
  { id: 'L9',  name: '竜の鱗',     rare: true,  minDepth: 9,  maxDepth: 12, note: '眠る竜の傍で拾った一枚' },
  { id: 'L10', name: '深淵の結晶', rare: true,  minDepth: 10, maxDepth: 12, note: '深部の鉱脈だけが育てる石' },
  { id: 'L11', name: '番人の核',   rare: true,  minDepth: 12, maxDepth: 99, note: '最深部の番人が守っていた' }
] as const;

const byId = new Map(LOOT.map(l => [l.id, l]));

export function lootDef(id: string): LootDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown loot: ${id}`);
  return def;
}
