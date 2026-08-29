// state 層の正解表。**台本を決めた1回の通し**を、1手ごとに写し取る。
//
//   npx tsx tools/golden-state.ts > swift/Tests/DelversCoreTests/Resources/golden-state.json
//
// sim 層と違って state は状態を持つので、「同じ入力→同じ出力」では足りない。
// 「同じ手順を踏んだら同じ状態になる」を確かめたいので、手ごとに全体を写す。
// ずれた瞬間の手が名指しされるように、1手ずつ残すのが肝。
import { GameState } from '../src/game/state';
import { Prng } from '../src/sim/prng';
import { generateItem, sellValue } from '../src/sim/items';
import { stageDef } from '../src/data/stages';
import type { JobId, RetreatRule } from '../src/sim/types';

type Step =
  | { op: 'tick'; now: number }
  | { op: 'setGold'; gold: number }
  | { op: 'equip'; job: JobId; slot: 'weapon' | 'armor'; itemIndex: number }
  | { op: 'dispatch'; job: JobId; stage: number; rule: RetreatRule; now: number; potion?: string | null }
  | { op: 'openAll' }
  | { op: 'sellAllUnlocked' }
  | { op: 'lock'; itemIndex: number }
  | { op: 'unlockStage'; stage: number }
  | { op: 'unlockSlot' }
  | { op: 'ensureStarterGear'; job: JobId }
  | { op: 'plant'; index: number; herb: string }
  | { op: 'harvest'; index: number }
  | { op: 'harvestAll' }
  | { op: 'buySeed'; herb: string }
  | { op: 'expandGarden' }
  | { op: 'brew'; potion: string }
  | { op: 'reidentify'; itemIndex: number; seed: number }
  // 添字を決め打ちにしない手。台本を書いた時点の並びに依存すると、
  // ちょっとした調整で「成功経路を1つも通らない台本」に化ける（実際そうなった）
  | { op: 'equipBest'; job: JobId }
  | { op: 'reidentifyFirstWithAffix'; seed: number }
  // 強い装備を決定的に配る。踏破まで行かないと解放系の成功経路を
  // 1つも通らない台本になる（実際そうなっていた）
  | { op: 'grantItem'; seed: number; slot: 'weapon' | 'armor'; itemPower: number; stage: number; id: string };

const T0 = 1_700_000_000_000;
const MIN = 60_000;

