import { COLORS } from '../render/palette';

// UI 配色。色そのものは持たず、render/palette.ts の COLORS に意味名を付けるだけ。
// 「UIとドット絵で微妙に違う黒が2種類ある」といった破綻を構造的に起こせなくする。
export const THEME = {
  bg: COLORS.bg,
  panel: COLORS.panel,
  panelLight: COLORS.panel2,
  text: COLORS.white,
  dim: COLORS.gray,
  faint: COLORS.grayDark,
  gold: COLORS.gold,
  goldDark: COLORS.goldDark,
  red: COLORS.red,
  redDark: COLORS.redDark,
  green: COLORS.green,
  greenDark: COLORS.greenDark,
  blue: COLORS.blue,
  blueDark: COLORS.blueDark,
  purple: COLORS.purple,
  purpleDark: COLORS.purpleDark,
  orange: COLORS.orange,
  teal: COLORS.teal,
  outline: COLORS.black
} as const;
