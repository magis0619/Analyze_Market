// OUTFITTER — global pixel-art palette.
// One char per color; every sprite row in sprites.ts references these keys.
// Hard budget: max 32 entries. Current count: 30.

export const OUTLINE = '#1a1420';

export const PALETTE: Record<string, string> = {
  // core
  o: '#1a1420', // universal 1px outline / near-black
  w: '#f4f2ec', // white (UI text, highlights, bone)
  l: '#c9c9d4', // light gray (silver metal, UI edge light)
  // stone grays (stratum 1)
  g: '#8e93a0', // stone light
  G: '#5f6472', // stone mid
  s: '#3d4050', // stone dark
  S: '#282a36', // stone background (shaft wall)
  // dirt browns (stratum 0, wood, leather)
  B: '#b98a52', // dirt light / pale wood
  b: '#8a5f33', // dirt mid / wood
  n: '#5d3d20', // dirt dark / dark wood
  N: '#3a2715', // dirt background (shaft wall)
  // deep purples (stratum 2)
  p: '#8a68b0', // purple light
  P: '#5d4380', // purple mid
  q: '#3f2b5c', // purple dark
  Q: '#281a40', // purple background (shaft wall)
  // abyssal blues (stratum 3)
  c: '#4f80c0', // blue light
  C: '#31558e', // blue mid
  u: '#1f3560', // blue dark
  U: '#131d3d', // abyss background (shaft wall)
  // sky
  k: '#9fd4ea', // surface sky
  // figures
  f: '#eaa87c', // skin
  F: '#b5714a', // skin shade
  r: '#c34433', // cloth red
  R: '#7c2418', // cloth red dark / wax seal
  e: '#5ca84e', // cloth green / goblin skin
  E: '#2f6b33', // green dark
  y: '#f2c94c', // gold / treasure
  Y: '#b5862c', // gold dark / brass
  t: '#de7b2f', // orange (copper, lantern flame)
  v: '#6fe3c5', // glow teal (moss, crystal, magic)
};

export interface StratumTheme {
  sky?: string;
  bgDark: string;
  bgLight: string;
  earth: string;
  earthDark: string;
  accent: string;
}

// 4 strata, top to bottom: 表土 (dirt) / 岩盤 (stone) / 深層 (purple rock) / 深淵 (abyss).
// Every color is drawn from PALETTE above; each theme stays well under 8 distinct colors.
export const STRATA: readonly StratumTheme[] = [
  {
    sky: PALETTE['k'] ?? OUTLINE,
    bgDark: PALETTE['N'] ?? OUTLINE,
    bgLight: PALETTE['n'] ?? OUTLINE,
    earth: PALETTE['b'] ?? OUTLINE,
    earthDark: PALETTE['n'] ?? OUTLINE,
    accent: PALETTE['B'] ?? OUTLINE,
  },
  {
    bgDark: PALETTE['S'] ?? OUTLINE,
    bgLight: PALETTE['s'] ?? OUTLINE,
    earth: PALETTE['G'] ?? OUTLINE,
    earthDark: PALETTE['s'] ?? OUTLINE,
    accent: PALETTE['g'] ?? OUTLINE,
  },
  {
    bgDark: PALETTE['Q'] ?? OUTLINE,
    bgLight: PALETTE['q'] ?? OUTLINE,
    earth: PALETTE['P'] ?? OUTLINE,
    earthDark: PALETTE['q'] ?? OUTLINE,
    accent: PALETTE['p'] ?? OUTLINE,
  },
  {
    bgDark: PALETTE['U'] ?? OUTLINE,
    bgLight: PALETTE['u'] ?? OUTLINE,
    earth: PALETTE['C'] ?? OUTLINE,
    earthDark: PALETTE['u'] ?? OUTLINE,
    accent: PALETTE['c'] ?? OUTLINE,
  },
];
