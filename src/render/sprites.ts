// DELVERS — pixel-art sprite sheet, decoded at boot into offscreen canvases.
// Every glyph char references PALETTE in ./palette.ts ('.' = transparent).
// Style: bold 1px dark outlines, chunky comical proportions, 2-3 shades per
// material, light from the upper left. All art here is original.
//
// Every object sprite carries a 1px 'o' outline all the way round (§9.2), so
// it never sinks into the panel it is drawn on. The only sprites without one
// are the ones where an outline would be wrong: the terrain tiles (which butt
// up against each other), the 'ladder' rope (which tiles vertically), the
// 'fence' rails (which tile horizontally) and 'burst' (additive light, not an
// object). Nothing here may use the palette chars that resolve to the UI's own
// colours -- S/Q (panel), q (panel2), N/U (bg) -- as visible paint, because
// those are literally the background it would be drawn on; they survive only
// inside the 9-slice chrome and the terrain tiles, where that is the point.

import { PALETTE } from './palette';

type Rows = readonly string[];

// ---------------------------------------------------------------------------
// Hero: chibi adventurer, big helmet, backpack. Climb cycle is seen from
// behind (descending a ladder); mining is a side view facing right.
// ---------------------------------------------------------------------------

const HERO_WALK_0: Rows = [
  '.....oooooo.....',
  '....olggggGo....',
  '....olggggGo....',
  '....ogggGGGo....',
  '....oGGGGGGo....',
  'oooo.oooooo.....',
  'ofrroBBBbno.....',
  'ooooobbbbno.....',
  '....obbbbno.....',
  '....obbbbnooooo.',
  '....obnnnnorrfo.',
  '....ooooooooooo.',
  '....oCo.oCo.....',
  '...onno.oCo.....',
  '...oooo.onno....',
  '........oooo....',
];


const HERO_DEAD: Rows = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '............oo..',
  '...........onno.',
  '............oCo.',
  '..oooo......oCo.',
  '.olggGo.ooooooo.',
  '.offofoorrrrbno.',
  '.oGfffoRRrrbbno.',
  '.oooooooooooooo.',
  '................',
];


const PORTRAIT: Rows = [
  '....oooooooo....',
  '...onnnnnnnno...',
  '...obbbbbbbbo...',
  '...obbbbbbbbo...',
  '...oFFFFFFFFo...',
  '...offffffffo...',
  '...ofoffffofo...',
  '...offffffffo...',
  '...offFFFFffo...',
  '...oFffffffFo...',
  '....ooFFFFoo....',
  '...oorrRRrroo...',
  '.oorrrrRRrrrroo.',
  'oRrrrrrrrrrrrrRo',
  'oRRRRRRRRRRRRRRo',
  '.oooooooooooooo.',
];

// ---------------------------------------------------------------------------
// Terrain: rope ladder segment (tileable vertically, transparent bg).
// Solid tiles / shaft walls are generated from templates further below.
// ---------------------------------------------------------------------------

const LADDER: Rows = [
  '...obo....obo...',
  '...obo....obo...',
  '..oooooooooooo..',
  '..oBBBBBBBBBBo..',
  '..obbbbbbbbbbo..',
  '..oooooooooooo..',
  '...obo....obo...',
  '...obo....obo...',
  '...obo....obo...',
  '...obo....obo...',
  '..oooooooooooo..',
  '..oBBBBBBBBBBo..',
  '..obbbbbbbbbbo..',
  '..oooooooooooo..',
  '...obo....obo...',
  '...obo....obo...',
];

// ---------------------------------------------------------------------------
// Generic equipment icons (16x16, 1px outline). itemIconName() prefers the
// per-base art further down and falls back to these.
// ---------------------------------------------------------------------------

// W1 iron sword: medium straight blade, gold cross guard.
const ICON_W1: Rows = [
  '.......oo.......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '...ooooooooo....',
  '...oyyYyyYyo....',
  '...oooonnooo....',
  '......onno......',
  '......oyyo......',
  '......oooo......',
];

// W2 dagger: short broad leaf blade, wooden guard, gold pommel.
const ICON_W2: Rows = [
  '................',
  '................',
  '.......oo.......',
  '......olgo......',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '......olgo......',
  '....oooooooo....',
  '....obbbbbbo....',
  '....oooooooo....',
  '......onno......',
  '......onno......',
  '......oyyo......',
  '......oooo......',
  '................',
];

// W3 big warhammer: massive block head, thick haft.
const ICON_W3: Rows = [
  '..ooooooooooo...',
  '..ollggggggGo...',
  '..ollggggggGo...',
  '..olgggggggGo...',
  '..oGGGGGGGGGo...',
  '..ooooooooooo...',
  '......onno......',
  '......onno......',
  '......onno......',
  '......onno......',
  '......onno......',
  '......onno......',
  '......onno......',
  '......onno......',
  '......oooo......',
  '................',
];

// W4 silver rapier: longest and thinnest blade, cup guard.
const ICON_W4: Rows = [
  '......ooo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '......olo.......',
  '.....ooooo......',
  '....olwlllo.....',
  '....ooooooo.....',
  '......ono.......',
  '......oyo.......',
  '......ooo.......',
];

// A1 iron armor: bulky cuirass, center ridge highlight.
const ICON_A1: Rows = [
  '................',
  '...oooo..oooo...',
  '..olggoooogGGo..',
  '.olgggoooogggGo.',
  '.olgggglggggGGo.',
  '.olgggglggggGGo.',
  '.oolggglggggGoo.',
  '..olggglggggGo..',
  '..olggglggggGo..',
  '..oGggglgggGGo..',
  '..oGGGGGGGGGGo..',
  '..oooooooooooo..',
  '................',
  '................',
  '................',
  '................',
];

// A2 leather armor: slimmer brown vest with lace stitches.
const ICON_A2: Rows = [
  '................',
  '................',
  '...oooo..oooo...',
  '..oBbboooobbno..',
  '..oBbbbbbbbbno..',
  '..oBbbbobbbbno..',
  '..oBbbbbobbbno..',
  '..oBbbbobbbbno..',
  '..oBbbbbobbbno..',
  '..onbbbbbbbnno..',
  '..oonnnnnnnnoo..',
  '...oooooooooo...',
  '................',
  '................',
  '................',
  '................',
];

// A3 wooden shield: round, vertical planks, iron boss.
const ICON_A3: Rows = [
  '................',
  '................',
  '.....oooooo.....',
  '...ooBbBbBboo...',
  '..oBbBbBbBbBbo..',
  '..oBbBoooobBbo..',
  '..oBbolggGoBbo..',
  '..oBbolgGGoBbo..',
  '..oBboooooobbo..',
  '..oBbBbBbBbBbo..',
  '..onbnbnbnbnbo..',
  '...oonbnbnboo...',
  '.....oooooo.....',
  '................',
  '................',
  '................',
];


// T1 lantern: brass caps, glowing glass with flame.
const ICON_T1: Rows = [
  '.......oo.......',
  '......o..o......',
  '......o..o......',
  '.....oooooo.....',
  '....oYYYYYYo....',
  '...oyyyyyyyyo...',
  '...oyyttttyyo...',
  '...oyttttttyo...',
  '...oyyttttyyo...',
  '...oyyyyyyyyo...',
  '....oYYYYYYo....',
  '....oooooooo....',
  '................',
  '................',
  '................',
  '................',
];


// ---------------------------------------------------------------------------
// Event icons (16x16 emblems, 1px outline).
// ---------------------------------------------------------------------------


// Trapped chest: lifted lid, toothy dark gap, gold lock.
const EV_CHEST: Rows = [
  '................',
  '................',
  '................',
  '..oooooooooooo..',
  '.oBbbbbbbbbbbno.',
  '.oBbbbbbbbbbbno.',
  '.oooooooooooooo.',
  '.oRwRwRwRwRwRRo.',
  '.oBbbboyyobbbno.',
  '.oBbbboYYobbbno.',
  '.oBbbbbbbbbbbno.',
  '.onnnnnnnnnnnno.',
  '..oooooooooooo..',
  '................',
  '................',
  '................',
];


// ---------------------------------------------------------------------------
// Loot icons (16x16, 1px outline).
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Misc UI / markers.
// ---------------------------------------------------------------------------

// Death marker for the return report, which asks for it by name; the 8x8
// icon_skull_small further down is the inline version used inside text rows.
const SKULL: Rows = [
  '................',
  '................',
  '....oooooooo....',
  '...owwwwwwwwo...',
  '..owwwwwwwwwwo..',
  '..owwwwwwwwwwo..',
  '..owoowwwwoowo..',
  '..owoowwwwoowo..',
  '..owwwwoowwwwo..',
  '...owwwwwwwwo...',
  '...owlwlwlwlo...',
  '....oooooooo....',
  '................',
  '................',
  '................',
  '................',
];

const STAR: Rows = [
  '...oo...',
  '..owwo..',
  '.owyywo.',
  'owyyyywo',
  'owyyyywo',
  '.owyywo.',
  '..owwo..',
  '...oo...',
];

const COIN: Rows = [
  '..oooo..',
  '.oyyyyo.',
  'oywyyyYo',
  'oyyyyyYo',
  'oyyyyYYo',
  'oyyyYYYo',
  '.oYYYYo.',
  '..oooo..',
];


