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

// Startled reaction: both arms thrown straight up, legs spread — the
// surprise reads from the posture alone (no "!" glyph).
const HERO_REACT: Rows = [
  '.ooo........ooo.',
  '.ofoolggggGoofo.',
  '.oroolggggGooro.',
  '.oroogggGGGooro.',
  '.orooGGGGGGooro.',
  '.oro.oooooo.oro.',
  '.orooBBBBbnooro.',
  '.oooobbbbbnoooo.',
  '....obbbbbno....',
  '....obnnnnno....',
  '....oooooooo....',
  '....oCo..oCo....',
  '...onno..onno...',
  '...oooo..oooo...',
  '................',
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

// T3 rope ladder coil: tied bundle of rope wraps with a loose end.
const ICON_T3: Rows = [
  '................',
  '................',
  '................',
  '..oooooooooooo..',
  '..obnbBbbbnbbo..',
  '..oooooooooooo..',
  '..obnbBbbbnbbo..',
  '..oooooooooooo..',
  '..obnbBbbbnbbo..',
  '..oooooooooooo..',
  '..obnbBbbbnbbo..',
  '..oooooooooooo..',
  '..........obo...',
  '..........obo...',
  '..........ooo...',
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

// ---------------------------------------------------------------------------
// Event icons (16x16 emblems, 1px outline).
// ---------------------------------------------------------------------------

// Dark side tunnel: dirt arch around a black opening.
const EV_CAVE: Rows = [
  '................',
  '................',
  '....oooooooo....',
  '..oobbbbbbbboo..',
  '.obbbooooooobbo.',
  '.obboSSSSSSobbo.',
  '.obboSSSSSSobbo.',
  '.obboSSSSSSobbo.',
  '.obboSSSSSSobbo.',
  '.obboSSSSSSobbo.',
  '.obboSSSSSSobbo.',
  '.oooooooooooooo.',
  '................',
  '................',
  '................',
  '................',
];

// Goblin face: green, pointy ears, yellow eyes, fanged grin.
const EV_GOBLIN: Rows = [
  '................',
  '................',
  '.oo..oooooo..oo.',
  '.oeooeeeeeeooeo.',
  '..oeeeeeeeeeeo..',
  '..oeeeeeeeeeeo..',
  '..oeyyeeeeyyeo..',
  '..oeyoeeeeoyeo..',
  '..oeeeeeeeeeeo..',
  '..oeoRRRRRRoeo..',
  '..oeoRwRRwRoeo..',
  '..oEeooooooeEo..',
  '...oEEeeeeEEo...',
  '....oooooooo....',
  '................',
  '................',
];

// Broken bridge: two plank stubs, a falling piece in the gap.
const EV_BRIDGE: Rows = [
  '................',
  '................',
  '................',
  '................',
  '.ono.........ono',
  '.ono.........ono',
  'oooooo.....ooooo',
  'oBbBbo.....oBbBo',
  'oBbbbBo...obBbBo',
  'ooooooo...oooooo',
  '......oooo......',
  '......obbo......',
  '......oooo......',
  '................',
  '................',
  '................',
];

// Glinting ore vein: gray rock crossed by a gold seam, sparkle above.
const EV_VEIN: Rows = [
  '...........w....',
  '..........w.w...',
  '...........w....',
  '................',
  '....oooooooo....',
  '..ooggggggggoo..',
  '.ogggyyggggggGo.',
  '.ogggggyyggggGo.',
  '.oggggggyyGggGo.',
  '.ogGgggggyyggGo.',
  '.oGgggggggyyGGo.',
  '..oGGgggggGGoo..',
  '...oooooooooo...',
  '................',
  '................',
  '................',
];

// Fallen merchant pack: tipped backpack, spilled coin.
const EV_CORPSE: Rows = [
  '................',
  '................',
  '................',
  '................',
  '...oooo.........',
  '..obBbo.........',
  '..obBBBbno......',
  '..obBBBbbno.....',
  '.obbBBbbbno.....',
  '.obbbbbbnno.oo..',
  '.onbbbnnnnooyyo.',
  '.oooooooooooooo.',
  '................',
  '................',
  '................',
  '................',
];

// Vertical pit: dark ellipse hole in the ground.
const EV_PIT: Rows = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....oooooooo....',
  '..oosSSSSSSsoo..',
  '.oosSooooooSsoo.',
  '.osSooooooooSso.',
  '..oossoooossoo..',
  '....oooooooo....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Stone gatekeeper face: square golem head, glowing eyes, mouth slit.
const EV_GOLEM: Rows = [
  '................',
  '................',
  '..oooooooooooo..',
  '.ogggggggggggGo.',
  '.ogGGGGGGGGGGGo.',
  '.oGovoGGGGovoGo.',
  '.oGoooGGGGoooGo.',
  '.ogggGggggGgggo.',
  '.ogggggggggggGo.',
  '.oGosssssssoGGo.',
  '.oGGooooooooGGo.',
  '.oGGGGGGGGGGGGo.',
  '..oooooooooooo..',
  '................',
  '................',
  '................',
];

// Poison swamp: green pool, rising bubble rings.
const EV_SWAMP: Rows = [
  '..........o.....',
  '.........o.o....',
  '..........o.....',
  '....o...........',
  '...o.o..........',
  '....o...........',
  '..oooooooooooo..',
  '.oeeEeeeeeEeeeo.',
  '.oeeoeeeeoeeeEo.',
  '.oEeeeEeeeeEeeo.',
  '.oeeEeeeeEeeEeo.',
  '..oEEeeEEeeEEo..',
  '...oooooooooo...',
  '................',
  '................',
  '................',
];

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

// Underground stream: banded blue water with white caps.
const EV_WATER: Rows = [
  '................',
  '................',
  '................',
  '................',
  '..oooooooooooo..',
  '.ocwcccwccwccco.',
  '.oCcccCcccCccCo.',
  '.oCCcCCcCCcCCCo.',
  '.oCCCuCCCuCCCCo.',
  '.ouCuuCuuCuuCuo.',
  '.ouuuuuuuuuuuuo.',
  '..oooooooooooo..',
  '................',
  '................',
  '................',
  '................',
];

// Armored knight: great helm with plume and visor slit.
const EV_KNIGHT: Rows = [
  '.......oro......',
  '......orro......',
  '...oooooooooo...',
  '..olllllllllGo..',
  '..ollllllllgGo..',
  '..olllllllllGo..',
  '..oloooooooogo..',
  '..ollllllllgGo..',
  '..ollllllllgGo..',
  '..olloloollgGo..',
  '..oGlllllllGGo..',
  '...oGGGGGGGGo...',
  '....oooooooo....',
  '................',
  '................',
  '................',
];

// Collapse: falling rock chunks with motion dashes.
const EV_COLLAPSE: Rows = [
  '................',
  '..oooo..........',
  '.oggGGo.........',
  '.ogGGGo..oooo...',
  '..oooo..ogggGo..',
  '....o...ogGGGo..',
  '....o....oooo...',
  '......o.......o.',
  '....ooooo.....o.',
  '...ogggGGo......',
  '...oGgGGGo......',
  '....ooooo.......',
  '..o.......o.....',
  '..o.......o.....',
  '................',
  '................',
];

// Sleeping dragon: closed eye, snout, nostril, drifting z.
const EV_DRAGON: Rows = [
  '...........www..',
  '.............w..',
  '..ooooooo..www..',
  '.orrrrrrroo.....',
  '.orrrrrrrrrroo..',
  '.orrooorrrrrrro.',
  '.orrrRRrrrrrrRo.',
  '.orrrrrrrrrroRo.',
  '.oRRrrrrrrrrrRo.',
  '..oRRrrrrrrrRo..',
  '...ooooooooooo..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Large rare crystal: teal spire with side shards.
const EV_DEEPVEIN: Rows = [
  '................',
  '.......oo.......',
  '......ovvo......',
  '......owvvo.....',
  '.....ovwvvo.....',
  '.....ovwvvvo....',
  '.....ovwvvvo....',
  '..oo.ovvvvvo....',
  '.ovvoovvvvvooo..',
  '.ovvvovvvvvovvo.',
  '.owvvovvvvvovco.',
  '.ovvvovuvvvovco.',
  '.oooooooooooooo.',
  '................',
  '................',
  '................',
];

// Final guardian mask: gold-crowned purple face, twin glowing eyes.
const EV_GUARDIAN: Rows = [
  '.o....oooo....o.',
  'oyo...oyyo...oyo',
  'oyyo.oyyyyo.oyyo',
  'oyyyooyyyyooyyyo',
  '.oyyyyyyyyyyyyo.',
  '.oPPPPPPPPPPPPo.',
  '.oPovvoPPovvoPo.',
  '.oPovvoPPovvoPo.',
  '.oPPooooooooPPo.',
  '.oqPPPqqqqPPPqo.',
  '.oqPPooooooPPqo.',
  '..oqPPPPPPPPqo..',
  '...oqqqqqqqqo...',
  '....oooooooo....',
  '................',
  '................',
];

// ---------------------------------------------------------------------------
// Loot icons (16x16, 1px outline).
// ---------------------------------------------------------------------------

// L1 copper ore: gray chunk with orange copper nuggets.
const LOOT_L1: Rows = [
  '................',
  '................',
  '................',
  '................',
  '....ooooooo.....',
  '...oggggggGo....',
  '..ogttgggggGo...',
  '..ogtggggttGo...',
  '..oggggggttGo...',
  '..ogGggggggGo...',
  '..oGGgggggGGo...',
  '...oGGGGGGGo....',
  '....ooooooo.....',
  '................',
  '................',
  '................',
];

// L2 cave mushroom: purple cap, pale stem, light spots.
const LOOT_L2: Rows = [
  '................',
  '................',
  '....oooooooo....',
  '...opppppppPo...',
  '..oppwpppppPPo..',
  '..opppppwppPPo..',
  '..oPPpppppPPPo..',
  '..oooooooooooo..',
  '.....owllo......',
  '.....owllo......',
  '.....owllo......',
  '....owwlllo.....',
  '....ooooooo.....',
  '................',
  '................',
  '................',
];

// L3 goblin fang: curved ivory tooth.
const LOOT_L3: Rows = [
  '................',
  '................',
  '................',
  '....oooo........',
  '...owwwlo.......',
  '...owwwlo.......',
  '....owwlo.......',
  '....owwlo.......',
  '.....owlo.......',
  '.....owlo.......',
  '......owlo......',
  '.......owo......',
  '........oo......',
  '................',
  '................',
  '................',
];

// L4 iron ore: angular block with silver flecks.
const LOOT_L4: Rows = [
  '................',
  '................',
  '................',
  '................',
  '...oooooooooo...',
  '..ollGGGGGGGso..',
  '..olGGllGGGGso..',
  '..olGGGGGllGso..',
  '..olGllGGGGGso..',
  '..osGGGllGGsso..',
  '..osssssssssso..',
  '...oooooooooo...',
  '................',
  '................',
  '................',
  '................',
];

// L5 glowing moss: teal clump with drifting glow specks.
const LOOT_L5: Rows = [
  '................',
  '................',
  '................',
  '................',
  '....w.....w.....',
  '................',
  '....oo..oo......',
  '...ovvoovvo.....',
  '..ovvvvvvvvoo...',
  '.ovvevvvevvvvo..',
  '.ovevvevvvevvo..',
  '.oEvvvevevvEeo..',
  '..oEEeeEeeEEo...',
  '...oooooooooo...',
  '................',
  '................',
];

// L6 old pocket watch: gold case, white face, chain.
const LOOT_L6: Rows = [
  '...o............',
  '....o...........',
  '.....o..........',
  '......oYYo......',
  '.....oooooo.....',
  '...ooyyyyyyoo...',
  '..oyowwwwwwoYo..',
  '..oyowwwowwoYo..',
  '..oyowwwoowoYo..',
  '..oyowwwwwwoYo..',
  '..oYowwwwwwoYo..',
  '...oYYyyyyYYo...',
  '....oYYYYYYo....',
  '.....oooooo.....',
  '................',
  '................',
];

// L7 silver ore: brown rock threaded with bright silver.
const LOOT_L7: Rows = [
  '................',
  '................',
  '................',
  '................',
  '...oBbbbbbbno...',
  '..oBllbbbbbbno..',
  '..obblwlbbllno..',
  '..obbbbllwlbno..',
  '..onbllbbbbbno..',
  '..onnbbbbbnnno..',
  '...onnnnnnnno...',
  '....oooooooo....',
  '................',
  '................',
  '................',
  '................',
];

// L8 knight crest: red shield charged with a white cross.
const LOOT_L8: Rows = [
  '................',
  '................',
  '..oooooooooooo..',
  '.orrrrwwrrrrRo..',
  '.orrrrwwrrrrRo..',
  '.owwwwwwwwwwwo..',
  '.orrrrwwrrrrRo..',
  '.orrrrwwrrrrRo..',
  '..orrrwwrrrRo...',
  '..orrrwwrrrRo...',
  '...orrwwrrRo....',
  '....orwwrRo.....',
  '.....orro.......',
  '......oo........',
  '................',
  '................',
];

// L9 dragon scale: gold-rimmed crimson scale, wet shine.
const LOOT_L9: Rows = [
  '................',
  '................',
  '.......oo.......',
  '......oyyo......',
  '.....oyrryo.....',
  '....oyrrrryo....',
  '...oyrrwrrryo...',
  '...oyrwrrrryo...',
  '..oyrrrrrrrryo..',
  '..oyrrrrRRrryo..',
  '..oyrRRRRRRryo..',
  '..oyyRRRRRRyyo..',
  '...oyyyyyyyyo...',
  '....oooooooo....',
  '................',
  '................',
];

// L10 abyssal crystal: faceted blue gem with teal edge glow.
const LOOT_L10: Rows = [
  '................',
  '................',
  '.......oo.......',
  '......ovvo......',
  '.....ovwcco.....',
  '....ovwcccco....',
  '...ovwccccuco...',
  '..ovccccccuuco..',
  '...occccuuuco...',
  '....occuuuco....',
  '.....ocuuco.....',
  '......ocuo......',
  '.......oo.......',
  '................',
  '................',
  '................',
];

// L11 guardian core: gold-caged orb with a white-hot heart.
const LOOT_L11: Rows = [
  '................',
  '................',
  '................',
  '...ooyyyyyyoo...',
  '..oyyoPPPPoyyo..',
  '..oyoPPvvPPoyo..',
  '.oyoPPvwwvPPoyo.',
  '.oyoPvwwwwvPoyo.',
  '.oyoPvwwwwvPoyo.',
  '.oyoPPvvvvPPoyo.',
  '..oyoPPPPPPoyo..',
  '..oYyoqqqqoyYo..',
  '...ooYYYYYYoo...',
  '.....oooooo.....',
  '................',
  '................',
];

// ---------------------------------------------------------------------------
// Misc UI / markers.
// ---------------------------------------------------------------------------

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

const HEART: Rows = [
  '.oo..oo.',
  'orroorro',
  'orwrrrro',
  'orrrrrRo',
  '.orrrRo.',
  '..orRo..',
  '...oo...',
  '........',
];

const WEIGHT_PIP: Rows = [
  'oooo',
  'olgo',
  'ogGo',
  'oooo',
];

// ---------------------------------------------------------------------------
// Wall decor: transparent 16x16 props scattered inside the shaft to add
// points of interest, outlined like characters.
// ---------------------------------------------------------------------------

// Cluster of two glowing-blue cave mushrooms.
const DECO_MUSHROOM: Rows = [
  '................',
  '................',
  '................',
  '..ooooo.........',
  '.occccco........',
  '.ocwccco........',
  '.occcwco........',
  '.occccCo........',
  '.ooooooo.ooo....',
  '...ollo.occco...',
  '...ollo.ocwCo...',
  '...ollo.ooooo...',
  '...ollo..olo....',
  '...oooo..ooo....',
  '................',
  '................',
];

// Old bone half-buried in the shaft wall.
const DECO_BONE: Rows = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.oo........oo...',
  'owwoooooooowwo..',
  'owwwwwwwwwlllo..',
  'owwoooooooowwo..',
  '.oo........oo...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Small teal crystal pair sprouting from the rock.
const DECO_CRYSTAL: Rows = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....oo.........',
  '....ovvo........',
  '....owvo........',
  '...ovwvvo..oo...',
  '...ovwvvo.ovvo..',
  '...ovvvvo.ovco..',
  '...ovvcvo.ovco..',
  '...oooooo.oooo..',
  '................',
  '................',
];

// Roots dangling from the tunnel ceiling (touches the top edge).
const DECO_ROOT: Rows = [
  '...ono...ono....',
  '...ono...ono....',
  '...ono...onno...',
  '...onno...ono...',
  '....ono...ono...',
  '....ono...ono...',
  '....ono...ono...',
  '....ono...ooo...',
  '....ono.........',
  '....ono.........',
  '....obo.........',
  '....ooo.........',
  '................',
  '................',
  '................',
  '................',
];

// Luminous moss patch with drifting spores.
const DECO_GLOW: Rows = [
  '................',
  '................',
  '................',
  '................',
  '....w...........',
  '............w...',
  '...oooooo.......',
  '..ovvvvvvo......',
  '.ovvwwvvvvo.....',
  '.ovwwwvevvvo....',
  '.ovvwvvvevvo....',
  '..ovvvevvvo.....',
  '..oEevvEeo......',
  '...oooooo.......',
  '................',
  '................',
];

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

const TILE_S0_C: Rows = [
  'NNNNNNNNNNNNNNNN',
  'NBBBBBBBBBBBBBnN',
  'NBeeebbbbeeebbnN',
  'NBEeebbbbbEebbnN',
  'NBbbbnbbbbbbbbnN',
  'NBbbbnbbbbBbbbnN',
  'NBbbbbnbbbbbbbnN',
  'NBbbbbnbbbbbbbnN',
  'NBbnbbnbbbbbbbnN',
  'NBbbbbbnbbbbbbnN',
  'NBbbbbbbbbnbbbnN',
  'NBbbBbbbbbbbbbnN',
  'NBbbbbbbbbbbbbnN',
  'NBbbbbbbnbbbbbnN',
  'NBnnnnnnnnnnnnnN',
  'NNNNNNNNNNNNNNNN',
];

const TILE_S1_C: Rows = [
  'SSSSSSSSSSSSSSSS',
  'SgggggggggggggsS',
  'SgGGGGGGGGGGGGsS',
  'SgGGllGGGGGGGGsS',
  'SgGGGlGGGGGwGGsS',
  'SgGGGGGGGGwwwGsS',
  'SgGGGGGGGGGwGGsS',
  'SgGsGGGGGGGGGGsS',
  'SgGGGGGllGGGGGsS',
  'SgGGGGGGllGGGGsS',
  'SgGGGGGGGGGGsGsS',
  'SgGGGGGGGGGGGGsS',
  'SglGGGGGGGGGGGsS',
  'SgGGGGGGGGGGGGsS',
  'SgssssssssssssSS',
  'SSSSSSSSSSSSSSSS',
];

const TILE_S2_C: Rows = [
  'QQQQQQQQQQQQQQQQ',
  'QpppppppppppppqQ',
  'QpPPPPPPPPPPPPqQ',
  'QpPPppPPPPPPPPqQ',
  'QpPPpwpPPPPPPPqQ',
  'QpPPPpPPPPqPPPqQ',
  'QpPPPPPPPPPPPPqQ',
  'QpPPPPPPPppPPPqQ',
  'QpPPPPPPPpwpPPqQ',
  'QpPPPPPPPPpPPPqQ',
  'QpPqPPPPPPPPPPqQ',
  'QpPPPPPPPPPPPPqQ',
  'QpPPPPppPPPPPPqQ',
  'QpPPPPPPPPPPPPqQ',
  'QpqqqqqqqqqqqqqQ',
  'QQQQQQQQQQQQQQQQ',
];

const TILE_S3_C: Rows = [
  'UUUUUUUUUUUUUUUU',
  'UcccccccccccccuU',
  'UcCCCCCCCCCCCCuU',
  'UcCCvvCCCCCCCCuU',
  'UcCvwwvCCCCCCCuU',
  'UcCCvvCCCCCuCCuU',
  'UcCCCCCCCCCCCCuU',
  'UcCCCCCCCvCCCCuU',
  'UcCCCCCCCCCCCCuU',
  'UcCCCCCCCCvvCCuU',
  'UcCCCCCCCvwvCCuU',
  'UcCuCCCCCCvCCCuU',
  'UcCCCCCCCCCCCCuU',
  'UcCCCCCCCCCCCCuU',
  'UcuuuuuuuuuuuuuU',
  'UUUUUUUUUUUUUUUU',
];

// Shaft walls: bgDark base, faint sediment dashes (L = bgLight) and a few
// near-black diagonal pick-scratch hatches ('o' passes through the remap)
// so the shaft reads as hand-dug.
const WALL_TEMPLATE: Rows = [
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dLLddddddddddLLd',
  'ddddddddddoddddd',
  'dddddddddodddddd',
  'ddddddddoddddddd',
  'dddddddoddLLdddd',
  'dddddddddddddddd',
  'ddLLLddddddddddd',
  'dddddodddddddddd',
  'ddddoddddddLLddd',
  'dddodddddddddddd',
  'dddddddddddddddd',
  'ddddddddLLLddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
];

// stratum -> palette chars for [earth, earthDark, accent] and [bgDark, bgLight]
const STRATUM_TILE_CHARS: readonly (readonly [string, string, string])[] = [
  ['b', 'n', 'B'], // 0 表土 brown dirt
  ['G', 's', 'g'], // 1 岩盤 gray stone
  ['P', 'q', 'p'], // 2 深層 purple rock
  ['C', 'u', 'c'], // 3 深淵 abyssal blue
];
const STRATUM_WALL_CHARS: readonly (readonly [string, string])[] = [
  ['N', 'n'],
  ['S', 's'],
  ['Q', 'q'],
  ['U', 'u'],
];

function remap(rows: Rows, map: Record<string, string>): string[] {
  return rows.map((row) => {
    let out = '';
    for (const ch of row) out += map[ch] ?? ch;
    return out;
  });
}

// ---------------------------------------------------------------------------
// 9-slice UI chrome and the two large set pieces, assembled procedurally so
// the repeated edges stay perfectly uniform.
// ---------------------------------------------------------------------------

function dots(count: number): string {
  return '.'.repeat(count);
}

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

function buildBalance(): string[] {
  // Merchant's balance, side view: brass beam and pole, two hanging pans,
  // wooden base.
  const rows: string[] = [];
  const empty = dots(32);
  rows.push(empty, empty, empty);
  rows.push(dots(14) + 'oooo' + dots(14));
  rows.push(dots(13) + 'ooyyoo' + dots(13));
  rows.push(dots(13) + 'oyyyyo' + dots(13));
  rows.push(dots(2) + 'o'.repeat(28) + dots(2));
  rows.push(dots(2) + 'o' + 'y'.repeat(26) + 'o' + dots(2));
  rows.push(dots(2) + 'o' + 'Y'.repeat(26) + 'o' + dots(2));
  rows.push(dots(2) + 'o'.repeat(28) + dots(2));
  const chains = dots(4) + 'o' + dots(9) + 'oyYo' + dots(9) + 'o' + dots(4);
  for (let i = 0; i < 4; i++) rows.push(chains);
  rows.push('oooooooooo' + dots(4) + 'oyYo' + dots(4) + 'oooooooooo');
  rows.push('oYyyyyyyYo' + dots(4) + 'oyYo' + dots(4) + 'oYyyyyyyYo');
  rows.push('.oYYYYYYo.' + dots(4) + 'oyYo' + dots(4) + '.oYYYYYYo.');
  rows.push('..oooooo..' + dots(4) + 'oyYo' + dots(4) + '..oooooo..');
  const pole = dots(14) + 'oyYo' + dots(14);
  for (let i = 0; i < 8; i++) rows.push(pole);
  rows.push(dots(10) + 'o'.repeat(12) + dots(10));
  rows.push(dots(9) + 'o' + 'b'.repeat(12) + 'o' + dots(9));
  rows.push(dots(8) + 'o' + 'b'.repeat(14) + 'o' + dots(8));
  rows.push(dots(8) + 'o' + 'n'.repeat(14) + 'o' + dots(8));
  rows.push(dots(8) + 'o'.repeat(16) + dots(8));
  rows.push(empty);
  return rows;
}

function buildLetter(): string[] {
  // Folded parchment with envelope flap creases and a red wax seal.
  const grid: string[][] = [];
  for (let y = 0; y < 32; y++) {
    const row: string[] = [];
    for (let x = 0; x < 32; x++) row.push('.');
    grid.push(row);
  }
  const put = (y: number, x: number, ch: string): void => {
    const row = grid[y];
    if (row && x >= 0 && x < 32) row[x] = ch;
  };
  // paper body rows 6-25, cols 3-28
  for (let y = 6; y <= 25; y++) {
    for (let x = 3; x <= 28; x++) {
      const edge = y === 6 || y === 25 || x === 3 || x === 28;
      put(y, x, edge ? 'o' : 'w');
    }
  }
  // soft shadow along the bottom inner edge
  for (let x = 4; x <= 27; x++) put(24, x, 'l');
  // envelope flap creases from the top corners toward the seal
  for (let i = 0; i <= 9; i++) {
    put(7 + i, 4 + i, 'l');
    put(7 + i, 27 - i, 'l');
  }
  // horizontal fold crease below the seal
  for (let x = 4; x <= 27; x++) put(21, x, 'l');
  // wax seal (rows 15-20, cols 13-18)
  const seal = ['.oooo.', 'orrrro', 'orRRro', 'orRRro', 'orrrro', '.oooo.'];
  for (let sy = 0; sy < seal.length; sy++) {
    const srow = seal[sy];
    if (!srow) continue;
    for (let sx = 0; sx < srow.length; sx++) {
      const ch = srow[sx];
      if (ch && ch !== '.') put(15 + sy, 13 + sx, ch);
    }
  }
  return grid.map((row) => row.join(''));
}

function buildWeb(): string[] {
  // Corner spiderweb anchored top-left: radial spokes plus two arcs of pale
  // silk, with dew glints at crossings. Silk strands are 1px pale lines
  // (a full dark outline would double their width and clog the weave).
  const size = 16;
  const grid: string[][] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) row.push('.');
    grid.push(row);
  }
  const put = (y: number, x: number, ch: string): void => {
    const row = grid[y];
    if (row && y >= 0 && y < size && x >= 0 && x < size) row[x] = ch;
  };
  for (let i = 0; i <= 11; i++) {
    put(0, i, 'l'); // spoke along the ceiling
    put(i, 0, 'l'); // spoke down the wall
    if (i >= 1 && i <= 10) put(i, i, 'l'); // diagonal spoke
  }
  for (const r of [6, 11]) {
    for (let deg = 0; deg <= 90; deg += 6) {
      const rad = (deg * Math.PI) / 180;
      put(Math.round(r * Math.sin(rad)), Math.round(r * Math.cos(rad)), 'l');
    }
  }
  put(0, 6, 'w');
  put(6, 6, 'w');
  put(11, 0, 'w');
  return grid.map((row) => row.join(''));
}