// 台本。**通る道を選んで並べてある**——踏破・撤退・戦死、薬あり・なし、
// 畑の一巡、金の出入り、装備の喪失と支給。1本で全部通す。
const SCRIPT: Step[] = [
  { op: 'tick', now: T0 },
  // 開幕の畑
  { op: 'plant', index: 0, herb: 'ironleaf' },
  { op: 'plant', index: 1, herb: 'embermoss' },
  { op: 'plant', index: 0, herb: 'ironleaf' },          // 埋まっている枠 → 失敗
  { op: 'plant', index: 0, herb: 'stormroot' },          // 種が無い → 失敗
  // 1本目の派遣（初期装備・標準）
  { op: 'dispatch', job: 'swordsman', stage: 1, rule: 'standard', now: T0 },
  { op: 'dispatch', job: 'swordsman', stage: 1, rule: 'standard', now: T0 }, // 派遣中 → 失敗
  { op: 'tick', now: T0 + 3 * MIN },
  { op: 'tick', now: T0 + 60 * MIN },                    // 完了・回収
  { op: 'openAll' },
  // 畑を一巡させる
  { op: 'tick', now: T0 + 80 * MIN },
  { op: 'harvest', index: 0 },
  { op: 'harvestAll' },
  { op: 'setGold', gold: 5000 },
  { op: 'buySeed', herb: 'venomcap' },
  { op: 'buySeed', herb: 'frostbloom' },
  { op: 'expandGarden' },
  { op: 'plant', index: 2, herb: 'venomcap' },
  { op: 'tick', now: T0 + 200 * MIN },
  { op: 'harvestAll' },
  { op: 'brew', potion: 'ironblood' },
  { op: 'brew', potion: 'stormward' },                   // 材料不足 → 失敗
  // 強い装備を配って踏破まで行く。ここを通さないと解放・難易度上昇・枠の購入が
  // 1つも試されない台本になる
  { op: 'grantItem', seed: 0xA11CE, slot: 'weapon', itemPower: 520, stage: 5, id: 'gift-w' },
  { op: 'grantItem', seed: 0xB0B, slot: 'armor', itemPower: 520, stage: 5, id: 'gift-a' },
  { op: 'equipBest', job: 'swordsman' },
  { op: 'dispatch', job: 'swordsman', stage: 1, rule: 'reckless', now: T0 + 205 * MIN },
  { op: 'tick', now: T0 + 280 * MIN },
  { op: 'openAll' },
  // ステージ解放
  { op: 'unlockStage', stage: 2 },                       // 直前踏破済み → 成功
  { op: 'unlockStage', stage: 2 },                       // 二重解放 → 失敗
  { op: 'unlockStage', stage: 4 },                       // 前段未踏破 → 失敗
  { op: 'unlockSlot' },                                  // 条件ステージ未踏破 → 失敗
  // 薬つきで2を踏破
  { op: 'equipBest', job: 'swordsman' },
  { op: 'dispatch', job: 'swordsman', stage: 2, rule: 'reckless', now: T0 + 290 * MIN, potion: 'ironblood' },
  { op: 'dispatch', job: 'swordsman', stage: 2, rule: 'reckless', now: T0 + 290 * MIN }, // 派遣中 → 失敗
  { op: 'tick', now: T0 + 500 * MIN },
  { op: 'openAll' },
  { op: 'unlockStage', stage: 3 },
  // 3を踏破して枠を買う
  { op: 'dispatch', job: 'swordsman', stage: 3, rule: 'reckless', now: T0 + 510 * MIN },
  { op: 'tick', now: T0 + 900 * MIN },
  { op: 'openAll' },
  { op: 'setGold', gold: 99_999 },
  { op: 'unlockSlot' },                                  // 条件を満たした → 成功
  { op: 'dispatch', job: 'guardian', stage: 1, rule: 'standard', now: T0 + 910 * MIN }, // 装備なし → 失敗
  // 再鑑定（アフィックスを持つ品を選ぶ）
  { op: 'reidentifyFirstWithAffix', seed: 0xBEEF },
  { op: 'reidentifyFirstWithAffix', seed: 0xBEEF },      // 同じ種なら同じ振り直し
  // 深追いで戦死させ、装備の喪失と支給を通す
  { op: 'equip', job: 'swordsman', slot: 'weapon', itemIndex: 0 },
  { op: 'equip', job: 'swordsman', slot: 'armor', itemIndex: 1 },
  { op: 'dispatch', job: 'swordsman', stage: 10, rule: 'reckless', now: T0 + 920 * MIN },
  { op: 'tick', now: T0 + 2000 * MIN },
  { op: 'ensureStarterGear', job: 'swordsman' },
  // ロックと売却（ロック品と装備中は残ること）
  { op: 'lock', itemIndex: 1 },
  { op: 'sellAllUnlocked' },
  { op: 'tick', now: T0 + 2100 * MIN }
];

const st = new GameState(0x51A7E, T0);

/**
 * 見比べるための写し。辞書は鍵を並べ替えて、順序で落ちないようにする。
 *
 * **必ず深くコピーする。** 最初はオブジェクトをそのまま入れていたので、
 * `equipped` と図鑑の項目が全フレームで同じ参照を指し、
 * 40手ぶんの「写し」が全部**最終状態**になっていた。
 * init の時点で `sw6`（死亡後に支給された初期装備）が装備されている、という
 * ありえない正解表ができていて、Swift 側の1手目が落ちて気づいた。
 */
function snapshot(): unknown {
  return JSON.parse(JSON.stringify(rawSnapshot()));
}

function rawSnapshot(): unknown {
  const d = st.data;
  const sortedRec = <T>(r: Record<string, T>): [string, T][] =>
    Object.keys(r).sort().map(k => [k, r[k] as T]);
  return {
    gold: d.gold, tier: d.tier, nextId: d.nextId, lastSeen: d.lastSeen,
    unlockedSlots: d.unlockedSlots,
    clearedStages: [...d.clearedStages], unlockedStages: [...d.unlockedStages],
    inventory: d.inventory.map(i => ({
      id: i.id, baseId: i.baseId, rarity: i.rarity, power: i.power,
      locked: i.locked ?? false, identified: i.identified,
      affixes: i.affixes.map(a => ({ kind: a.kind, value: a.value, tier: a.tier })),
      sell: sellValue(i)
    })),
    pending: d.pending.map(i => i.id),
    equipped: sortedRec(d.equipped as unknown as Record<string, unknown>),
    dispatches: d.dispatches.map(x => ({
      id: x.id, jobId: x.jobId, stageId: x.stageId, seed: x.seed,
      startedAt: x.startedAt, durationSec: x.durationSec, potionId: x.potionId ?? null
    })),
    inbox: [...d.inbox],
    lostKeys: Object.keys(d.lost).sort(),
    lostIds: sortedRec(d.lost).map(([k, v]) => [k, (v as { id: string }[]).map(i => i.id)]),
    compendium: sortedRec(d.compendium),
    results: sortedRec(d.results).map(([k, r]) => {
      const rr = r as { outcome: string; depth: number; gold: number; loot: { id: string }[] };
      return [k, { outcome: rr.outcome, depth: rr.depth, gold: rr.gold, loot: rr.loot.map(i => i.id) }];
    }),
    garden: {
      plots: d.garden.plots,
      beds: d.garden.beds.map(b => b ? { herbId: b.herbId, plantedAt: b.plantedAt } : null),
      seeds: sortedRec(d.garden.seeds), herbs: sortedRec(d.garden.herbs),
      potions: sortedRec(d.garden.potions)
    },
    readyCount: st.readyCount(),
    slotCount: st.slotCount(),
    nextPlotCost: st.nextPlotCost(),
    nextSlot: st.nextSlot()
  };
}