// ---------------------------------------------------------------------------
// Wall decor: transparent 16x16 props scattered inside the shaft to add
// points of interest, outlined like characters.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Terrain tiles: every 16x16 tile is ONE diggable block. Structure (matching
// the strata-bench look): 1px dark mortar ring on all four edges (adjacent
// tiles combine into a 2px seam), then a 1px bevel — highlight on top/left,
// shadow on bottom/right — around a 12x12 core with 2-3 shades of grain.
// Tiles/walls carry NO character outline by design.
// Template chars: m = mortar (bgDark), h = bevel highlight (accent),
// z = bevel shadow / dark grain (earthDark), x = core (earth),
// a = accent fleck.
// ---------------------------------------------------------------------------

const TILE_TEMPLATE_A: Rows = [
  'mmmmmmmmmmmmmmmm',
  'mhhhhhhhhhhhhhzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxzxxxxxaxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxxxxxzzxxxxzm',
  'mhxaxxxxxzxxxxzm',
  'mhxxxxxxxxxxzxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxzzxxxxxxxxxzm',
  'mhxxzxxxxaxxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxxxxzxxxxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhzzzzzzzzzzzzzm',
  'mmmmmmmmmmmmmmmm',
];

const TILE_TEMPLATE_B: Rows = [
  'mmmmmmmmmmmmmmmm',
  'mhhhhhhhhhhhhhzm',
  'mhxxxxxxzxxxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxaxxxxxxzzxxzm',
  'mhxxxxxxxxxzxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxxzxxxxxxaxzm',
  'mhxxzzxxxxxxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxxxxxzxxxxxzm',
  'mhxaxxxzzxxxxxzm',
  'mhxxxxxxxxxxxxzm',
  'mhxxxxxxxxzxxxzm',
  'mhzzzzzzzzzzzzzm',
  'mmmmmmmmmmmmmmmm',
];

// Per-stratum accent blocks (tile_s{s}_c): same block structure, plus a
// point of interest — s0 moss+root, s1 iron glint, s2 amethyst grains,
// s3 pale glow spots. These use palette chars directly.


// stratum -> palette chars for [earth, earthDark, accent] and [bgDark, bgLight]
const STRATUM_TILE_CHARS: readonly (readonly [string, string, string])[] = [
  ['b', 'n', 'B'], // 0 表土 brown dirt
  ['G', 's', 'g'], // 1 岩盤 gray stone
  ['P', 'q', 'p'], // 2 深層 purple rock
  ['C', 'u', 'c'], // 3 深淵 abyssal blue
];
// mortar seam per stratum (drawn over the screen background, not over panels)
const STRATUM_MORTAR: readonly string[] = ['N', 'S', 'Q', 'U'];

function remap(rows: Rows, map: Record<string, string>): string[] {
  return rows.map((row) => {
    let out = '';
    for (const ch of row) out += map[ch] ?? ch;
    return out;
  });
}

// ---------------------------------------------------------------------------
// 9-slice UI chrome, assembled procedurally so the repeated edges stay
// perfectly uniform.
// ---------------------------------------------------------------------------

function buildFrame(): string[] {
  // Rings from the edge inward: o, l (top/left) or G (bottom/right), s, o;
  // fill S. 1px gold rivets sit in the 8px corner regions.
  const rows: string[] = [];
  rows.push('o'.repeat(24));
  rows.push('o' + 'l'.repeat(22) + 'o');
  const rivet = 'ol' + 'y' + 's'.repeat(18) + 'y' + 'Go';
  const innerEdge = 'ols' + 'o'.repeat(18) + 'sGo';
  const fill = 'olso' + 'S'.repeat(16) + 'osGo';
  rows.push(rivet, innerEdge);
  for (let i = 0; i < 16; i++) rows.push(fill);
  rows.push(innerEdge, rivet);
  rows.push('o' + 'G'.repeat(22) + 'o');
  rows.push('o'.repeat(24));
  return rows;
}

function buildButton(): string[] {
  // Raised face: l bevel top/left, s shadow bottom/right, face G with a
  // lighter g band along the top.
  const rows: string[] = [];
  rows.push('o'.repeat(24));
  rows.push('o' + 'l'.repeat(21) + 'so');
  for (let i = 0; i < 3; i++) rows.push('ol' + 'g'.repeat(20) + 'so');
  for (let i = 0; i < 17; i++) rows.push('ol' + 'G'.repeat(20) + 'so');
  rows.push('o' + 's'.repeat(22) + 'o');
  rows.push('o'.repeat(24));
  return rows;
}


// ---------------------------------------------------------------------------
// Sprite table (insertion order = debugSpriteNames() order).
// ---------------------------------------------------------------------------

const SPRITES: Record<string, Rows> = {
  hero_walk_0: HERO_WALK_0,
  hero_dead: HERO_DEAD,
  portrait: PORTRAIT,
  ladder: LADDER,
  icon_W1: ICON_W1,
  icon_W2: ICON_W2,
  icon_W3: ICON_W3,
  icon_W4: ICON_W4,
  icon_A1: ICON_A1,
  icon_A2: ICON_A2,
  icon_A3: ICON_A3,
  icon_T1: ICON_T1,
  ev_chest: EV_CHEST,
  skull: SKULL,
  star: STAR,
  coin: COIN,
  frame: buildFrame(),
  button: buildButton(),
};

// Generated terrain: tile_s{0..3}_{a,b}. Both variants are referenced by
// string concatenation from base/title/report ("tile_s" + s + "_a" | "_b").
for (let s = 0; s < 4; s++) {
  const tileChars = STRATUM_TILE_CHARS[s];
  const mortar = STRATUM_MORTAR[s];
  if (!tileChars || mortar === undefined) continue;
  const [earth, earthDark, accent] = tileChars;
  const tileMap = { x: earth, z: earthDark, a: accent, h: accent, m: mortar };
  SPRITES['tile_s' + String(s) + '_a'] = remap(TILE_TEMPLATE_A, tileMap);
  SPRITES['tile_s' + String(s) + '_b'] = remap(TILE_TEMPLATE_B, tileMap);
}

// ---------------------------------------------------------------------------
// DELVERS additions. Everything below is new art for the idle-hack-and-slash
// build: weapon/armor base types, job portraits, element pips, rarity frames,
// stage icons and paintings, the base camp, UI glyphs and the rare-drop
// burst. Same rules as above --
// 1px OUTLINE on characters and items, light from the upper left, 2-3 shades
// per material, no new palette entries.
// ---------------------------------------------------------------------------

// --- Weapon base types (16x16). Silhouette carries the type: blade length,
// blade width and guard span separate dagger / sword / greatsword; spear, bow
// and staff differ in overall shape and in showing wood instead of steel.

const BASE_DAGGER: Rows = [
  '................',
  '................',
  '.......oo.......',
  '......olgo......',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '....oooooooo....',
  '....oyyYyyYo....',
  '....ooonnooo....',
  '......onno......',
  '......onno......',
  '......oyyo......',
  '......oooo......',
  '................',
];

const BASE_SWORD: Rows = [
  '................',
  '.......oo.......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '......olgo......',
  '...oooooooooo...',
  '...oyyYyyyYyo...',
  '...oooonnoooo...',
  '......onno......',
  '......oyyo......',
  '......oooo......',
];

const BASE_GREATSWORD: Rows = [
  '.......oo.......',
  '......olgo......',
  '.....olgGGo.....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '....olgGGgGo....',
  '.oooooooooooooo.',
  '.oyyYyyyyyyYYyo.',
  '.oooooonnoooooo.',
  '......onno......',
  '......oyyo......',
  '......oooo......',
];

const BASE_SPEAR: Rows = [
  '.......oo.......',
  '......olgo......',
  '......olgo......',
  '.....olggGo.....',
  '.....olggGo.....',
  '......olgo......',
  '.....oooooo.....',
  '.....oyYYyo.....',
  '.....oooooo.....',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oooo......',
];

const BASE_BOW: Rows = [
  '........oooooo..',
  '........oBbolo..',
  '.......oBboolo..',
  '......oBbo.olo..',
  '.....oBbo..olo..',
  '....oBbo...olo..',
  '...oBbo....olo..',
  '...oBbo....olo..',
  '...oBbo....olo..',
  '...oBbo....olo..',
  '....oBbo...olo..',
  '.....oBbo..olo..',
  '......oBbo.olo..',
  '.......oBboolo..',
  '........oBbolo..',
  '........oooooo..',
];

const BASE_STAFF: Rows = [
  '......oooo......',
  '.....owvvo......',
  '....owvvvvo.....',
  '....ovvvvco.....',
  '.....ovvcco.....',
  '......oooo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oooo......',
];

// --- Armour base types (16x16). Read as bulk: 10px leather, 12px mail,
// 14px plate with pauldrons and a belt.

const BASE_LIGHT: Rows = [
  '................',
  '................',
  '..oooo....oooo..',
  '..oBbo....oBno..',
  '..oBboooooobno..',
  '..oBbbbbbbbbno..',
  '..oBbbbbbbbbno..',
  '..oBbnbbbbbbno..',
  '..oBbbnbbbbbno..',
  '..oBbbbnbbbbno..',
  '..oBbbbbnbbbno..',
  '..onbbbbbbbnno..',
  '..oonnnnnnnnoo..',
  '...oooooooooo...',
  '................',
  '................',
];