function buildLogo(): string[] {
  // "OUTFITTER" logotype: a 5x11 letterform set composed with 1px gaps,
  // integer-scaled x2 (106x22), two-tone gold shading, then auto-traced
  // with a continuous 1px outline -> 108x24.
  const F: Record<string, readonly string[]> = {
    O: ['.yyy.', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', '.yyy.'],
    U: ['y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', 'y...y', '.yyy.'],
    T: ['yyyyy', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..'],
    F: ['yyyyy', 'y....', 'y....', 'y....', 'yyyy.', 'y....', 'y....', 'y....', 'y....', 'y....', 'y....'],
    I: ['yyyyy', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', '..y..', 'yyyyy'],
    E: ['yyyyy', 'y....', 'y....', 'y....', 'yyyy.', 'y....', 'y....', 'y....', 'y....', 'y....', 'yyyyy'],
    R: ['yyyy.', 'y...y', 'y...y', 'y...y', 'yyyy.', 'y.y..', 'y..y.', 'y..y.', 'y...y', 'y...y', 'y...y'],
  };
  const word = 'OUTFITTER';
  const glyphW = 5;
  const glyphH = 11;
  const gap = 1;
  const textW = word.length * glyphW + (word.length - 1) * gap;
  const outW = textW * 2 + 2;
  const outH = glyphH * 2 + 2;
  const grid: string[][] = [];
  for (let y = 0; y < outH; y++) {
    const row: string[] = [];
    for (let x = 0; x < outW; x++) row.push('.');
    grid.push(row);
  }
  for (let li = 0; li < word.length; li++) {
    const glyph = F[word[li] ?? ''];
    if (!glyph) continue;
    const ox = li * (glyphW + gap);
    for (let gy = 0; gy < glyphH; gy++) {
      const grow = glyph[gy];
      if (!grow) continue;
      for (let gx = 0; gx < glyphW; gx++) {
        if (grow[gx] !== 'y') continue;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const y = 1 + gy * 2 + sy;
            const x = 1 + (ox + gx) * 2 + sx;
            const row = grid[y];
            if (row) row[x] = gy * 2 + sy >= 12 ? 'Y' : 'y';
          }
        }
      }
    }
  }
  // trace a continuous 1px outline around every stroke (8-neighborhood)
  for (let y = 0; y < outH; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < outW; x++) {
      if (row[x] !== '.') continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1 && !touch; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          const nrow = grid[ny];
          const nch = nrow ? nrow[nx] : undefined;
          if (nch === 'y' || nch === 'Y') touch = true;
        }
      }
      if (touch) row[x] = 'o';
    }
  }
  return grid.map((row) => row.join(''));
}