const frames: unknown[] = [{ step: -1, op: 'init', ok: true, state: snapshot() }];

for (const [i, step] of SCRIPT.entries()) {
  let ok: boolean | number | null = null;
  switch (step.op) {
    case 'tick': st.tick(step.now); ok = true; break;
    case 'setGold': st.data.gold = step.gold; ok = true; break;
    case 'equip': {
      const it = st.data.inventory[step.itemIndex];
      if (it) { st.data.equipped[step.job][step.slot] = it.id; ok = true; } else ok = false;
      break;
    }
    case 'dispatch':
      ok = st.dispatch(step.job, step.stage, step.rule, step.now, step.potion ?? null);
      break;
    case 'openAll': ok = st.openAll().length; break;
    case 'sellAllUnlocked':
      ok = st.sell(st.data.inventory.map(i => i.id), sellValue);
      break;
    case 'lock': {
      const it = st.data.inventory[step.itemIndex];
      if (it) { it.locked = !it.locked; ok = true; } else ok = false;
      break;
    }
    case 'unlockStage': ok = st.unlockStage(step.stage); break;
    case 'unlockSlot': ok = st.unlockSlot(); break;
    case 'ensureStarterGear': st.ensureStarterGear(step.job); ok = true; break;
    case 'plant': ok = st.plant(step.index, step.herb); break;
    case 'harvest': ok = st.harvest(step.index); break;
    case 'harvestAll': ok = st.harvestAll(); break;
    case 'buySeed': ok = st.buySeed(step.herb); break;
    case 'expandGarden': ok = st.expandGarden(); break;
    case 'brew': ok = st.brew(step.potion); break;
    case 'reidentify': {
      const it = st.data.inventory[step.itemIndex];
      ok = it ? st.reidentify(it.id, new Prng(step.seed)) : false;
      break;
    }
    case 'equipBest': {
      // 「攻撃/防御が最大のもの。同値なら手前」で決める。
      // 並べ替えを使わないのは、同値のときの順を実装に委ねないため
      const pick = (slot: 'weapon' | 'armor'): string | null => {
        let best: { id: string; power: number } | null = null;
        for (const i of st.data.inventory) {
          if (i.slot !== slot) continue;
          if (!best || i.power > best.power) best = { id: i.id, power: i.power };
        }
        return best?.id ?? null;
      };
      const w = pick('weapon'), a = pick('armor');
      if (w) st.data.equipped[step.job].weapon = w;
      if (a) st.data.equipped[step.job].armor = a;
      ok = w !== null && a !== null;
      break;
    }
    case 'grantItem': {
      const it = generateItem(new Prng(step.seed), {
        itemPower: step.itemPower, slot: step.slot, stageId: step.stage,
        rarityBonus: stageDef(step.stage).rarityBonus, id: step.id
      });
      it.identified = true;
      st.data.inventory.push(it);
      ok = true;
      break;
    }
    case 'reidentifyFirstWithAffix': {
      const it = st.data.inventory.find(i => i.affixes.length > 0);
      ok = it ? st.reidentify(it.id, new Prng(step.seed)) : false;
      break;
    }
  }
  frames.push({ step: i, op: step.op, detail: step, ok, state: snapshot() });
}

process.stdout.write(JSON.stringify({
  note: 'state 層の通し。1手ごとの状態を写してある。Swift 側は同じ台本を踏んで一致すること。',
  generatedFrom: 'tools/golden-state.ts',
  initialSeed: 0x51A7E, t0: T0,
  script: SCRIPT,
  frames
}, null, 1));
