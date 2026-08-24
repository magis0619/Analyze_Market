// UI 配色。render/palette.ts の32色パレットと同じ値を使うこと
// （批評ループで palette.ts と突き合わせて統一する）。
export const THEME = {
  bg: '#1a1420',
  panel: '#2b2138',
  panelLight: '#3e3450',
  text: '#f2ede4',
  dim: '#b8b0a8',
  faint: '#6e6660',
  gold: '#e8c84c',
  goldDark: '#a08030',
  red: '#c83c3c',
  green: '#6aa04a',
  blue: '#4a72b0',
  outline: '#0f0b14'
} as const;