// ---------------------------------------------------------------------------
// Sprite table (insertion order = debugSpriteNames() order).
// ---------------------------------------------------------------------------

const SPRITES: Record<string, Rows> = {
  hero_walk_0: HERO_WALK_0,
  hero_walk_1: HERO_WALK_1,
  hero_walk_2: HERO_WALK_2,
  hero_walk_3: HERO_WALK_3,
  hero_mine_0: HERO_MINE_0,
  hero_mine_1: HERO_MINE_1,
  hero_hit: HERO_HIT,
  hero_dead: HERO_DEAD,
  hero_react: HERO_REACT,
  portrait: PORTRAIT,
  ladder: LADDER,
  icon_W1: ICON_W1,
  icon_W2: ICON_W2,
  icon_W3: ICON_W3,
  icon_W4: ICON_W4,
  icon_A1: ICON_A1,
  icon_A2: ICON_A2,
  icon_A3: ICON_A3,
  icon_A4: ICON_A4,
  icon_T1: ICON_T1,
  icon_T2: ICON_T2,
  icon_T3: ICON_T3,
  icon_T4: ICON_T4,
  ev_cave: EV_CAVE,
  ev_goblin: EV_GOBLIN,
  ev_bridge: EV_BRIDGE,
  ev_vein: EV_VEIN,
  ev_corpse: EV_CORPSE,
  ev_pit: EV_PIT,
  ev_golem: EV_GOLEM,
  ev_swamp: EV_SWAMP,
  ev_chest: EV_CHEST,
  ev_water: EV_WATER,
  ev_knight: EV_KNIGHT,
  ev_collapse: EV_COLLAPSE,
  ev_dragon: EV_DRAGON,
  ev_deepvein: EV_DEEPVEIN,
  ev_guardian: EV_GUARDIAN,
  loot_L1: LOOT_L1,
  loot_L2: LOOT_L2,
  loot_L3: LOOT_L3,
  loot_L4: LOOT_L4,
  loot_L5: LOOT_L5,
  loot_L6: LOOT_L6,
  loot_L7: LOOT_L7,
  loot_L8: LOOT_L8,
  loot_L9: LOOT_L9,
  loot_L10: LOOT_L10,
  loot_L11: LOOT_L11,
  skull: SKULL,
  star: STAR,
  coin: COIN,
  heart: HEART,
  weight_pip: WEIGHT_PIP,
  deco_mushroom: DECO_MUSHROOM,
  deco_bone: DECO_BONE,
  deco_crystal: DECO_CRYSTAL,
  deco_root: DECO_ROOT,
  deco_web: buildWeb(),
  deco_glow: DECO_GLOW,
  frame: buildFrame(),
  button: buildButton(),
  balance: buildBalance(),
  letter: buildLetter(),
  logo: buildLogo(),
};

