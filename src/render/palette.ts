// DELVERS — 唯一のカラーパレット（仕様書 §9.3「同時に使う色は32色まで」）。
//
// 以前は sprites 用の PALETTE と UI 用の THEME が別々の色を持っていて、
// ソース上47色／画面上61色まで膨らんでいた。ここを唯一の出所にして、
// スプライトの1文字キーも UI の意味名も同じ COLORS を指すようにする。
//
// COLORS を増やすときは必ず数えること。scripts/static-checks.mjs が 32 を超えたら落とす。

export const COLORS = {
  black:     '#0f0b14', // 1px アウトライン／最暗
  bg:        '#1a1420', // 画面背景
  panel:     '#2b2138', // パネル
  panel2:    '#3e3450', // パネル（明）
  white:     '#f2ede4', // 本文
  gray:      '#b8b0a8', // 副文
  grayDark:  '#6e6660', // 無効・かすみ
  gold:      '#e8c84c', // 金／遺物
  goldDark:  '#a08030',
  red:       '#c83c3c', // 危険・戦死・炎
  redDark:   '#7c2418', // 封蝋・炎の影
  green:     '#6aa04a', // 安全・毒
  greenDark: '#2f6b33',
  blue:      '#4a72b0', // 上質・水
  blueDark:  '#253c6a',
  purple:    '#9a68c8', // 稀少
  purpleDark:'#5d4380',
  orange:    '#de7b2f', // 灯り・雷
  teal:      '#6fe3c5', // 魔力の輝き
  skin:      '#eaa87c',
  skinDark:  '#b5714a',
  stone:     '#8e93a0',
  stoneMid:  '#5f6472',
  stoneDark: '#3d4050',
  wood:      '#b98a52',
  woodMid:   '#8a5f33',
  woodDark:  '#5d3d20',
  sky:       '#9fd4ea', // 夜明けの空／氷
  abyss:     '#1f3560'
} as const;

export type ColorName = keyof typeof COLORS;

export const OUTLINE = COLORS.black;

// スプライト1文字キー → 色。sprites.ts の全ドットがここを参照する。
// キー名は v1 から変えていない（2500行の点データを壊さないため）が、
// 指す先はすべて上の COLORS に寄せてある。
export const PALETTE: Record<string, string> = {
  o: COLORS.black,
  w: COLORS.white,
  l: COLORS.gray,
  // 石
  g: COLORS.stone,
  G: COLORS.stoneMid,
  s: COLORS.stoneDark,
  S: COLORS.panel,
  // 土・木・革
  B: COLORS.wood,
  b: COLORS.woodMid,
  n: COLORS.woodDark,
  N: COLORS.bg,
  // 紫（稀少・深層）
  p: COLORS.purple,
  P: COLORS.purpleDark,
  q: COLORS.panel2,
  Q: COLORS.panel,
  // 青（上質・深淵）
  c: COLORS.blue,
  C: COLORS.blueDark,
  u: COLORS.abyss,
  U: COLORS.bg,
  // 空・氷
  k: COLORS.sky,
  // 人物
  f: COLORS.skin,
  F: COLORS.skinDark,
  r: COLORS.red,
  R: COLORS.redDark,
  e: COLORS.green,
  E: COLORS.greenDark,
  y: COLORS.gold,
  Y: COLORS.goldDark,
  t: COLORS.orange,
  v: COLORS.teal
};

export interface StratumTheme {
  sky?: string;
  bgDark: string;
  bgLight: string;
  earth: string;
  earthDark: string;
  accent: string;
}

// 深度グラフと拠点の地面で使う4層。すべて COLORS の中から選ぶ。
export const STRATA: readonly StratumTheme[] = [
  { sky: COLORS.sky, bgDark: COLORS.bg, bgLight: COLORS.woodDark,
    earth: COLORS.woodMid, earthDark: COLORS.woodDark, accent: COLORS.wood },
  { bgDark: COLORS.panel, bgLight: COLORS.stoneDark,
    earth: COLORS.stoneMid, earthDark: COLORS.stoneDark, accent: COLORS.stone },
  { bgDark: COLORS.panel, bgLight: COLORS.panel2,
    earth: COLORS.purpleDark, earthDark: COLORS.panel2, accent: COLORS.purple },
  { bgDark: COLORS.bg, bgLight: COLORS.abyss,
    earth: COLORS.blueDark, earthDark: COLORS.abyss, accent: COLORS.blue }
];