const BASE_MEDIUM: Rows = [
  '................',
  '................',
  '.oooo......oooo.',
  '.olgo......olGo.',
  '.olggooooooggGo.',
  '.olggGGggGGggGo.',
  '.olGGggGGggGGGo.',
  '.olggGGggGGggGo.',
  '.olGGggGGggGGGo.',
  '.olggGGggGGggGo.',
  '.olGGggGGggGGGo.',
  '.oGGggGGggGGGGo.',
  '.oGGGGGGGGGGGGo.',
  '.oooooooooooooo.',
  '................',
  '................',
];

const BASE_HEAVY: Rows = [
  '................',
  'oooo........oooo',
  'olgo........olGo',
  'olggoooooooogGGo',
  'olgggoooooogggGo',
  '.olgggglgggggGo.',
  '.olgggglgggggGo.',
  '.olgggglgggggGo.',
  '.olgggglgggggGo.',
  '.oooooooooooooo.',
  '.oyyYyyyyyyYYyo.',
  '.oooooooooooooo.',
  '..oGGGGGGGGGGo..',
  '..oGGGGGGGGGGo..',
  '..oooooooooooo..',
  '................',
];

// --- Job portraits (16x16 bust, same construction as `portrait`).

const JOB_SWORDSMAN: Rows = [
  '....oooooooo....',
  '...onnnnnnnno...',
  '...obbbbbbbbo...',
  '...obbbbbbbbooo.',
  '...orrrrrrrrolgo',
  '...oFFFFFFFFolgo',
  '...offffffffolgo',
  '...ofoffffofolgo',
  '...offffffffolgo',
  '...offFFFFffolgo',
  '...oFffffffFolgo',
  '...oooFFFFooolgo',
  '..olllllllllllgo',
  '..oGGlGGGGsGGlgo',
  '.onnolGGGGsGyyyo',
  'onBBnlGGGGsGGnno',
  'onlgnlGGGGsffnno',
  'onggnnnyynnffoo.',
  'onBBnGGooGGoo...',
  '.onnoGGooGGo....',
  '..oooGGooGGo....',
  '...obbboobbbo...',
  '...onnnoonnno...',
  '....ooo..ooo....',
];

const JOB_GUARDIAN: Rows = [
  '.......oo.......',
  '......orro......',
  '.....oorrooo....',
  '....olllllllo...',
  '...olgggggggGo..',
  '...olgggggggGo..',
  '...olgggggggGo..',
  '...olgsssssgGo..',
  '...olgsssssgGo..',
  '...olgggggggGo..',
  '.ooolggsssggGo..',
  'ossssoGGGGGGGoo.',
  'osgGGolllllllggo',
  'osgGGoGGGsGGGggo',
  'osgyGoGGGsGGGggo',
  'osyyyoGGGsGGGGo.',
  'osgyGoyyyyyyyyo.',
  'osgyGoGGGGGGGGo.',
  'osgGGoGGGGGGGGo.',
  'osgGGoGGGoGGGGo.',
  'osgGGoGGGoGGGGo.',
  'ooooooGGGoGGGGo.',
  '.ooosssssossssso',
  '....ooooo.ooooo.',
];

const JOB_SKIRMISHER: Rows = [
  '....ooooooooo...',
  '...oeeeeeeeeeo..',
  '...oeeeeeeeeEo..',
  '...oeeeeeeeeEo..',
  '...oeeeeeeeeEo..',
  '...oeeFFFFFeEoo.',
  '...oeefffffeEEEo',
  '...oeefofofeEEEo',
  '...oeefffffeEEEo',
  '...oeeFfffFeEEEo',
  '...oEEEEEEEEEoo.',
  '...obbBBBBBbbo..',
  '...onnBbbbnnno..',
  '...onnBbbbnnno..',
  '...onnBbbbnnno..',
  '..ooffnnnnnffo..',
  '.oyyyfnnonnyyyo.',
  '.ollgonnonnllgo.',
  '.ollgonnonnllgo.',
  '.ollgonnonnllgo.',
  '.olloonnonnllo..',
  '..olobbbobbblo..',
  '...oobbbobbbo...',
  '.....ooo.ooo....',
];

// --- Element pips (8x8, one hue plus outline; meant to sit in a row).

const ELEM_PHYSICAL: Rows = [
  'oo....oo',
  'olo..olo',
  '.oloolo.',
  '..ollo..',
  '..ollo..',
  '.oloolo.',
  'olo..olo',
  'oo....oo',
];

const ELEM_FIRE: Rows = [
  '...oo...',
  '..otto..',
  '..otyto.',
  '.ottyyto',
  'ortyyyto',
  'ortyyyto',
  '.orttro.',
  '..oooo..',
];

const ELEM_LIGHTNING: Rows = [
  '...ooo..',
  '..oyyo..',
  '.oyyoo..',
  '.oyyyyoo',
  '.ooYyyyo',
  '...oyyo.',
  '..oyyo..',
  '...oo...',
];

const ELEM_POISON: Rows = [
  '...oo...',
  '..oeeo..',
  '..oeeo..',
  '.oeeeEo.',
  'oeeeeEEo',
  'oeeeeEEo',
  '.oEeeEo.',
  '..oooo..',
];

const ELEM_ICE: Rows = [
  '...oo...',
  '..okko..',
  '.okkkko.',
  'okwkkkco',
  'okkkkkco',
  '.okkkco.',
  '..okco..',
  '...oo...',
];

// --- UI glyphs.

const ICON_LOCK: Rows = [
  '................',
  '......oooo......',
  '.....oYYYYo.....',
  '....oYYooYYo....',
  '....oYo..oYo....',
  '....oYo..oYo....',
  '..oooooooooooo..',
  '..oyyyyyyyyyYo..',
  '..oyyyyoooyyYo..',
  '..oyyyyoooyyYo..',
  '..oyyyyyoyyyYo..',
  '..oyyyyyoyyyYo..',
  '..oyyyyyyyyYYo..',
  '..oYYYYYYYYYYo..',
  '..oooooooooooo..',
  '................',
];

const ICON_SORT: Rows = [
  '................',
  '................',
  '...oo.....oooo..',
  '..ollo....ollo..',
  '.ollllo...ollo..',
  '.oolloo...ollo..',
  '..ollo....ollo..',
  '..ollo....ollo..',
  '..ollo....ollo..',
  '..ollo....ollo..',
  '..ollo...oolloo.',
  '..ollo...ollllo.',
  '..ollo....ollo..',
  '..oooo.....oo...',
  '................',
  '................',
];

const ICON_SELL: Rows = [
  '................',
  '......oooo......',
  '.....oBnnBo.....',
  '....ooBnnBoo....',
  '...obBbbbbBno...',
  '..obBbbbbbbBno..',
  '..obbbbbbbbbno..',
  '.obbbbyyybbbno..',
  '.obbbyyYyybbno..',
  '.obbbbYYYbbbno..',
  '.obbbbbbbbbbno..',
  '.obbbbbbbbbnno..',
  '..onbbbbbbbnno..',
  '..oonnnnnnnnoo..',
  '...oooooooooo...',
  '................',
];

const ICON_HOURGLASS: Rows = [
  '................',
  '..oooooooooooo..',
  '..oBbbbbbbbbno..',
  '..oooooooooooo..',
  '...okyyyyyyko...',
  '....okyyyyko....',
  '.....okyyko.....',
  '......oyyo......',
  '......oyyo......',
  '.....okkko......',
  '....okkkkko.....',
  '...okkyyyyko....',
  '..oooooooooooo..',
  '..oBbbbbbbbbno..',
  '..oooooooooooo..',
  '................',
];

const ICON_SKULL_SMALL: Rows = [
  '..oooo..',
  '.owwwwo.',
  'owwwwwwo',
  'owowwowo',
  'owwwwwwo',
  '.owlwlo.',
  '..oooo..',
  '........',
];

const ICON_CHECK: Rows = [
  '......o.',
  '.o...oeo',
  'oeo.oeeo',
  'oeeoeeo.',
  '.oeeeo..',
  '..oeo...',
  '...o....',
  '........',
];

// --- Stage icons (16x16), one per depth band.

const STAGE_1: Rows = [
  '.oooooooooooooo.',
  '.oBbbbbbbbbbbno.',
  '.oooooooooooooo.',
  '................',
  '..oooooooooooo..',
  '..ollllllllllo..',
  '..oggGoBboggGo..',
  '...ooooBboooo...',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oBbo......',
  '......oooo......',
  '................',
];

const STAGE_2: Rows = [
  '................',
  '..oooooooooooo..',
  '..ogggggggggGo..',
  '..oooooooooooo..',
  '...ogggggggGo...',
  '...ovvgggggGo...',
  '...oeegggggGo...',
  '...ogggggggGo...',
  '...oggggvvgGo...',
  '...oggggeegGo...',
  '...ogggvvggGo...',
  '...ogggeeggGo...',
  '..oooooooooooo..',
  '..ogggggggggGo..',
  '..oooooooooooo..',
  '................',
];

