import type { Element } from '../sim/types';

// 薬草園と錬金（新機能指示書）。
//
// 既存のコアループ（出撃→放置→帰還→鑑定）は変えない。
// ここは**出撃前の準備を厚くする**ための追加要素で、遊ばなくても先へ進める。
//
// 参考指示から採った3方針:
//   ・毎日の水やりのような反復作業は作らない（植えたら放っておけば育つ）
//   ・収穫物は腐らない・消えない（放置耐性）
//   ・調合は「絵作り」だけ借りる（工程を操作させない）
//
// **属性は既存の5種と1対1**にする。新しい軸を足すと、
// せっかく作った「派遣先との相性」（UI-SPEC §2）と噛み合わなくなる。

export interface HerbDef {
  id: string;
  name: string;
  /** どの属性に効く薬の材料になるか */
  element: Element;
  /** 育ちきるまでの秒数（実時間） */
  growSec: number;
  /** 収穫で採れる数 */
  yield: number;
  /** 種の購入価格 */
  seedCost: number;
  /** 3D と一覧で使う1文字 */
  glyph: string;
}

/**
 * 薬草5種。
 *
 * 育つ時間は 6〜14分。派遣（5分〜1時間）と同じ桁に置いて、
 * 「派遣を出してから畑を見に来る」が自然な間隔になるようにしてある。
 * 速いものほど採れる数が少なく、遅いものほど多い。
 */
export const HERBS: readonly HerbDef[] = [
  { id: 'ironleaf', name: '鉄草', element: 'physical', growSec: 6 * 60, yield: 2, seedCost: 40, glyph: '鉄' },
  { id: 'embermoss', name: '火苔', element: 'fire', growSec: 8 * 60, yield: 2, seedCost: 60, glyph: '火' },
  { id: 'venomcap', name: '毒茸', element: 'poison', growSec: 9 * 60, yield: 3, seedCost: 70, glyph: '毒' },
  { id: 'frostbloom', name: '氷花', element: 'ice', growSec: 11 * 60, yield: 3, seedCost: 90, glyph: '氷' },
  { id: 'stormroot', name: '雷根', element: 'lightning', growSec: 14 * 60, yield: 4, seedCost: 120, glyph: '雷' }
] as const;

const herbById = new Map(HERBS.map(h => [h.id, h]));

export function herbDef(id: string): HerbDef {
  const h = herbById.get(id);
  if (!h) throw new Error(`unknown herb: ${id}`);
  return h;
}

export function herbForElement(e: Element): HerbDef {
  return HERBS.find(h => h.element === e) ?? HERBS[0] as HerbDef;
}

// ---------------------------------------------------------------- 薬

export interface PotionDef {
  id: string;
  name: string;
  /** どの属性の攻撃を和らげるか */
  element: Element;
  /** 被ダメージの軽減率（0〜1） */
  resist: number;
  /** 主材料。これを2つ使う */
  main: string;
  /** 主材料以外の薬草を、この数だけ使う（何でもよい） */
  other: number;
  text: string;
}

/**
 * 薬5種。**それぞれ「特定の属性の被害を減らす」だけ。**
 *
 * 攻撃を上げる薬は作らない。上げる薬があると「毎回それを持つ」が
 * 正解になって選択が消える——守りの薬なら、派遣先に応じて
 * 持ち替える理由が生まれる（既存の装備相性と同じ形）。
 *
 * 主材料2つ＋別の薬草1つ、という形は「1種類だけ育てても作れない」ため。
 * 畑を1色に染めると詰むので、自然に品種を混ぜることになる。
 */
export const POTIONS: readonly PotionDef[] = [
  { id: 'ironblood', name: '鉄血の丸薬', element: 'physical', resist: 0.28,
    main: 'ironleaf', other: 1, text: '物理の被害を 28% 減らす' },
  { id: 'fireoil', name: '耐炎油', element: 'fire', resist: 0.32,
    main: 'embermoss', other: 1, text: '炎の被害を 32% 減らす' },
  { id: 'antidote', name: '解毒剤', element: 'poison', resist: 0.32,
    main: 'venomcap', other: 1, text: '毒の被害を 32% 減らす' },
  { id: 'frostsalve', name: '氷耐性軟膏', element: 'ice', resist: 0.34,
    main: 'frostbloom', other: 1, text: '氷の被害を 34% 減らす' },
  { id: 'stormward', name: '雷避けの札', element: 'lightning', resist: 0.36,
    main: 'stormroot', other: 1, text: '雷の被害を 36% 減らす' }
] as const;

const potionById = new Map(POTIONS.map(p => [p.id, p]));

export function potionDef(id: string): PotionDef {
  const p = potionById.get(id);
  if (!p) throw new Error(`unknown potion: ${id}`);
  return p;
}

export function potionForElement(e: Element): PotionDef | null {
  return POTIONS.find(p => p.element === e) ?? null;
}

// ---------------------------------------------------------------- 畑

/** 初期の畑数と上限（指示書：初期2枠、最大6枠） */
export const PLOTS_INITIAL = 2;
export const PLOTS_MAX = 6;

/**
 * n 枠目を開くのに要る金。
 *
 * 派遣枠の解放（§7.5）より安く置く。畑は本筋ではないので、
 * 冒険者を増やす金と取り合いになると、こちらを開く人がいなくなる。
 */
export function plotCost(nth: number): number {
  const table = [0, 0, 400, 1200, 3000, 7000];
  return table[nth] ?? 7000;
}
