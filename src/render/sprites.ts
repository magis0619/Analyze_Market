// OUTFITTER — pixel-art sprite sheet, decoded at boot into offscreen canvases.
// Every glyph char references PALETTE in ./palette.ts ('.' = transparent).
// Style: cross-section strata look, bold 1px dark outlines, chunky comical
// proportions. All art here is original.

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

const HERO_WALK_1: Rows = [
  '.....oooooo.....',
  '....olggggGo....',
  '....olggggGo....',
  '....ogggGGGo....',
  '....oGGGGGGo....',
  '.....oooooo.....',
  '....oBBBbno.....',
  'ooooobbbbnooooo.',
  'ofrrobbbbnorrfo.',
  'ooooobbbbnooooo.',
  '....obnnnno.....',
  '....ooooooo.....',
  '....oCo.oCo.....',
  '....oCo.oCo.....',
  '...onno.onno....',
  '...oooo.oooo....',
];

const HERO_WALK_2: Rows = [
  '.....oooooo.....',
  '....olggggGo....',
  '....olggggGo....',
  '....ogggGGGo....',
  '....oGGGGGGo....',
  '.....oooooooooo.',
  '....oBBBbnorrfo.',
  '....obbbbnooooo.',
  '....obbbbno.....',
  'ooooobbbbno.....',
  'ofrrobnnnno.....',
  'ooooooooooo.....',
  '....oCo.oCo.....',
  '....oCo.onno....',
  '...onno.oooo....',
  '...oooo.........',
];

const HERO_WALK_3: Rows = [
  '................',
  '.....oooooo.....',
  '....olggggGo....',
  '....olggggGo....',
  '....ogggGGGo....',
  '....oGGGGGGo....',
  '.....oooooo.....',
  '....oBBBbno.....',
  'ooooobbbbnooooo.',
  'ofrrobbbbnorrfo.',
  'ooooobbbbnooooo.',
  '....obnnnno.....',
  '....ooooooo.....',
  '....oCo.oCo.....',
  '...onno.onno....',
  '...oooo.oooo....',
];

const HERO_MINE_0: Rows = [
  '......ooooooo...',
  '.....olggggGo...',
  '.....oooonooo...',
  '........ono.....',
  '..ooooooono.....',
  '.olggggGofo.....',
  '.ogGGffoono.....',
  '..obbrroono.....',
  '..obbrroooo.....',
  '..obbrro........',
  '..obnnro........',
  '..onnrRo........',
  '..oCooCo........',
  '..onoonno.......',
  '..ooooooo.......',
  '................',
];

const HERO_MINE_1: Rows = [
  '................',
  '................',
  '................',
  '................',
  '..oooooo........',
  '.olggggGo.......',
  '.ogGGffoooooogo.',
  '..obbrrffnnnogo.',
  '..obbrroooooogo.',
  '..obbrro....oGo.',
  '..obnnro....oGo.',
  '..onnrRo....ooo.',
  '..oCooCo........',
  '..onoonno.......',
  '..ooooooo.......',
  '................',
];

const HERO_HIT: Rows = [
  '................',
  '......oooooo....',
  '.....olggggGo...',
  '.....olggggGo...',
  '.....ogggGGGo...',
  '.....oGGGGGGo...',
  '......oooooo....',
  'ooooooBBBbnooooo',
  'offrrobbbbnorrfo',
  'ooooooobbbnooooo',
  '.....obnnnno....',
  '.....ooooooo....',
  '....oCo...oCo...',
  '...onno..onno...',
  '...oooo..oooo...',
  '................',
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
  '...olggggggGo...',
  '..olgggggggGGo..',
  '..olgggggggGGo..',
  '..oGGGGGGGGGGo..',
  '..oooooooooooo..',
  '..oFffffffffFo..',
  '..offoffffoffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..oFffoooofffo..',
  '..ooffffffffoo..',
  '...oooffffooo...',
  '..oorrrrrrrroo..',
  '.orrrrrrrrrrrro.',
  '.oRRrrrrrrrrRRo.',
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
// Equipment icons (shop shelf items, 16x16, 1px outline).
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

// W2 dagger: short leaf blade, wooden guard.
const ICON_W2: Rows = [
  '................',
  '................',
  '................',
  '................',
  '.......oo.......',
  '......olgo......',
  '.....olggGo.....',
  '.....olggGo.....',
  '......ogGo......',
  '....oooooooo....',
  '....obbbbbbo....',
  '....oooooooo....',
  '......onno......',
  '......onno......',
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

// A4 cloak: hanging red cape, gold clasp, notched hem.
const ICON_A4: Rows = [
  '......oooo......',
  '......oyyo......',
  '....oooooooo....',
  '...orrrrrrrro...',
  '...orrrrrrrRo...',
  '..orrrrrrrrrRo..',
  '..orrrrrrrrrRo..',
  '..orrrrrrrrrRo..',
  '.orrrrrrrrrrRRo.',
  '.orrrrrrrrrrRRo.',
  '.orrRrrRrrRrRRo.',
  '.oRRRoRRRoRRRRo.',
  '.oooooooooooooo.',
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

// T2 pickaxe: wide thin head, long straight handle.
const ICON_T2: Rows = [
  '..ooooooooooo...',
  '.olggggggggggo..',
  '..oooooonoooo...',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ono......',
  '.......ooo......',
  '................',
  '................',
];

// T3 rope ladder coil: rope torus with a hanging tail.
const ICON_T3: Rows = [
  '................',
  '................',
  '....oooooooo....',
  '...obbBBBBbbo...',
  '..obbBooooBbbo..',
  '..obBo....obbo..',
  '..obBo....obbo..',
  '..obBo....obbo..',
  '..obbBooooBbbo..',
  '...obbBBBBbbo...',
  '....oooooooo....',
  '..........obo...',
  '..........obo...',
  '..........ooo...',
  '................',
  '................',
];

// T4 potion vial: corked bottle of red salve.
const ICON_T4: Rows = [
  '......oooo......',
  '......onno......',
  '......ollo......',
  '.....ollllo.....',
  '....olwllllo....',
  '....owrrrRlo....',
  '....olrrrRlo....',
  '....olrrrRlo....',
  '....olrRRRlo....',
  '....olRRRRlo....',
  '.....oooooo.....',
  '................',
  '................',
  '................',
  '................',
  '................',
];
