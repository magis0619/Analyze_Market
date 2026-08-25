// DELVERS の決定論シミュレーションで使う型。
// このモジュール（および src/sim/ 配下すべて）は Canvas / DOM を一切参照しない（C6）。

// ---------------------------------------------------------------- 属性
//
// 仕様書 §5.2 の L2 属性配分は「物理／炎／雷／毒」の4種と書かれているが、
// §7.1 のステージ表では 4「氷結層」の敵属性が氷、7「溶岩回廊」の有効属性が氷に
// なっている。プレイヤー側に氷がないと溶岩回廊だけ「有効属性で殴る」という
// 攻略の答えが存在しなくなるため、氷を5番目の属性として実装する。
// （§6.4「敵の属性傾向を明示せよ」＝プレイヤーが装備を選ぶ手がかり、という
// 設計意図を成立させるための判断。この逸脱は未達リストに記載する）
export type Element = 'physical' | 'fire' | 'lightning' | 'poison' | 'ice';

export const ELEMENTS: readonly Element[] = ['physical', 'fire', 'lightning', 'poison', 'ice'];

/** 属性ごとの配分（合計 1.0）。物理100%なら { physical: 1 }。 */
export type ElementSplit = Partial<Record<Element, number>>;

// ---------------------------------------------------------------- 装備
export type Slot = 'weapon' | 'armor';

export type Rarity = 'common' | 'fine' | 'rare' | 'relic';

export interface BaseTypeDef {
  id: string;
  name: string;
  slot: Slot;
  /** 武器：itemPower に対する攻撃力倍率／防具：防御力倍率 */
  mul: number;
  /** 武器のみ：基準攻撃速度（回/秒）。防具は 0 */
  speed: number;
  /** 武器のみ：会心率のレンジ(%) */
  critMin: number;
  critMax: number;
  /** アフィックス池のフィルタに使う（§5.8） */
  tags: readonly string[];
}

export type AffixKind =
  | 'attackPct'      // 攻撃力 +X%
  | 'critDmgPct'     // 会心ダメージ +X%
  | 'elementFlat'    // 属性ダメージ追加 +X
  | 'lowHpPct'       // HP50%以下で威力 +X%
  | 'comboSpeedPct'  // 連続ヒットで速度 +X%（最大5回）
  | 'defensePct'     // 防御 +X%
  | 'resistPct'      // 属性耐性 +X%
  | 'killHeal';      // 撃破時にHP回復 +X（固定値）

export interface AffixDef {
  kind: AffixKind;
  name: string;
  slot: Slot;
  min: number;
  max: number;
  /** 値が小数を持つか（表示用） */
  isPercent: boolean;
  /** このアフィックスを引けるベースタイプのタグ */
  tags: readonly string[];
  /** 属性を伴うアフィックスか */
  elemental?: boolean;
}

export interface Affix {
  kind: AffixKind;
  /** 内部の連続値。画面には出さない（§5.6） */
  value: number;
  /** 表示用の5段階ティア（1〜5） */
  tier: number;
  /** elementFlat / resistPct のときの対象属性 */
  element?: Element;
}

export type UniqueKind =
  | 'noCritFlatPower'   // 会心が発生しない。代わりに全攻撃の威力が常時上昇
  | 'slowTriple'        // 攻撃速度が半減し、1撃が3倍かつ範囲攻撃
  | 'killStack'         // 敵を倒すたびに攻撃力+1（そのステージ中のみ）
  | 'greedyGlass';      // ドロップ率+50%、被ダメージ+25%

export interface UniqueDef {
  kind: UniqueKind;
  name: string;
  /** ルールを書き換える1行（§5.2 L4） */
  text: string;
}

export interface Item {
  /** 保存・参照用の一意ID */
  id: string;
  baseId: string;
  slot: Slot;
  rarity: Rarity;
  /** 武器：攻撃力／防具：防御力。999で頭打ち（§5.9・C8） */
  power: number;
  /** 武器のみ：攻撃速度（回/秒） */
  speed: number;
  /** 武器のみ：会心率(%) */
  crit: number;
  element: ElementSplit;
  affixes: Affix[];
  unique: UniqueKind | null;
  /** 未鑑定（帰還直後）は true。開封すると false */
  identified: boolean;
  /** 生成元のステージ（図鑑の記録用 §7.4） */
  fromStage: number;
  /** インベントリのロック（一括売却から保護） */
  locked?: boolean;
}

// ---------------------------------------------------------------- 冒険者
export type JobId = 'swordsman' | 'guardian' | 'skirmisher';

export interface JobDef {
  id: JobId;
  name: string;
  hp: number;
  /** 装備できる防具タグ。空なら制限なし */
  armorRestriction: readonly string[];
  /** 被ダメージ倍率（0.8 なら -20%） */
  damageTakenMul: number;
  /** ステージ所要時間の倍率 */
  timeMul: number;
  /** 回避率(0〜1) */
  evasion: number;
  /** ドロップ数の加算 */
  bonusDrops: number;
  desc: string;
}

export type RetreatRule = 'reckless' | 'standard' | 'cautious';

export interface RetreatRuleDef {
  id: RetreatRule;
  name: string;
  /** この割合を下回ったら帰還。0 なら HP0 まで戦う */
  threshold: number;
  desc: string;
}

// ---------------------------------------------------------------- ステージ
export interface StageDef {
  id: number;
  name: string;
  /** 実時間（分） */
  minutes: number;
  /** 敵が纏う属性（被ダメージの属性） */
  enemyElement: Element | 'mixed';
  /** 弱点属性（この属性で殴ると1.5倍）。null なら弱点なし */
  weakTo: Element | null;
  /** 敵が耐性を持つ属性（0.5倍） */
  resists: readonly Element[];
  /** 遭遇数 */
  encounters: number;
  /** ドロップ傾向 */
  dropBias: 'weapon' | 'armor' | 'even';
  /** レア率の補正倍率 */
  rarityBonus: number;
  /** 解放費用（金） */
  unlockCost: number;
}

// ---------------------------------------------------------------- 戦闘結果
export type RunOutcome = 'retreat' | 'clear' | 'death';

export interface RunResult {
  outcome: RunOutcome;
  /** 到達した遭遇数 */
  depth: number;
  encountersTotal: number;
  bossDefeated: boolean;
  /** 未鑑定の戦利品（最大10個 §7.3） */
  loot: Item[];
  gold: number;
  /** 結果1行（§7.3） */
  headline: string;
  /** 見どころ3行（§7.3・最重要） */
  highlights: string[];
  /** 到達深度グラフ用の HP 推移（遭遇ごと、0〜1） */
  hpCurve: number[];
  /** 実時間（秒） */
  durationSec: number;
}

// ---------------------------------------------------------------- 派遣
export interface Dispatch {
  /** 派遣ごとの一意ID */
  id: string;
  jobId: JobId;
  stageId: number;
  weaponId: string;
  armorId: string;
  retreatRule: RetreatRule;
  /** 決定論シードと結果は派遣時に確定する。実時間は「見せるタイミング」だけを決める */
  seed: number;
  /** 開始時刻（epoch ms） */
  startedAt: number;
  /** 完了までの実時間（秒） */
  durationSec: number;
}