// Generated terrain: tile_s{0..3}_{a,b,c} and wall_s{0..3}.
const ACCENT_TILES: readonly Rows[] = [TILE_S0_C, TILE_S1_C, TILE_S2_C, TILE_S3_C];
for (let s = 0; s < 4; s++) {
  const tileChars = STRATUM_TILE_CHARS[s];
  const wallChars = STRATUM_WALL_CHARS[s];
  const accentTile = ACCENT_TILES[s];
  if (!tileChars || !wallChars || !accentTile) continue;
  const [earth, earthDark, accent] = tileChars;
  const [bgDark, bgLight] = wallChars;
  const tileMap = { x: earth, z: earthDark, a: accent, h: accent, m: bgDark };
  SPRITES['tile_s' + String(s) + '_a'] = remap(TILE_TEMPLATE_A, tileMap);
  SPRITES['tile_s' + String(s) + '_b'] = remap(TILE_TEMPLATE_B, tileMap);
  SPRITES['tile_s' + String(s) + '_c'] = accentTile;
  SPRITES['wall_s' + String(s)] = remap(WALL_TEMPLATE, { d: bgDark, L: bgLight });
}

// ---------------------------------------------------------------------------
// DELVERS additions. Everything below is new art for the idle-hack-and-slash
// build: weapon/armor base types, job portraits, element pips, rarity frames,
// stage icons, UI glyphs and the rare-drop burst. Same rules as above --
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
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
  '.....olggGo.....',
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
  '......oBbo......',
  '......oooo......',
];

