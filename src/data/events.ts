import type { DungeonEventDef } from '../sim/types';

// イベント15種 × 装備の対応表（仕様 §3.7）。
// どの装備も「全ての場面で強い」ことがないよう配分されている。
// このバランスを崩す変更を勝手に行わないこと。
export const DUNGEON_EVENTS: readonly DungeonEventDef[] = [
  {
    id: 'E1', name: '暗い横穴', minDepth: 1, maxDepth: 3, icon: 'cave',
    options: [
      { id: 'pass', label: '素通りする', safe: true, effects: {}, logLine: '横穴を素通りした' },
      { id: 'explore', label: '探索する', requires: { items: ['T1'] },
        effects: { loot: 1 }, logLine: 'ランタンで横穴を照らし、獲物を見つけた' }
    ]
  },
  {
    id: 'E2', name: 'ゴブリンの群れ', minDepth: 1, maxDepth: 3, icon: 'goblin',
    options: [
      { id: 'fight', label: '戦う', safe: true, effects: { dmg: 'fight' }, logLine: 'ゴブリンと斬り結んだ' },
      { id: 'flee', label: '逃げる', flee: true, effects: { time: -5 }, logLine: 'ゴブリンから逃げ、道を戻った' },
      { id: 'sweep', label: '薙ぎ払う', requires: { items: ['W3'] },
        effects: { dmg: 'none' }, logLine: '大槌の一振りで群れを薙ぎ払った' }
    ]
  },
  {
    id: 'E3', name: '崩れた石橋', minDepth: 2, maxDepth: 4, icon: 'bridge',
    options: [
      { id: 'back', label: '引き返す', safe: true, effects: { time: -6 }, logLine: '石橋を諦めて引き返した' },
      { id: 'dash', label: '駆け抜ける', requires: { light: true },
        effects: { depth: 1, time: 4 }, logLine: '軽装で石橋を駆け抜けた' }
    ]
  },
  {
    id: 'E4', name: '露出した鉱脈', minDepth: 2, maxDepth: 4, icon: 'vein', vein: true,
    options: [
      { id: 'pass', label: '通過する', safe: true, effects: {}, logLine: '鉱脈を横目に通過した' },
      { id: 'dig', label: '掘る', requires: { items: ['T2'] },
        effects: { loot: 1, time: -8 }, logLine: 'つるはしで鉱脈を掘った' }
    ]
  },
  {
    id: 'E5', name: '行商人の亡骸', minDepth: 3, maxDepth: 5, icon: 'corpse',
    options: [
      { id: 'coin', label: '所持金を得る', safe: true, effects: { gold: true }, logLine: '亡骸から硬貨を拾った' },
      { id: 'open', label: '荷を開ける', requires: { items: ['W2'] },
        effects: { toolGain: true }, logLine: '短刀で荷紐を切り、道具を得た' }
    ]
  },
  {
    id: 'E6', name: '縦穴', minDepth: 4, maxDepth: 6, icon: 'pit',
    options: [
      { id: 'detour', label: '迂回する', safe: true, effects: { time: -10 }, logLine: '縦穴を大きく迂回した' },
      { id: 'descend', label: '一気に降りる', requires: { items: ['T3'] },
        effects: { depth: 2 }, logLine: '縄梯子で縦穴を一気に降りた' }
    ]
  },
  {
    id: 'E7', name: '石の門番', minDepth: 4, maxDepth: 6, icon: 'golem',
    options: [
      { id: 'fight', label: '戦う', safe: true, effects: { dmg: 'fight' }, logLine: '石の門番と打ち合った' },
      { id: 'flee', label: '逃げる', flee: true, effects: { time: -5 }, logLine: '門番から逃げ延びた' },
      { id: 'pierce', label: '急所を突く', requires: { items: ['W4'] },
        effects: { dmg: 'none' }, logLine: '細剣が石の継ぎ目を貫いた' }
    ]
  },
  {
    id: 'E8', name: '毒の沼', minDepth: 5, maxDepth: 7, icon: 'swamp',
    options: [
      { id: 'detour', label: '迂回する', safe: true, effects: { time: -10 }, logLine: '毒の沼を迂回した' },
      { id: 'push', label: '強行突破する', requires: { items: ['A1'] },
        effects: { depth: 1, dmg: 'small' }, logLine: '鉄鎧で毒沼を強行突破した' }
    ]
  },
  {
    id: 'E9', name: '宝箱の罠', minDepth: 5, maxDepth: 7, icon: 'chest',
    options: [
      { id: 'giveup', label: '諦める', safe: true, effects: {}, logLine: '罠を警戒し宝箱を諦めた' },
      { id: 'disarm', label: '解除する', requires: { items: ['W2'] },
        effects: { loot: 2 }, logLine: '短刀の先で罠を外した' }
    ]
  },
  {
    id: 'E10', name: '地下水脈', minDepth: 6, maxDepth: 8, icon: 'water',
    options: [
      { id: 'back', label: '引き返す', safe: true, effects: { time: -6 }, logLine: '水脈を前に引き返した' },
      { id: 'swim', label: '泳いで渡る', requires: { items: ['T1'], anyOf: ['A2', 'A4'] },
        effects: { depth: 2 }, logLine: '灯りを掲げ、軽装で水脈を泳ぎ切った' }
    ]
  },
  {
    id: 'E11', name: '鎧の騎士', minDepth: 8, maxDepth: 10, icon: 'knight',
    options: [
      { id: 'fight', label: '戦う', safe: true, effects: { dmg: 'fight' }, logLine: '鎧の騎士と剣を交えた' },
      { id: 'flee', label: '逃げる', flee: true, effects: { time: -5 }, logLine: '騎士の間合いから逃れた' },
      { id: 'parry', label: '受け流す', requires: { items: ['A3'] },
        effects: { dmg: 'none' }, logLine: '木の盾が騎士の剣を受け流した' }
    ]
  },
  {
    id: 'E12', name: '崩落', minDepth: 8, maxDepth: 10, icon: 'collapse',
    options: [
      { id: 'hit', label: '被弾する', safe: true, effects: { dmg: 'large' }, logLine: '崩落に巻き込まれた' },
      { id: 'evade', label: '退避する', requires: { items: ['T3'] },
        effects: { dmg: 'none' }, logLine: '縄梯子で岩棚へ退避した' }
    ]
  },
  {
    id: 'E13', name: '竜の眠り場', minDepth: 9, maxDepth: 11, icon: 'dragon',
    options: [
      { id: 'back', label: '引き返す', safe: true, effects: { time: -6 }, logLine: '竜を起こさぬよう引き返した' },
      { id: 'sneak', label: '忍び足で進む', requires: { items: ['A4'], light: true },
        effects: { depth: 3, loot: 2 }, logLine: 'マントに身を包み、竜の傍らを抜けた' }
    ]
  },
  {
    id: 'E14', name: '深部の鉱脈', minDepth: 10, maxDepth: 12, icon: 'deepvein', vein: true,
    options: [
      { id: 'pass', label: '通過する', safe: true, effects: {}, logLine: '深部の鉱脈を通過した' },
      { id: 'strike', label: '掘り当てる', requires: { items: ['T2', 'T1'] },
        effects: { rareLoot: true, time: -8 }, logLine: '灯りの下、つるはしがレア鉱石を掘り当てた' }
    ]
  },
  {
    id: 'E15', name: '最深部の番人', minDepth: 12, maxDepth: 99, icon: 'guardian',
    options: [
      { id: 'flee', label: '逃げる', safe: true, flee: true, effects: { endRun: true },
        logLine: '番人に背を向け、地上へ引き返した' },
      { id: 'slay', label: '撃破する', requires: { favoredWeapon: true },
        effects: { rareLoot: true, dmg: 'small', endRun: true },
        logLine: '相性の合う得物が番人を打ち砕いた' }
    ]
  }
] as const;

const byId = new Map(DUNGEON_EVENTS.map(e => [e.id, e]));

export function eventDef(id: string): DungeonEventDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown event: ${id}`);
  return def;
}