const STAGE_3: Rows = [
  '................',
  '................',
  '...oooooooooo...',
  '..ooggggggggoo..',
  '..ogggttggggGo..',
  '..ogggtygggGGo..',
  '..oggggttggGGo..',
  '..ogggggtygGGo..',
  '..oggggttgGGGo..',
  '..oggtytggGGGo..',
  '..ogttggggGGGo..',
  '..ooggggGGGGoo..',
  '...oooooooooo...',
  '................',
  '................',
  '................',
];

const STAGE_4: Rows = [
  '.oooooooooooooo.',
  '.okkkkkkkkkkcco.',
  '.occccccccCCCCo.',
  '.oooooooooooooo.',
  '..okcookcookco..',
  '..okcookcookco..',
  '...okookcookco..',
  '...oo.okcookco..',
  '......okco.oko..',
  '......okco.oo...',
  '.......oko......',
  '.......oo.......',
  '................',
  '................',
  '................',
  '................',
];

const STAGE_5: Rows = [
  '................',
  '.....oooooo.....',
  '...ooGssssGoo...',
  '..ooGssssssGoo..',
  '.ooGssssssssGoo.',
  '.oGsssssyysssGo.',
  '.oGssssyyssssGo.',
  '.oGsssyysssssGo.',
  '.oGsyyyYYYsssGo.',
  '.oGssssyYssssGo.',
  '.oGsssyYsssssGo.',
  '.oGssYYssssssGo.',
  '.oGssssssssssGo.',
  '.oooooooooooooo.',
  '................',
  '................',
];

const STAGE_6: Rows = [
  '...oo...........',
  '..oeeo....oo....',
  '..oEEo...oeeo...',
  '...oo....oEEo...',
  '..........oo....',
  '................',
  '....oooooooo....',
  '..oorrRrrrrRoo..',
  '.oorrrRrerrRRoo.',
  '.orrrrreerrrRRo.',
  '.orrerrrrrRrRRo.',
  '.oRrrrrrrrrRRRo.',
  '..oRRrrrrrRRRo..',
  '...ooRRRRRRoo...',
  '....oooooooo....',
  '................',
];

const STAGE_7: Rows = [
  '................',
  '.oooooooooooooo.',
  '.oGGssssssssGGo.',
  '.ossssGGsssssso.',
  '.oooooooooooooo.',
  '.ottyyttttyytto.',
  '.oyyttttyytttto.',
  '.ottttyyttttyyo.',
  '.ottyyttyytttto.',
  '.orrttttyyrrrro.',
  '.oooooooooooooo.',
  '.ossssssGGsssso.',
  '.oGssssssssssGo.',
  '.oooooooooooooo.',
  '................',
  '................',
];

const STAGE_8: Rows = [
  '................',
  '....oooooooo....',
  '..oowwwwwwwwoo..',
  '.owwwwwwwwwwllo.',
  '.owwoowwwwoowlo.',
  '.owwoowwwwoowlo.',
  '.owwwwwoowwwwlo.',
  '..owwwwwwwwwlo..',
  '..owlwlwlwlwlo..',
  '...oooooooooo...',
  '..oo........oo..',
  '.owwoooooooowwo.',
  '.owwwwwwwwwwwwo.',
  '.owwoooooooowwo.',
  '..oo........oo..',
  '................',
];

const STAGE_9: Rows = [
  '................',
  '.......oo.......',
  '......ovvo......',
  '.....ovwvvo.....',
  '.....ovvvvo.....',
  '......ovvo......',
  '.......oo.......',
  '..oooooooooooo..',
  '..ogggggggggGo..',
  '..oooooooooooo..',
  '....ogggggGo....',
  '....ogGGGGGo....',
  '....ogggggGo....',
  '..oooooooooooo..',
  '..ogGGGGGGGGGo..',
  '..oooooooooooo..',
];

// Stage 10 "the abyss": a swirl of nested dark rings, built so the bands stay
// perfectly concentric. Mirrored, never rotated.
function buildAbyss(): string[] {
  const rows: string[] = [];
  const band = (r: number): string => {
    if (r > 7.1) return '.';
    if (r > 6.0) return 'o';
    if (r > 4.7) return 'p';
    if (r > 3.4) return 'P';
    if (r > 2.1) return 'C';
    if (r > 1.0) return 'u';
    return 'o';
  };
  for (let y = 0; y < 16; y++) {
    let line = '';
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const swirl = Math.atan2(dy, dx) / Math.PI; // -1..1
      line += band(r > 6.0 ? r : r + swirl * 0.85);
    }
    rows.push(line);
  }
  return rows;
}

// --- Rarity frames (24x24, 9-sliced on 8px corners). Common is a flat gray
// band; each tier adds a ring, a richer hue and corner metalwork, so a row of
// four reads as a clear promotion.

function rep(ch: string, n: number): string {
  return ch.repeat(n);
}