const BASE_BOW: Rows = [
  '.......ooooo....',
  '.......oBbol....',
  '......oBbo.l....',
  '.....oBbo..l....',
  '....oBbo...l....',
  '...oBbo....l....',
  '..oBbo.....l....',
  '..oBbo.....l....',
  '..oBbo.....l....',
  '..oBbo.....l....',
  '...oBbo....l....',
  '....oBbo...l....',
  '.....oBbo..l....',
  '......oBbo.l....',
  '.......oBbol....',
  '.......ooooo....',
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
  '...oooo..oooo...',
  '...oBbo..oBno...',
  '...oBboooobno...',
  '...oBbbbbbbno...',
  '...oBbbbbbbno...',
  '...oBbnbbbbno...',
  '...oBbbnbbbno...',
  '...oBbbbnbbno...',
  '...oBbbbbbbno...',
  '...onbbbbbnno...',
  '...oonnnnnnoo...',
  '....oooooooo....',
  '................',
  '................',
];

const BASE_MEDIUM: Rows = [
  '................',
  '................',
  '..oooo....oooo..',
  '..olgo....olGo..',
  '..olggoooogGGo..',
  '..olggGGggGGGo..',
  '..olGGggGGggGo..',
  '..olggGGggGGGo..',
  '..olGGggGGggGo..',
  '..olggGGggGGGo..',
  '..olGGggGGggGo..',
  '..oGGggGGggGGo..',
  '..oGGGGGGGGGGo..',
  '..oooooooooooo..',
  '................',
  '................',
];

