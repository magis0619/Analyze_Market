// Swift 移植の正解表を作る。
//
// **この JSON が契約になる。** Swift 側は同じ入力を流して、ここに書いてある
// 値と1つ残らず一致することを確かめる。私はこの環境で Swift を動かせないので、
// 「書いたものが正しいか」を確かめる手段はこれしかない。
//
//   npx tsx tools/golden.ts > swift/Tests/DelversCoreTests/Resources/golden.json
//
// 桁を落とさないこと。JSON.stringify は往復できる最短表現を出すので、
// Swift の Double(string) で元の bit がそのまま戻る。
import { Prng } from '../src/sim/prng';
import { generateItem, sellValue, tierOf, POWER_CAP } from '../src/sim/items';
import { simulateRun } from '../src/sim/combat';
import { advanceClock, dispatchProgress, OFFLINE_CAP_SEC } from '../src/sim/offline';
import { difficultyMul, itemPowerFor, stageDef, bossName, STAGES } from '../src/data/stages';
import { jobDef, retreatRuleDef, JOBS, RETREAT_RULES } from '../src/data/jobs';
import { BASE_TYPES } from '../src/data/bases';
import { AFFIXES, affixPoolFor } from '../src/data/affixes';
import { UNIQUES, uniquesForSlot } from '../src/data/uniques';
import { enemiesForStage } from '../src/data/enemies';
import { HERBS, POTIONS, plotCost } from '../src/data/garden';
import type { Item, JobId, RetreatRule } from '../src/sim/types';

// ---------------------------------------------------------------- 乱数そのもの
//
// ここが合わなければ他は全部合わない。JS の `x >> 17` は符号拡張する
// （`>>>` ではない）ので、素直な xorshift32 を書くと必ずずれる。
const prngVectors = [0, 1, 2, 42, 0x9e3779b9, 0xdeadbeef, 0xffffffff, 123456789].map(seed => {
  const r = new Prng(seed);
  const next: number[] = [];
  for (let i = 0; i < 12; i++) next.push(r.next());
  const r2 = new Prng(seed);
  const floats: number[] = [];
  for (let i = 0; i < 6; i++) floats.push(r2.float());
  const r3 = new Prng(seed);
  const ints: number[] = [];
  for (const n of [1, 2, 3, 4, 5, 7, 10, 16, 100]) ints.push(r3.int(n));
  const r4 = new Prng(seed);
  const ranges: number[] = [];
  for (const [a, b] of [[0, 0], [0, 1], [3, 5], [-2, 2], [1, 100]] as const) ranges.push(r4.range(a, b));
  return { seed, next, floats, ints, ranges };
});

// ---------------------------------------------------------------- 表と関数
const tables = {
  difficultyMul: [1, 2, 3, 4, 5].map(t => ({ tier: t, value: difficultyMul(t) })),
  itemPowerFor: STAGES.flatMap(s => [1, 2, 3].map(t =>
    ({ stageId: s.id, tier: t, value: itemPowerFor(s.id, t) }))),
  bossName: STAGES.map(s => ({ stageId: s.id, name: bossName(s.id) })),
  enemiesForStage: STAGES.map(s =>
    ({ stageId: s.id, names: enemiesForStage(s.id).map(e => e.name) })),
  affixPoolFor: BASE_TYPES.map(b =>
    ({ baseId: b.id, kinds: affixPoolFor(b.slot, b.tags).map(a => a.kind) })),
  uniquesForSlot: (['weapon', 'armor'] as const).map(s =>
    ({ slot: s, kinds: uniquesForSlot(s).map(u => u.kind) })),
  tierOf: [
    [0, 0, 10], [5, 0, 10], [9.99, 0, 10], [10, 0, 10], [-1, 0, 10],
    [8, 8, 15], [15, 8, 15], [11.5, 8, 15], [3, 3, 3]
  ].map(([v, lo, hi]) => ({ value: v, min: lo, max: hi, tier: tierOf(v!, lo!, hi!) })),
  plotCost: [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ nth: n, cost: plotCost(n) })),
  constants: { POWER_CAP, OFFLINE_CAP_SEC }
};

// ---------------------------------------------------------------- 装備生成
function itemJson(it: Item): unknown {
  return {
    id: it.id, baseId: it.baseId, slot: it.slot, rarity: it.rarity,
    power: it.power, speed: it.speed, crit: it.crit,
    // 属性配分は**入った順**で出す。JS の Object.entries は挿入順なので、
    // 同率のときの勝者がその順序で決まる（dominantElement）
    element: Object.entries(it.element).map(([k, v]) => [k, v]),
    affixes: it.affixes.map(a => ({ kind: a.kind, value: a.value, tier: a.tier, element: a.element ?? null })),
    unique: it.unique, identified: it.identified, fromStage: it.fromStage,
    sellValue: sellValue(it)
  };
}

const itemVectors: unknown[] = [];
for (const seed of [1, 7, 12345, 0xabcdef, 2654435761]) {
  for (const slot of ['weapon', 'armor'] as const) {
    for (const stageId of [1, 4, 7, 10]) {
      const st = stageDef(stageId);
      const rng = new Prng(seed);
      const made: unknown[] = [];
      // 1つの Prng から連続で引く。「引く順番」までここで固定する
      for (let i = 0; i < 5; i++) {
        made.push(itemJson(generateItem(rng, {
          itemPower: itemPowerFor(stageId, 1), slot, stageId,
          rarityBonus: st.rarityBonus, id: `${seed.toString(36)}-${i}`
        })));
      }
      // 救済枠と同じ道（forceRarity は抽選を飛ばす＝乱数を1つ引かない）
      made.push(itemJson(generateItem(rng, {
        itemPower: itemPowerFor(stageId, 1), slot, stageId,
        rarityBonus: st.rarityBonus, id: `${seed.toString(36)}-forced`,
        forceRarity: 'rare'
      })));
      itemVectors.push({ seed, slot, stageId, items: made, stateAfter: new Prng(0).next() && rng.next() });
    }
  }
}