function buildRarityCommon(): string[] {
  // 並: a thin dull gray line. Lowest rank, so it gets the least metal.
  const rows: string[] = [];
  rows.push(rep('o', 24));
  rows.push('o' + rep('G', 22) + 'o');
  rows.push('oG' + rep('o', 20) + 'Go');
  const fill = 'oGo' + rep('S', 18) + 'oGo';
  for (let i = 0; i < 18; i++) rows.push(fill);
  rows.push('oG' + rep('o', 20) + 'Go');
  rows.push('o' + rep('G', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

function buildRarityFine(): string[] {
  // 上質: a 4px blue bevel -- one ring more than 並.
  const rows: string[] = [];
  rows.push(rep('o', 24));
  rows.push('o' + rep('c', 22) + 'o');
  rows.push('oc' + rep('C', 20) + 'co');
  rows.push('ocC' + rep('o', 18) + 'Cco');
  const fill = 'ocCo' + rep('S', 16) + 'oCco';
  for (let i = 0; i < 16; i++) rows.push(fill);
  rows.push('ocC' + rep('o', 18) + 'Cco');
  rows.push('oc' + rep('C', 20) + 'co');
  rows.push('o' + rep('c', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

function buildRarityRare(): string[] {
  // 稀少: the same 4px bevel in purple, plus a stud in every corner.
  const rows: string[] = [];
  const stud = 'opPo' + 'pp' + rep('S', 12) + 'pp' + 'oPpo';
  const studLo = 'opPo' + 'pP' + rep('S', 12) + 'Pp' + 'oPpo';
  const fill = 'opPo' + rep('S', 16) + 'oPpo';
  rows.push(rep('o', 24));
  rows.push('o' + rep('p', 22) + 'o');
  rows.push('op' + rep('P', 20) + 'po');
  rows.push('opP' + rep('o', 18) + 'Ppo');
  rows.push(stud, studLo);
  for (let i = 0; i < 12; i++) rows.push(fill);
  rows.push(stud, studLo);
  rows.push('opP' + rep('o', 18) + 'Ppo');
  rows.push('op' + rep('P', 20) + 'po');
  rows.push('o' + rep('p', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

function buildRarityRelic(): string[] {
  // 遺物: gold, and a whole ring thicker than every other tier (5px against
  // 4px and 3px) with white-lit cornerpieces, so it still outranks the rest
  // in a screenshot with the colour taken away.
  const rows: string[] = [];
  const corner = 'oyYyo' + 'wY' + rep('S', 10) + 'Yw' + 'oyYyo';
  const cornerLo = 'oyYyo' + 'Yw' + rep('S', 10) + 'wY' + 'oyYyo';
  const fill = 'oyYyo' + rep('S', 14) + 'oyYyo';
  rows.push(rep('o', 24));
  rows.push('o' + rep('y', 22) + 'o');
  rows.push('oy' + rep('Y', 20) + 'yo');
  rows.push('oyY' + rep('y', 18) + 'Yyo');
  rows.push('oyYy' + rep('o', 16) + 'yYyo');
  rows.push(corner, cornerLo);
  for (let i = 0; i < 10; i++) rows.push(fill);
  rows.push(cornerLo, corner);
  rows.push('oyYy' + rep('o', 16) + 'yYyo');
  rows.push('oyY' + rep('y', 18) + 'Yyo');
  rows.push('oy' + rep('Y', 20) + 'yo');
  rows.push('o' + rep('y', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

// --- Rare-drop burst (32x32): eight rays out of a white core, no outline
// because it is additive light rather than an object. Built by reflection so
// the four quadrants match exactly.
function buildBurst(): string[] {
  const N = 32;
  const grid: string[][] = [];
  for (let y = 0; y < N; y++) grid.push(new Array<string>(N).fill('.'));
  const put = (x: number, y: number, ch: string): void => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const row = grid[y];
    if (row) row[x] = ch;
  };
  const shade = (d: number): string => (d < 5 ? 'w' : d < 10 ? 'y' : 't');
  for (let d = 0; d < 16; d++) {
    const ch = shade(d);
    put(15, 15 - d, ch);
    put(15, 16 + d, ch);
    put(15 - d, 15, ch);
    put(16 + d, 15, ch);
    if (d < 10) {
      put(16, 15 - d, ch);
      put(16, 16 + d, ch);
      put(15 - d, 16, ch);
      put(16 + d, 16, ch);
    }
  }
  for (let d = 0; d < 12; d++) {
    const ch = shade(d);
    put(15 - d, 15 - d, ch);
    put(16 + d, 15 - d, ch);
    put(15 - d, 16 + d, ch);
    put(16 + d, 16 + d, ch);
  }
  for (let y = 12; y <= 19; y++) {
    for (let x = 12; x <= 19; x++) {
      const dx = x < 15.5 ? 15 - x : x - 16;
      const dy = y < 15.5 ? 15 - y : y - 16;
      if (dx + dy <= 3) put(x, y, 'w');
      else if (dx + dy <= 5) put(x, y, 'y');
    }
  }
  return grid.map((r) => r.join(''));
}

Object.assign(SPRITES, {
  base_dagger: BASE_DAGGER,
  base_sword: BASE_SWORD,
  base_greatsword: BASE_GREATSWORD,
  base_spear: BASE_SPEAR,
  base_bow: BASE_BOW,
  base_staff: BASE_STAFF,
  base_light: BASE_LIGHT,
  base_medium: BASE_MEDIUM,
  base_heavy: BASE_HEAVY,
  job_swordsman: JOB_SWORDSMAN,
  job_guardian: JOB_GUARDIAN,
  job_skirmisher: JOB_SKIRMISHER,
  elem_physical: ELEM_PHYSICAL,
  elem_fire: ELEM_FIRE,
  elem_lightning: ELEM_LIGHTNING,
  elem_poison: ELEM_POISON,
  elem_ice: ELEM_ICE,
  rarity_common: buildRarityCommon(),
  rarity_fine: buildRarityFine(),
  rarity_rare: buildRarityRare(),
  rarity_relic: buildRarityRelic(),
  stage_1: STAGE_1,
  stage_2: STAGE_2,
  stage_3: STAGE_3,
  stage_4: STAGE_4,
  stage_5: STAGE_5,
  stage_6: STAGE_6,
  stage_7: STAGE_7,
  stage_8: STAGE_8,
  stage_9: STAGE_9,
  stage_10: buildAbyss(),
  icon_lock: ICON_LOCK,
  icon_sort: ICON_SORT,
  icon_sell: ICON_SELL,
  icon_hourglass: ICON_HOURGLASS,
  icon_skull_small: ICON_SKULL_SMALL,
  icon_check: ICON_CHECK,
  burst: buildBurst(),
} satisfies Record<string, Rows>);


// ---------------------------------------------------------------------------
// Pixel canvas. Everything below (the 88x48 stage paintings and the lodge set)
// is too large to hand-type as aligned string literals, so it is assembled
// with these helpers instead: every call writes whole palette characters into
// a fixed-size grid, so rows can never come out ragged. No rotation, no
// blending -- only flat fills and mirrored placement.
// ---------------------------------------------------------------------------

class Px {
  private readonly g: string[][];

  constructor(readonly w: number, readonly h: number) {
    this.g = [];
    for (let y = 0; y < h; y++) this.g.push(new Array<string>(w).fill('.'));
  }

  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const row = this.g[y];
    if (row) row[x] = ch;
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.g[y]?.[x] ?? '.';
  }

  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    }
  }

  hline(x: number, y: number, len: number, ch: string): void {
    this.rect(x, y, len, 1, ch);
  }

  vline(x: number, y: number, len: number, ch: string): void {
    this.rect(x, y, 1, len, ch);
  }

  /** 1px frame around the whole canvas (used by the full-bleed stage art). */
  border(ch: string): void {
    this.hline(0, 0, this.w, ch);
    this.hline(0, this.h - 1, this.w, ch);
    this.vline(0, 0, this.h, ch);
    this.vline(this.w - 1, 0, this.h, ch);
  }

  /**
   * Wrap every opaque pixel in a 1px dark outline (4-neighbour), so a prop
   * dropped on the panel never melts into it (§9.2). Objects must be drawn
   * with a 1px margin for the outline to land inside the canvas.
   */
  outline(): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== '.') continue;
        if (this.get(x - 1, y) !== '.' || this.get(x + 1, y) !== '.' ||
            this.get(x, y - 1) !== '.' || this.get(x, y + 1) !== '.') {
          add.push(y * this.w + x);
        }
      }
    }
    for (const i of add) this.set(i % this.w, Math.floor(i / this.w), 'o');
  }

  rows(): string[] {
    return this.g.map((row) => row.join(''));
  }
}

/** Deterministic 0..1 hash. §11.3 C2 forbids Math.random anywhere near art. */
function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Scatter `ch` over a box at the given density. Used for rock grain. */
function speckle(p: Px, x: number, y: number, w: number, h: number,
                 ch: string, density: number, seed: number): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (noise(x + i, y + j, seed) < density) p.set(x + i, y + j, ch);
    }
  }
}

/** Rounded-top opening: a rectangle whose top corners are cut to a curve. */
function arch(p: Px, cx: number, baseY: number, halfW: number, h: number, ch: string): void {
  for (let j = 0; j < h; j++) {
    const y = baseY - j;
    const t = j - (h - halfW);
    const cut = t > 0 ? Math.round(halfW - Math.sqrt(Math.max(0, halfW * halfW - t * t))) : 0;
    for (let x = cx - halfW + cut; x <= cx + halfW - cut; x++) p.set(x, y, ch);
  }
}

/** Tapering spike. dir = +1 hangs down from y, dir = -1 grows up from y. */
function spike(p: Px, x: number, y: number, len: number, dir: number,
               body: string, edge: string): void {
  for (let i = 0; i < len; i++) {
    const half = Math.max(0, Math.round(((len - i) * 2) / len));
    for (let d = -half; d <= half; d++) {
      p.set(x + d, y + i * dir, d === half && half > 0 ? edge : body);
    }
  }
}

// ---------------------------------------------------------------------------
// Stage paintings (88x48) for the dispatch detail panel. One per stage of
// §7.1; each is built from three bands -- far wall, mid-ground features and
// the floor -- and each keeps to six palette entries (§9.3).
// ---------------------------------------------------------------------------

const SBG_W = 88;
const SBG_H = 48;

function stageBg(paint: (p: Px) => void): string[] {
  const p = new Px(SBG_W, SBG_H);
  paint(p);
  p.border('o');
  return p.rows();
}

// 1 廃坑 — timbered mine shaft. o n b B G s
const STAGE_BG_1 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 'G');
  speckle(p, 0, 0, SBG_W, 40, 's', 0.18, 11);
  arch(p, 44, 40, 23, 31, 's');            // far: the shaft receding into dark
  arch(p, 44, 40, 15, 22, 'n');
  arch(p, 44, 40, 7, 14, 'o');
  for (const bx of [8, 72]) {              // mid: two timber frames
    p.rect(bx, 10, 8, 30, 'b');
    p.vline(bx, 10, 30, 'o');
    p.vline(bx + 1, 10, 30, 'B');
    p.vline(bx + 6, 10, 30, 'n');
    p.vline(bx + 7, 10, 30, 'o');
    for (let y = 14; y < 40; y += 7) p.hline(bx + 1, y, 6, 'n');
  }
  p.rect(8, 5, 72, 5, 'b');                // lintel across the top
  p.hline(8, 5, 72, 'o');
  p.hline(8, 6, 72, 'B');
  p.hline(8, 9, 72, 'o');
  for (let k = 0; k < 8; k++) {            // corner braces
    p.set(16 + k, 18 - k, 'B');
    p.set(17 + k, 18 - k, 'n');
    p.set(71 - k, 18 - k, 'B');
    p.set(70 - k, 18 - k, 'n');
  }
  p.rect(0, 40, SBG_W, 8, 'b');            // ground: dirt, sleepers and rails
  p.hline(0, 40, SBG_W, 'o');
  speckle(p, 0, 41, SBG_W, 7, 'n', 0.22, 5);
  for (let x = 2; x < SBG_W - 2; x += 6) p.rect(x, 43, 4, 4, 'n');
  p.hline(0, 43, SBG_W, 'B');
  p.hline(0, 46, SBG_W, 'B');
});

// 2 苔の回廊 — mossy stone corridor. o s G g e E
const STAGE_BG_2 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 'g');
  for (let y = 2; y < 42; y += 6) p.hline(0, y, SBG_W, 'G');   // block courses
  for (let y = 2; y < 42; y += 6) {
    for (let x = ((y / 6) & 1) === 0 ? 6 : 12; x < SBG_W; x += 18) p.vline(x, y, 6, 'G');
  }
  arch(p, 44, 42, 26, 36, 'G');            // far: corridor mouth
  arch(p, 44, 42, 18, 27, 's');
  arch(p, 44, 42, 9, 16, 'o');
  for (let x = 0; x < SBG_W; x++) {        // mid: moss curtain off the ceiling
    const len = 2 + Math.floor(noise(x, 1, 3) * 9);
    p.vline(x, 1, len, 'e');
    p.set(x, len, 'E');
    if (len > 8) { p.set(x, len + 1, 'E'); p.set(x, len + 2, 'E'); }
  }
  for (const sx of [3, 15, 69, 81]) {      // moss creeping up the side walls
    const h = 12 + Math.floor(noise(sx, 9, 5) * 12);
    for (let i = 0; i < h; i++) {
      const half = Math.max(0, 3 - Math.floor((h - i) / 6));
      p.hline(sx - half, 40 - h + i, half * 2 + 1, 'e');
      p.set(sx - half, 40 - h + i, 'E');
      p.set(sx + half, 40 - h + i, 'E');
    }
  }
  p.rect(0, 40, SBG_W, 8, 'G');            // ground
  p.hline(0, 40, SBG_W, 'o');
  speckle(p, 0, 41, SBG_W, 7, 'e', 0.22, 9);
  speckle(p, 0, 41, SBG_W, 7, 'E', 0.16, 21);
  for (const x of [8, 26, 40, 58, 76]) { p.rect(x, 38, 6, 3, 'e'); p.hline(x, 40, 6, 'E'); }
});