const BASE_HEAVY: Rows = [
  '................',
  '.oooo......oooo.',
  '.olgo......olGo.',
  '.olggoooooogGGo.',
  '.olgggoooogggGo.',
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
  '...onbbbbbbno...',
  '..onbbbbbbbbno..',
  '..orrrrrrrrrro..',
  '..oooooooooooo..',
  '..oFffffffffFo..',
  '..offoffffoffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..oFffoooofffo..',
  '..ooffffffffoo..',
  '...oooffffooo...',
  '..oolllllllloo..',
  '.ollllllllllllo.',
  '.olggggggggggGo.',
  '.oGGGGGGGGGGGGo.',
];

const JOB_GUARDIAN: Rows = [
  '...oooooooooo...',
  '..olggggggggGo..',
  '.ollgggggggggGo.',
  '.ollgggggggggGo.',
  '.ollgggggggggGo.',
  '.olooooooooooGo.',
  '.olosssssssoGGo.',
  '.oloooooooooGGo.',
  '.ollgggggggggGo.',
  '.ollgggoooggGGo.',
  '.ollgggggggGGGo.',
  '.oGGGGGGGGGGGGo.',
  '..oooooooooooo..',
  '.oolllllllllloo.',
  'ollllllllllllllo',
  'oGGggggggggGGGGo',
];