// ---------------------------------------------------------------- 派遣
/**
 * 決まった種から装備を1点作る。両実装で同じ品が出ることが前提。
 *
 * **種は必ず `>>> 0` で符号を落とす。** JS の `^` は符号付き int32 を返すので、
 * `seed ^ 0x11` が負になり、id が `fix--1698058396-armor` になっていた。
 * Swift 側は UInt32 なので同じ id を作れず、乱数も結果も合っているのに
 * id だけで落ちる——原因の分かりにくい失敗になる。
 */
function fixedItem(seed: number, slot: 'weapon' | 'armor', stageId: number): Item {
  const s = seed >>> 0;
  return generateItem(new Prng(s), {
    itemPower: itemPowerFor(stageId, 1), slot, stageId,
    rarityBonus: stageDef(stageId).rarityBonus, id: `fix-${s}-${slot}`
  });
}

const runVectors: unknown[] = [];
const jobs: JobId[] = ['swordsman', 'guardian', 'skirmisher'];
const rules: RetreatRule[] = ['reckless', 'standard', 'cautious'];
let n = 0;
for (const stageId of [1, 3, 5, 8, 10]) {
  for (const [ji, job] of jobs.entries()) {
    for (const [ri, rule] of rules.entries()) {
      const seed = (0xD31 * (n + 1) * 2654435761) >>> 0;
      const weapon = fixedItem((seed ^ 0x11) >>> 0, 'weapon', stageId);
      const armor = fixedItem((seed ^ 0x22) >>> 0, 'armor', stageId);
      const tier = n % 3 === 0 ? 1 : n % 3 === 1 ? 1 : 2;
      // 薬あり・なしを交互に。薬は乱数を引かないので、差は決定的に出る
      const potion = n % 4 === 0
        ? { element: POTIONS[n % POTIONS.length]!.element, resist: POTIONS[n % POTIONS.length]!.resist,
            name: POTIONS[n % POTIONS.length]!.name }
        : null;
      const r = simulateRun({
        seed, job: jobDef(job), weapon, armor,
        rule: retreatRuleDef(rule), stage: stageDef(stageId), tier, potion
      });
      runVectors.push({
        input: { seed, job, rule, stageId, tier, potion, ji, ri },
        weapon: itemJson(weapon), armor: itemJson(armor),
        result: {
          outcome: r.outcome, depth: r.depth, encountersTotal: r.encountersTotal,
          bossDefeated: r.bossDefeated, gold: r.gold, headline: r.headline,
          highlights: r.highlights, hpCurve: r.hpCurve, durationSec: r.durationSec,
          stats: r.stats, loot: r.loot.map(itemJson)
        }
      });
      n++;
    }
  }
}

// ---------------------------------------------------------------- オフライン
const offlineVectors = [
  { startedAt: 1000, durationSec: 300, lastSeen: 1000 },
  { startedAt: 1000, durationSec: 300, lastSeen: 151000 },
  { startedAt: 1000, durationSec: 300, lastSeen: 301000 },
  { startedAt: 1000, durationSec: 300, lastSeen: 999999999 },
  { startedAt: 0, durationSec: 28800, lastSeen: 28800 * 1000 },
  { startedAt: 0, durationSec: 0, lastSeen: 5000 }
].map(v => {
  const d = {
    id: 'd', jobId: 'swordsman' as const, stageId: 1, weaponId: 'w', armorId: 'a',
    retreatRule: 'standard' as const, seed: 1, startedAt: v.startedAt, durationSec: v.durationSec
  };
  const p = dispatchProgress(d, { lastSeen: v.lastSeen });
  return { ...v, elapsedSec: p.elapsedSec, remainingSec: p.remainingSec, completed: p.completed, ratio: p.ratio };
});

const clockVectors = [
  { lastSeen: 100, now: 200 }, { lastSeen: 200, now: 100 }, { lastSeen: 50, now: 50 }
].map(v => ({ ...v, next: advanceClock({ lastSeen: v.lastSeen }, v.now).lastSeen }));

// ---------------------------------------------------------------- 出力
process.stdout.write(JSON.stringify({
  note: 'src/sim と src/data の実測値。Swift 側はこれと1つ残らず一致すること。',
  generatedFrom: 'tools/golden.ts',
  prng: prngVectors,
  tables,
  data: {
    bases: BASE_TYPES.map(b => ({ ...b, tags: [...b.tags] })),
    affixes: AFFIXES.map(a => ({ ...a, tags: [...a.tags], elemental: a.elemental ?? false })),
    uniques: UNIQUES.map(u => ({ ...u })),
    jobs: JOBS.map(j => ({ ...j, armorRestriction: [...j.armorRestriction] })),
    retreatRules: RETREAT_RULES.map(r => ({ ...r })),
    stages: STAGES.map(s => ({ ...s, resists: [...s.resists] })),
    herbs: HERBS.map(h => ({ ...h })),
    potions: POTIONS.map(p => ({ ...p }))
  },
  items: itemVectors,
  runs: runVectors,
  offline: offlineVectors,
  clock: clockVectors
}, null, 1));