// 3 灼熱坑 — vent shafts and embers. o s G r t y
const STAGE_BG_3 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 's');
  speckle(p, 0, 0, SBG_W, 30, 'G', 0.16, 7);
  for (const cx of [12, 33, 56, 78]) {     // far: branching cracks, lit from within
    let x = cx;
    for (let y = 2; y < 30; y++) {
      p.set(x, y, 'r');
      p.set(x + 1, y, 't');
      if (y % 5 === 0) x += noise(x, y, 2) < 0.5 ? 1 : -1;
      if (y === 12) { for (let k = 1; k < 7; k++) p.set(x - k, y + k, 'r'); }
      if (y === 22) { for (let k = 1; k < 6; k++) p.set(x + k, y + k, 'r'); }
    }
  }
  for (const vx of [22, 46, 68]) {         // mid: vents blasting fire upward
    for (let i = 0; i < 16; i++) {
      const half = Math.max(1, 4 - Math.floor(i / 4));
      const y = 30 - i;
      p.hline(vx - half, y, half * 2 + 1, i < 11 ? 't' : 'r');
      if (i < 9) p.hline(vx - half + 1, y, Math.max(1, half * 2 - 1), 'y');
    }
    p.rect(vx - 5, 30, 11, 4, 'G');        // the vent lip
    p.hline(vx - 5, 30, 11, 'o');
  }
  p.rect(0, 34, SBG_W, 14, 's');           // ground: fissured hot rock
  p.hline(0, 34, SBG_W, 'o');
  speckle(p, 0, 35, SBG_W, 13, 'G', 0.14, 13);
  for (let x = 4; x < SBG_W; x += 11) {
    p.vline(x, 36, 8, 'r');
    p.vline(x + 1, 38, 6, 't');
    p.set(x, 44, 'y');
  }
  for (const e of [[10, 8], [30, 4], [52, 14], [74, 6], [62, 20], [18, 24]]) {
    p.set(e[0] ?? 0, e[1] ?? 0, 'y');      // embers in the air
  }
});

// 4 氷結層 — icicles over a pale blue floor. o C c k w G
const STAGE_BG_4 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 'C');
  speckle(p, 0, 0, SBG_W, 30, 'c', 0.14, 3);
  arch(p, 44, 38, 24, 30, 'c');            // far: frozen hollow
  arch(p, 44, 38, 15, 21, 'C');
  for (let x = 3; x < SBG_W - 3; x += 6) { // mid: icicles from the ceiling
    const len = 5 + Math.floor(noise(x, 7, 4) * 11);
    spike(p, x, 1, len, 1, 'k', 'c');
    p.set(x, 1, 'w');
    p.set(x, 2, 'w');
  }
  for (const x of [12, 70]) {              // ice pillars
    p.rect(x, 20, 5, 18, 'k');
    p.vline(x, 20, 18, 'w');
    p.vline(x + 4, 20, 18, 'c');
    spike(p, x + 2, 19, 5, -1, 'k', 'c');
  }
  p.rect(0, 38, SBG_W, 10, 'k');           // ground: snow crust over ice
  p.hline(0, 38, SBG_W, 'o');
  p.hline(0, 39, SBG_W, 'w');
  speckle(p, 0, 41, SBG_W, 7, 'c', 0.20, 17);
  speckle(p, 0, 40, SBG_W, 8, 'w', 0.08, 29);
  for (const x of [24, 50, 62]) spike(p, x, 37, 4, -1, 'w', 'c');
});

// 5 雷鳴洞 — bolts arcing between charged rods. o s G y Y w
const STAGE_BG_5 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 's');
  speckle(p, 0, 0, SBG_W, 38, 'G', 0.15, 23);
  arch(p, 44, 40, 25, 33, 'G');            // far: the cave
  arch(p, 44, 40, 16, 23, 's');
  arch(p, 44, 40, 8, 14, 'o');
  const bolt = (x0: number, y0: number, len: number, dx: number, fork: number): void => {
    let x = x0;
    for (let i = 0; i < len; i++) {
      p.set(x, y0 + i, 'Y');
      p.set(x + 1, y0 + i, 'w');
      p.set(x + 2, y0 + i, 'y');
      p.set(x + 3, y0 + i, 'Y');
      if (i % 3 === 2) x += dx * 2;
      if (i === fork) {
        let fx = x;
        for (let k = 0; k < 9; k++) {
          p.set(fx, y0 + i + k, 'y');
          p.set(fx + 1, y0 + i + k, 'w');
          if (k % 2 === 1) fx -= dx * 2;
        }
      }
    }
  };
  bolt(16, 2, 22, 1, 9);                   // mid: two forked bolts
  bolt(64, 2, 18, -1, 7);
  for (const x of [4, 76]) {               // charged crystal spires
    for (let i = 0; i < 22; i++) {
      const half = Math.max(0, 3 - Math.floor(i / 6));
      const y = 40 - i;
      p.hline(x + 4 - half, y, half * 2 + 1, 'y');
      p.vline(x + 4 - half, y, 1, 'Y');
      p.set(x + 4 + half, y, 'Y');
      if (half > 1) p.set(x + 4 - half + 1, y, 'w');
    }
    p.set(x + 4, 17, 'w');
  }
  p.rect(0, 40, SBG_W, 8, 'G');            // ground
  p.hline(0, 40, SBG_W, 'o');
  speckle(p, 0, 41, SBG_W, 7, 's', 0.20, 31);
  for (const x of [16, 38, 62]) { p.hline(x, 42, 8, 'y'); p.hline(x + 1, 43, 6, 'Y'); }
});

// 6 腐界 — dead trees over a rotting marsh. o n b e E R
const STAGE_BG_6 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 'e');
  speckle(p, 0, 0, SBG_W, 38, 'E', 0.22, 37);
  p.rect(0, 0, SBG_W, 5, 'n');             // far: a lid of rotten canopy
  for (let x = 0; x < SBG_W; x += 3) {
    p.rect(x, 5, 2, 1 + Math.floor(noise(x, 2, 6) * 7), 'n');
  }
  for (const t of [[12, 30], [40, 36], [70, 26]]) {  // mid: dead trunks
    const x = t[0] ?? 0;
    const hh = t[1] ?? 20;
    p.rect(x, 38 - hh, 5, hh, 'n');
    p.vline(x, 38 - hh, hh, 'b');
    p.vline(x + 4, 38 - hh, hh, 'o');
    for (let i = 0; i < 3; i++) {
      const by = 38 - hh + 5 + i * 8;
      const dir = i % 2 === 0 ? -1 : 1;
      for (let k = 1; k <= 9; k++) {
        const bx = dir < 0 ? x - k : x + 4 + k;
        p.set(bx, by - Math.floor(k / 2), 'n');
        p.set(bx, by - Math.floor(k / 2) + 1, 'n');
      }
    }
  }
  for (const vx of [6, 28, 54, 80]) {      // hanging vines of rot
    const len = 8 + Math.floor(noise(vx, 4, 12) * 12);
    p.vline(vx, 6, len, 'E');
    p.set(vx, 6 + len, 'R');
  }
  p.rect(0, 38, SBG_W, 10, 'E');           // ground: standing marsh water
  p.hline(0, 38, SBG_W, 'o');
  speckle(p, 0, 39, SBG_W, 9, 'e', 0.24, 41);
  for (const x of [4, 20, 34, 50, 66, 78]) {
    p.rect(x, 41, 6, 3, 'R');              // rot slicks
    p.hline(x + 1, 40, 4, 'R');
  }
  for (const x of [12, 46, 62]) { p.set(x, 37, 'e'); p.set(x, 36, 'E'); }
});

// 7 溶岩回廊 — a lava river cutting a basalt corridor. o s G r t y
const STAGE_BG_7 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 's');
  speckle(p, 0, 0, SBG_W, 30, 'G', 0.14, 43);
  arch(p, 44, 32, 22, 28, 'G');            // far: corridor mouth, lit from below
  arch(p, 44, 32, 14, 20, 's');
  arch(p, 44, 32, 7, 12, 'r');
  arch(p, 44, 32, 4, 8, 't');
  for (const x of [4, 20, 62, 78]) {       // mid: basalt columns
    p.rect(x, 2, 7, 30, 'G');
    p.vline(x, 2, 30, 'o');
    p.vline(x + 1, 2, 30, 'G');
    p.vline(x + 5, 2, 30, 's');
    p.vline(x + 6, 2, 30, 'o');
    for (let y = 6; y < 32; y += 6) p.hline(x + 1, y, 5, 's');
    p.rect(x - 1, 2, 9, 3, 'G');
    p.hline(x - 1, 2, 9, 'o');
  }
  p.rect(0, 30, SBG_W, 4, 's');            // far bank
  p.hline(0, 30, SBG_W, 'o');
  p.rect(0, 34, SBG_W, 9, 'r');            // ground: the lava river
  p.hline(0, 34, SBG_W, 'o');
  p.rect(0, 35, SBG_W, 6, 't');
  for (let x = 2; x < SBG_W - 4; x += 7) {
    p.hline(x, 36 + (x % 3), 5, 'y');
    p.set(x + 2, 39, 'y');
  }
  p.rect(0, 43, SBG_W, 5, 's');            // near bank
  p.hline(0, 43, SBG_W, 'o');
  speckle(p, 0, 44, SBG_W, 4, 'G', 0.18, 47);
});

