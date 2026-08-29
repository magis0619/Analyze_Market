// データ表の Swift を **TS の実データから生成する**。
//
// 一度手で写したらステージ7〜9を取り違えた（名前・弱点・耐性・レア補正が全部違った）。
// 表は目で写すものではない。ここを直せば両方が同時に直る。
//
//   npx tsx tools/gen-swift-tables.ts > swift/Sources/DelversCore/Data/Generated.swift
import { BASE_TYPES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { UNIQUES } from '../src/data/uniques';
import { JOBS, RETREAT_RULES, UNLOCK_STAGE_FOR_SLOT, SLOT_COST } from '../src/data/jobs';
import { STAGES } from '../src/data/stages';
import { ENEMIES } from '../src/data/enemies';
import { HERBS, POTIONS, PLOTS_INITIAL, PLOTS_MAX } from '../src/data/garden';

const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;
const arr = (xs: readonly string[]): string => `[${xs.map(q).join(', ')}]`;
/** 数値はそのままの表記で出す。丸めると別のゲームになる */
const n = (v: number): string => Number.isInteger(v) ? `${v}` : `${v}`;
const el = (e: string): string => `.${e}`;
const elArr = (xs: readonly string[]): string => `[${xs.map(el).join(', ')}]`;

const out: string[] = [];
out.push(`// このファイルは自動生成。手で編集しない。
//
//     npx tsx tools/gen-swift-tables.ts > swift/Sources/DelversCore/Data/Generated.swift
//
// 元は src/data/*.ts。**並び順に意味がある**——rng.pick / rng.int の対象なので、
// 見やすさのために並べ替えると同じ種から別のゲームが立ち上がる。

import Foundation
`);

out.push(`public let BASE_TYPES: [BaseTypeDef] = [`);
for (const b of BASE_TYPES) {
  out.push(`    BaseTypeDef(id: ${q(b.id)}, name: ${q(b.name)}, slot: .${b.slot},`);
  out.push(`                mul: ${n(b.mul)}, speed: ${n(b.speed)}, critMin: ${n(b.critMin)}, critMax: ${n(b.critMax)},`);
  out.push(`                tags: ${arr(b.tags)}),`);
}
out.push(`]\n`);

out.push(`public let AFFIXES: [AffixDef] = [`);
for (const a of AFFIXES) {
  out.push(`    AffixDef(kind: .${a.kind}, name: ${q(a.name)}, slot: .${a.slot},`);
  out.push(`             min: ${n(a.min)}, max: ${n(a.max)}, isPercent: ${a.isPercent},`);
  out.push(`             tags: ${arr(a.tags)}, elemental: ${a.elemental ?? false}),`);
}
out.push(`]\n`);

out.push(`public let UNIQUES: [UniqueDef] = [`);
for (const u of UNIQUES) {
  out.push(`    UniqueDef(kind: .${u.kind}, name: ${q(u.name)},`);
  out.push(`              text: ${q(u.text)}, slot: .${u.slot}),`);
}
out.push(`]\n`);

out.push(`public let JOBS: [JobDef] = [`);
for (const j of JOBS) {
  out.push(`    JobDef(id: .${j.id}, name: ${q(j.name)}, hp: ${n(j.hp)},`);
  out.push(`           armorRestriction: ${arr(j.armorRestriction)}, damageTakenMul: ${n(j.damageTakenMul)}, timeMul: ${n(j.timeMul)},`);
  out.push(`           evasion: ${n(j.evasion)}, bonusDrops: ${j.bonusDrops},`);
  out.push(`           desc: ${q(j.desc)}),`);
}
out.push(`]\n`);

out.push(`public let RETREAT_RULES: [RetreatRuleDef] = [`);
for (const r of RETREAT_RULES) {
  out.push(`    RetreatRuleDef(id: .${r.id}, name: ${q(r.name)}, threshold: ${n(r.threshold)},`);
  out.push(`                   desc: ${q(r.desc)}),`);
}
out.push(`]\n`);

out.push(`public let UNLOCK_STAGE_FOR_SLOT: [Int] = [${UNLOCK_STAGE_FOR_SLOT.join(', ')}]`);
out.push(`public let SLOT_COST: [Int] = [${SLOT_COST.join(', ')}]\n`);

out.push(`public let STAGES: [StageDef] = [`);
for (const s of STAGES) {
  const enemy = s.enemyElement === 'mixed' ? '.mixed' : `.single(.${s.enemyElement})`;
  const weak = s.weakTo ? `.${s.weakTo}` : 'nil';
  out.push(`    StageDef(id: ${s.id}, name: ${q(s.name)}, minutes: ${s.minutes},`);
  out.push(`             enemyElement: ${enemy}, weakTo: ${weak}, resists: ${elArr(s.resists)},`);
  out.push(`             encounters: ${s.encounters}, dropBias: .${s.dropBias}, rarityBonus: ${n(s.rarityBonus)}, unlockCost: ${s.unlockCost}),`);
}
out.push(`]\n`);

out.push(`public let ENEMIES: [EnemyDef] = [`);
for (const e of ENEMIES) {
  out.push(`    EnemyDef(id: ${q(e.id)}, name: ${q(e.name)}, minStage: ${e.minStage}, maxStage: ${e.maxStage}, flavor: .${e.flavor}, icon: ${q(e.icon)}),`);
}
out.push(`]\n`);

out.push(`public let HERBS: [HerbDef] = [`);
for (const h of HERBS) {
  out.push(`    HerbDef(id: ${q(h.id)}, name: ${q(h.name)}, element: .${h.element}, growSec: ${h.growSec}, yieldCount: ${h.yield}, seedCost: ${h.seedCost}, glyph: ${q(h.glyph)}),`);
}
out.push(`]\n`);

out.push(`public let POTIONS: [PotionDef] = [`);
for (const p of POTIONS) {
  out.push(`    PotionDef(id: ${q(p.id)}, name: ${q(p.name)}, element: .${p.element}, resist: ${n(p.resist)},`);
  out.push(`              main: ${q(p.main)}, other: ${p.other}, text: ${q(p.text)}),`);
}
out.push(`]\n`);

out.push(`public let PLOTS_INITIAL = ${PLOTS_INITIAL}`);
out.push(`public let PLOTS_MAX = ${PLOTS_MAX}`);
out.push(``);
out.push(`/// n 枠目を開くのに要る金。`);
out.push(`public func plotCost(_ nth: Int) -> Int {`);
out.push(`    let table = [0, 0, 400, 1200, 3000, 7000]`);
out.push(`    return nth >= 0 && nth < table.count ? table[nth] : 7000`);
out.push(`}`);
out.push(``);
out.push(`/// ボス名。`);
out.push(`public func bossName(_ stageId: Int) -> String {`);
out.push(`    let names: [Int: String] = [`);
{
  const { bossName } = await import('../src/data/stages');
  const pairs = STAGES.map(s => `${s.id}: ${q(bossName(s.id))}`);
  out.push(`        ${pairs.join(', ')}`);
}
out.push(`    ]`);
out.push(`    return names[stageId] ?? "深き者"`);
out.push(`}`);

process.stdout.write(out.join('\n') + '\n');