const JOB_SKIRMISHER: Rows = [
  '......oooo......',
  '.....oeeeeo.....',
  '....oeeeeeEo....',
  '...oeeeeeeEEo...',
  '..oeeeeeeeeEEo..',
  '.oeeooooooooEEo.',
  '.oeeoFffffFoEEo.',
  '.oeeofoffofoEEo.',
  '.oeeoffffffoEEo.',
  '.oeeoFffffFoEEo.',
  '.oeeooooooooEEo.',
  '.oEeeeeeeeeEEo..',
  '...oEEeeeeEEo...',
  '..oobbbbbbbboo..',
  '.obbbbbbbbbbbno.',
  '.onbbbbbbbbbnno.',
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
  '................',
  '.oooooooooooooo.',
  '.oBbbbbbbbbbbno.',
  '.oooooooooooooo.',
  '.oBboSSSSSSoBbo.',
  '.oBbollllllobbo.',
  '.oBboggbbGgoBbo.',
  '.oBboSSbbSSoBbo.',
  '.oBboSSbbSSoBbo.',
  '.oBboSSbbSSoBbo.',
  '.oBboSSbbSSoBbo.',
  '.oBboSSSSSSoBbo.',
  '.oooooooooooooo.',
  '.oBbbbbbbbbbbno.',
  '.oooooooooooooo.',
  '................',
];