// 8 骸の間 — a hall of bone pillars and skulls. o s G g w l
const STAGE_BG_8 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 's');
  arch(p, 44, 40, 27, 36, 'G');            // far: the hall
  arch(p, 44, 40, 19, 27, 's');
  arch(p, 44, 40, 10, 17, 'o');
  speckle(p, 0, 0, SBG_W, 36, 'g', 0.10, 53);
  for (const x of [8, 22, 62, 76]) {       // mid: rib pillars
    p.rect(x, 6, 4, 34, 'w');
    p.vline(x + 3, 6, 34, 'l');
    for (let y = 9; y < 38; y += 5) { p.hline(x - 1, y, 6, 'w'); p.hline(x - 1, y + 1, 6, 'l'); }
  }
  p.rect(0, 40, SBG_W, 8, 'g');            // ground: bone drift
  p.hline(0, 40, SBG_W, 'o');
  speckle(p, 0, 41, SBG_W, 7, 'G', 0.16, 59);
  for (const [sx, sy] of [[10, 41], [30, 43], [46, 40], [66, 42]]) {
    const x = sx ?? 0;
    const y = sy ?? 0;
    p.rect(x, y, 7, 5, 'w');               // skull
    p.hline(x, y, 7, 'o');
    p.set(x + 1, y + 2, 'o');
    p.set(x + 5, y + 2, 'o');
    p.hline(x + 1, y + 4, 5, 'l');
  }
  for (let x = 2; x < SBG_W; x += 11) p.hline(x, 46, 8, 'l');
});

// 9 深層祭壇 — a lit altar under a purple vault. o s P p v w
const STAGE_BG_9 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 's');
  arch(p, 44, 40, 26, 36, 'P');            // far: the vault
  arch(p, 44, 40, 17, 25, 'p');
  arch(p, 44, 40, 9, 15, 's');
  speckle(p, 0, 0, SBG_W, 36, 'P', 0.10, 61);
  for (const x of [6, 74]) {               // mid: flanking pillars
    p.rect(x, 4, 8, 36, 'P');
    p.vline(x, 4, 36, 'p');
    p.vline(x + 7, 4, 36, 's');
    p.rect(x - 1, 4, 10, 3, 'p');
    p.hline(x - 1, 4, 10, 'o');
    for (let y = 10; y < 38; y += 6) p.hline(x, y, 8, 's');
  }
  p.rect(36, 30, 16, 10, 'P');             // the altar block
  p.hline(36, 30, 16, 'o');
  p.rect(34, 28, 20, 3, 'p');
  p.hline(34, 28, 20, 'o');
  p.rect(41, 16, 6, 8, 'v');               // floating shard over it
  p.vline(42, 17, 6, 'w');
  p.set(44, 14, 'v');
  p.set(43, 13, 'w');
  for (let y = 24; y < 28; y++) p.set(44, y, 'v');
  p.rect(0, 40, SBG_W, 8, 'P');            // ground
  p.hline(0, 40, SBG_W, 'o');
  for (let x = 4; x < SBG_W; x += 10) p.vline(x, 41, 7, 'p');
  p.hline(0, 44, SBG_W, 'p');
});

// 10 深淵 — broken islands falling through the void. o u C c p w
const STAGE_BG_10 = stageBg((p) => {
  p.rect(0, 0, SBG_W, SBG_H, 'u');
  speckle(p, 0, 0, SBG_W, SBG_H, 'C', 0.10, 67);
  for (let r = 0; r < 5; r++) {            // far: a cold ring hanging in the void
    const rad = 9 + r * 2;
    for (let a = 0; a < 96; a++) {
      const t = (a * Math.PI) / 48;
      p.set(44 + Math.round(Math.cos(t) * rad), 17 + Math.round(Math.sin(t) * rad * 0.62),
        r === 2 ? 'w' : r < 2 ? 'p' : 'c');
    }
  }
  for (const isl of [[4, 26, 22], [56, 20, 24], [26, 36, 30], [70, 40, 16]]) {
    const x = isl[0] ?? 0;                 // mid: shattered slabs falling away
    const y = isl[1] ?? 0;
    const w = isl[2] ?? 10;
    p.rect(x, y, w, 5, 'C');
    p.hline(x, y, w, 'c');
    p.hline(x, y + 1, w, 'c');
    for (let i = 0; i < w; i += 2) {
      const d = 1 + Math.floor(noise(x + i, y, 8) * 7);
      p.rect(x + i, y + 5, 2, d, 'o');
    }
    p.hline(x, y + 5, w, 'o');
  }
  for (let i = 0; i < 44; i++) {           // motes drifting up out of the dark
    const x = Math.floor(noise(i, 1, 71) * SBG_W);
    const y = Math.floor(noise(i, 2, 73) * SBG_H);
    p.set(x, y, i % 5 === 0 ? 'w' : 'c');
  }
  p.rect(0, 43, SBG_W, 5, 'o');            // ground: the last ledge, then nothing
  p.hline(0, 43, SBG_W, 'C');
  p.hline(0, 44, SBG_W, 'C');
  for (let x = 0; x < SBG_W; x += 5) p.set(x, 42, 'C');
});

// ---------------------------------------------------------------------------
// The base camp: the guild lodge and the props scattered around it, so the
// home screen stops being four flat rectangles.
// ---------------------------------------------------------------------------

// 112x72 log-and-stone lodge: shingled gable, stone chimney, plank walls,
// arched door and two lit windows.
function buildLodge(): string[] {
  const p = new Px(112, 72);

  // --- chimney (behind the roof line)
  p.rect(74, 4, 13, 26, 'G');
  p.vline(74, 4, 26, 'g');
  p.vline(86, 4, 26, 'n');
  for (let y = 8; y < 30; y += 5) p.hline(74, y, 13, 'o');
  p.rect(72, 1, 17, 4, 'g');
  p.hline(72, 1, 17, 'o');

  // --- roof: gable with shingle courses
  const apexY = 6;
  const eaveY = 34;
  for (let y = apexY; y <= eaveY; y++) {
    const half = Math.round(((y - apexY) * 53) / (eaveY - apexY));
    const band = Math.floor((y - apexY) / 3) % 2;
    p.hline(56 - half, y, half * 2 + 1, band === 0 ? 'b' : 'n');
    if ((y - apexY) % 3 === 0) p.hline(56 - half, y, half * 2 + 1, 'o');
    p.set(56 - half, y, 'o');
    p.set(56 + half, y, 'o');
  }
  p.rect(3, eaveY + 1, 106, 3, 'n');       // fascia board under the eaves
  p.hline(3, eaveY + 1, 106, 'B');
  p.rect(53, apexY - 2, 7, 4, 'B');        // ridge cap
  p.hline(53, apexY - 2, 7, 'o');

  // --- wall
  p.rect(14, 38, 84, 27, 'b');
  for (let x = 14; x < 98; x += 6) p.vline(x, 38, 27, 'B');
  for (let x = 17; x < 98; x += 6) p.vline(x, 38, 27, 'n');
  p.vline(14, 38, 27, 'o');
  p.vline(97, 38, 27, 'o');

  // --- stone footing
  p.rect(11, 62, 90, 9, 'G');
  p.hline(11, 62, 90, 'o');
  for (let x = 11; x < 101; x += 10) p.vline(x, 63, 8, 'o');
  for (let x = 16; x < 101; x += 10) p.vline(x, 67, 4, 'o');
  p.hline(11, 66, 90, 'o');
  speckle(p, 12, 63, 88, 8, 'g', 0.18, 91);

  // --- door: arched, planked, gold ring handle
  arch(p, 56, 67, 9, 25, 'n');
  arch(p, 56, 66, 7, 23, 'b');
  for (let x = 51; x <= 61; x += 3) p.vline(x, 46, 21, 'n');
  p.set(60, 57, 'y');
  p.set(60, 58, 'y');

  // --- windows: shutters, crossbars, lamp light inside
  for (const wx of [24, 74]) {
    p.rect(wx, 42, 18, 16, 'n');
    p.rect(wx + 2, 44, 14, 12, 'y');
    p.rect(wx + 3, 45, 12, 10, 't');
    p.rect(wx + 5, 47, 8, 6, 'y');
    p.hline(wx + 2, 49, 14, 'n');
    p.vline(wx + 8, 44, 12, 'n');
    p.hline(wx, 41, 18, 'B');              // lintel
    p.hline(wx, 58, 18, 'B');              // sill
  }

  // --- step in front of the door
  p.rect(44, 68, 25, 3, 'g');
  p.hline(44, 68, 25, 'o');
  p.hline(44, 70, 25, 'G');

  p.outline();
  return p.rows();
}

// 40x24 hanging sign: board and ironwork only -- the guild name is drawn on
// top of it with the bitmap font.
function buildLodgeSign(): string[] {
  // 64x24. "DELVERS" measures 48px at the 8px font size (7 glyphs of 6px plus
  // 1px tracking), so the face is 62px wide: 48 for the name and 7px of clear
  // board either side. The old 40px board cut the D and pushed the S off the
  // end.
  const p = new Px(64, 24);
  for (const hx of [16, 47]) {             // iron hooks
    p.vline(hx, 1, 5, 'l');
    p.set(hx + 1, 1, 'l');
    p.set(hx + 1, 2, 'g');
    p.set(hx, 5, 'g');
  }
  p.rect(1, 6, 62, 16, 'b');               // board
  p.hline(1, 6, 62, 'B');                  // lit top edge
  p.hline(1, 7, 62, 'B');
  p.hline(1, 8, 62, 'n');                  // groove above the lettering
  p.hline(1, 19, 62, 'n');                 // groove below it
  p.rect(1, 20, 62, 2, 'n');               // shadowed bottom edge
  // Plank seams live in the top and bottom bands only. Rows 9-18 are left
  // flat, because the guild name is drawn over them with the bitmap font and
  // a seam running through the letters turned "DELVERS" into "ELYER".
  for (let x = 11; x < 62; x += 10) {
    p.vline(x, 6, 3, 'n');
    p.vline(x, 19, 3, 'n');
  }
  for (const c of [[3, 7], [60, 7], [3, 20], [60, 20]]) {
    p.set(c[0] ?? 0, c[1] ?? 0, 'y');      // rivets
  }
  p.outline();
  return p.rows();
}

// 16x16 campfire, two frames. The logs never move; only the flame does.
function buildCampfire(tall: boolean): string[] {
  const p = new Px(16, 16);
  p.rect(3, 11, 10, 3, 'n');               // crossed logs
  p.hline(3, 11, 10, 'b');
  p.set(4, 10, 'b');
  p.set(11, 10, 'b');
  for (const sx of [1, 5, 9, 12]) {        // ring of stones
    p.rect(sx, 13, 3, 2, 'G');
    p.hline(sx, 13, 3, 'g');
  }
  if (tall) {
    p.rect(6, 3, 4, 8, 't');
    p.rect(7, 5, 2, 6, 'y');
    p.set(7, 2, 't');
    p.set(5, 6, 'r');
    p.set(10, 6, 'r');
    p.set(11, 3, 'y');
  } else {
    p.rect(5, 5, 6, 6, 't');
    p.rect(6, 7, 4, 4, 'y');
    p.set(6, 4, 't');
    p.set(9, 4, 't');
    p.set(4, 8, 'r');
    p.set(11, 8, 'r');
    p.set(3, 3, 'y');
  }
  p.outline();
  return p.rows();
}

// 24x40 pine, three stacked skirts of needles. Night silhouette.
function buildTreePine(): string[] {
  const p = new Px(24, 40);
  p.rect(10, 30, 4, 9, 'n');               // trunk
  p.vline(10, 30, 9, 'b');
  const tiers: readonly (readonly [number, number, number])[] = [
    [4, 3, 9], [14, 6, 10], [24, 9, 11]
  ];
  for (const t of tiers) {
    const [top, half0, rows] = t;
    for (let i = 0; i < rows; i++) {
      const half = Math.min(10, half0 + Math.round((i * 2) / 3));
      p.hline(12 - half, top + i, half * 2 + 1, 'E');
      p.hline(12 - half, top + i, half + 1, 'e');
      if (i === rows - 1) p.hline(12 - half, top + i, half * 2 + 1, 'E');
    }
  }
  p.set(12, 2, 'E');
  p.set(12, 1, 'E');
  p.outline();
  return p.rows();
}

// 16x16 fence section. The rails run the full width with no end cap, so
// copies laid side by side join into one continuous fence.
function buildFence(): string[] {
  const p = new Px(16, 16);
  for (const y of [4, 9]) {
    p.hline(0, y, 16, 'o');
    p.hline(0, y + 1, 16, 'B');
    p.hline(0, y + 2, 16, 'b');
    p.hline(0, y + 3, 16, 'o');
  }
  for (const x of [2, 10]) {               // posts, pointed tops
    p.rect(x, 2, 4, 14, 'b');
    p.vline(x, 2, 14, 'B');
    p.vline(x + 3, 2, 14, 'n');
    p.set(x, 2, 'o');
    p.set(x + 3, 2, 'o');
    p.set(x + 1, 1, 'B');
    p.set(x + 2, 1, 'b');
    p.set(x + 1, 0, 'o');
    p.set(x + 2, 0, 'o');
    p.set(x, 1, 'o');
    p.set(x + 3, 1, 'o');
    p.vline(x - 1, 2, 14, 'o');
    p.vline(x + 4, 2, 14, 'o');
    p.hline(x, 15, 4, 'o');
  }
  return p.rows();
}

// 12x14 barrel: staves plus two iron hoops.
function buildBarrel(): string[] {
  const p = new Px(12, 14);
  for (let y = 1; y < 13; y++) {
    const inset = y <= 2 || y >= 11 ? 2 : 1;
    p.hline(inset, y, 12 - inset * 2, 'b');
  }
  p.vline(2, 3, 8, 'B');
  p.vline(3, 3, 8, 'B');
  p.vline(8, 3, 8, 'n');
  p.vline(9, 3, 8, 'n');
  p.hline(2, 4, 8, 'l');                   // hoops
  p.hline(2, 9, 8, 'l');
  p.hline(3, 1, 6, 'B');                   // lid
  p.hline(3, 2, 6, 'b');
  p.outline();
  return p.rows();
}

// 14x12 crate: boards with a diagonal brace.
function buildCrate(): string[] {
  const p = new Px(14, 12);
  p.rect(1, 1, 12, 10, 'b');
  p.hline(1, 1, 12, 'B');
  p.hline(1, 2, 12, 'B');
  p.hline(1, 10, 12, 'n');
  p.vline(1, 1, 10, 'B');
  p.vline(12, 1, 10, 'n');
  p.hline(1, 5, 12, 'n');
  for (let i = 0; i < 8; i++) p.set(3 + i, 9 - i, 'n');
  for (let i = 0; i < 8; i++) p.set(3 + i, 8 - i, 'B');
  p.outline();
  return p.rows();
}

Object.assign(SPRITES, {
  stage_bg_1: STAGE_BG_1,
  stage_bg_2: STAGE_BG_2,
  stage_bg_3: STAGE_BG_3,
  stage_bg_4: STAGE_BG_4,
  stage_bg_5: STAGE_BG_5,
  stage_bg_6: STAGE_BG_6,
  stage_bg_7: STAGE_BG_7,
  stage_bg_8: STAGE_BG_8,
  stage_bg_9: STAGE_BG_9,
  stage_bg_10: STAGE_BG_10,
  lodge: buildLodge(),
  lodge_sign: buildLodgeSign(),
  campfire_0: buildCampfire(false),
  campfire_1: buildCampfire(true),
  tree_pine: buildTreePine(),
  fence: buildFence(),
  barrel: buildBarrel(),
  crate: buildCrate(),
} satisfies Record<string, Rows>);


// ---------------------------------------------------------------------------
// Decoder + public API.
// ---------------------------------------------------------------------------

const cache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): readonly [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function decode(name: string, rows: Rows): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sprites: 2d context unavailable');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row === undefined || row.length !== w) {
      throw new Error('sprites: ragged rows in "' + name + '" at row ' + String(y));
    }
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === undefined || ch === '.') continue;
      const hex = PALETTE[ch];
      if (hex === undefined) {
        throw new Error('sprites: unknown palette char "' + ch + '" in "' + name + '"');
      }
      const [r, g, b] = hexToRgb(hex);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function mirror(rows: Rows): string[] {
  return rows.map((row) => row.split('').reverse().join(''));
}

function rowsFor(name: string): Rows {
  const direct = SPRITES[name];
  if (direct) return direct;
  if (name.endsWith('_flip')) {
    const base = SPRITES[name.slice(0, -'_flip'.length)];
    if (base) return mirror(base);
  }
  throw new Error('sprites: unknown sprite "' + name + '"');
}

/** Decode every sprite into an offscreen canvas. Call once at boot. */
export function initSprites(): void {
  for (const name of Object.keys(SPRITES)) {
    if (!cache.has(name)) {
      const rows = SPRITES[name];
      if (rows) cache.set(name, decode(name, rows));
    }
  }
}

/** Fetch a decoded sprite canvas. Names ending in '_flip' are mirrored lazily. */
export function spr(name: string): HTMLCanvasElement {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = decode(name, rowsFor(name));
  cache.set(name, canvas);
  return canvas;
}

/** Pixel dimensions of a sprite (does not require initSprites). */
export function sprSize(name: string): { w: number; h: number } {
  const rows = rowsFor(name);
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** All registered sprite names, in sheet order (used by tests). */
export function debugSpriteNames(): string[] {
  return Object.keys(SPRITES);
}