const STAGE_2: Rows = [
  '................',
  '..oooooooooooo..',
  '..ogggggggggGo..',
  '..oooooooooooo..',
  '...ogggggggGo...',
  '...ogvvgggGGo...',
  '...oggvvggGGo...',
  '...oggggggGGo...',
  '...oggevvgGGo...',
  '...ogggevgGGo...',
  '...oggggggGGo...',
  '...ogvvgggGGo...',
  '..oooooooooooo..',
  '..ogggggggggGo..',
  '..oooooooooooo..',
  '................',
];

const STAGE_3: Rows = [
  '................',
  '................',
  '...oooooooooo...',
  '..oossssssssoo..',
  '..osssttssssSo..',
  '..ossstysssSSo..',
  '..ossssttssSSo..',
  '..ossssstysSSo..',
  '..ossssttsSSSo..',
  '..osstytssSSSo..',
  '..osttssssSSSo..',
  '..oossssSSSSoo..',
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
  '...oosSSSSsoo...',
  '..oosSSSSSSsoo..',
  '.oosSSSSSSSSsoo.',
  '.osSSSSSyySSSso.',
  '.osSSSSyySSSSso.',
  '.osSSSyySSSSSso.',
  '.osSyyyYYYSSSso.',
  '.osSSSSyYSSSSso.',
  '.osSSSyYSSSSSso.',
  '.osSSYYSSSSSSso.',
  '.osSSSSSSSSSSso.',
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
  '.oGssssssssssSo.',
  '.ossSSSSSSSSSSo.',
  '.oooooooooooooo.',
  '.ottyyttttyytto.',
  '.oyyttttyytttto.',
  '.ottttyyttttyyo.',
  '.ottyyttyytttto.',
  '.orrttttyyrrrro.',
  '.oooooooooooooo.',
  '.oSSSSSSSSSSsso.',
  '.osssssssssssGo.',
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
  '.oooo.oooo.oooo.',
  '.owwo.owwo.owwo.',
  '.owlo.owlo.owlo.',
  '.oooo.oooo.oooo.',
  '................',
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
    if (r > 2.1) return 'q';
    if (r > 1.0) return 'Q';
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
  const rows: string[] = [];
  rows.push(rep('o', 24));
  rows.push('o' + rep('c', 22) + 'o');
  rows.push('oc' + rep('C', 20) + 'co');
  rows.push('ocC' + rep('o', 18) + 'Cco');
  const fill = 'ocCo' + rep('u', 16) + 'oCco';
  for (let i = 0; i < 16; i++) rows.push(fill);
  rows.push('ocC' + rep('o', 18) + 'Cco');
  rows.push('oc' + rep('C', 20) + 'co');
  rows.push('o' + rep('c', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

function buildRarityRare(): string[] {
  const rows: string[] = [];
  const stud = 'oyYo' + 'yy' + rep('S', 12) + 'yy' + 'oYyo';
  const studLo = 'oyYo' + 'yY' + rep('S', 12) + 'Yy' + 'oYyo';
  const fill = 'oyYo' + rep('S', 16) + 'oYyo';
  rows.push(rep('o', 24));
  rows.push('o' + rep('y', 22) + 'o');
  rows.push('oy' + rep('Y', 20) + 'yo');
  rows.push('oyY' + rep('o', 18) + 'Yyo');
  rows.push(stud, studLo);
  for (let i = 0; i < 12; i++) rows.push(fill);
  rows.push(studLo, stud);
  rows.push('oyY' + rep('o', 18) + 'Yyo');
  rows.push('oy' + rep('Y', 20) + 'yo');
  rows.push('o' + rep('y', 22) + 'o');
  rows.push(rep('o', 24));
  return rows;
}

function buildRarityRelic(): string[] {
  const rows: string[] = [];
  const gem = 'opPqo' + 'yy' + rep('Q', 10) + 'yy' + 'oqPpo';
  const gemLo = 'opPqo' + 'yY' + rep('Q', 10) + 'Yy' + 'oqPpo';
  const fill = 'opPqo' + rep('Q', 14) + 'oqPpo';
  rows.push(rep('o', 24));
  rows.push('o' + rep('y', 4) + rep('p', 14) + rep('y', 4) + 'o');
  rows.push('oy' + rep('Y', 2) + rep('P', 16) + rep('Y', 2) + 'yo');
  rows.push('opY' + rep('q', 18) + 'Ypo');
  rows.push('opPq' + rep('o', 16) + 'qPpo');
  rows.push(gem, gemLo);
  for (let i = 0; i < 10; i++) rows.push(fill);
  rows.push(gemLo, gem);
  rows.push('opPq' + rep('o', 16) + 'qPpo');
  rows.push('opY' + rep('q', 18) + 'Ypo');
  rows.push('oy' + rep('Y', 2) + rep('P', 16) + rep('Y', 2) + 'yo');
  rows.push('o' + rep('y', 4) + rep('p', 14) + rep('y', 4) + 'o');
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
