// バランス実測。レポート専用（CI判定はしない）。
//  - 「そのステージ相当の装備」で挑んだときの到達率
//  - 「2段階上の装備（周回して稼いだ想定）」でクリアできるか（§13-1の担保）
import { Prng } from '../src/sim/prng';
import { simulateRun } from '../src/sim/combat';
import { generateItem } from '../src/sim/items';
import { STAGES, itemPowerFor } from '../src/data/stages';
import { JOBS, RETREAT_RULES, canEquipArmor } from '../src/data/jobs';
import { baseDef } from '../src/data/bases';
import type { Item, JobDef } from '../src/sim/types';

function gearFor(rng: Prng, job: JobDef, itemPower: number, stageId: number): [Item, Item] {
  let weapon: Item | null = null;
  let armor: Item | null = null;
  for (let i = 0; i < 300 && (!weapon || !armor); i++) {
    const it = generateItem(rng, {
      itemPower, slot: i % 2 === 0 ? 'weapon' : 'armor',
      stageId, rarityBonus: 1, id: `g${i}`
    });
    if (it.slot === 'weapon' && !weapon) weapon = it;
    if (it.slot === 'armor' && !armor && canEquipArmor(job, baseDef(it.baseId).tags)) armor = it;
  }
  if (!weapon || !armor) throw new Error('gear generation failed');
  return [weapon, armor];
}

function probe(label: string, powerOffset: number): void {
  console.log(`\n=== ${label} ===`);
  console.log('stage  job        rule      clear%  死亡%  平均深度/総数  戦利品');
  for (const stage of STAGES) {
    for (const job of JOBS) {
      for (const rule of RETREAT_RULES) {
        let clears = 0, deaths = 0, depthSum = 0, lootSum = 0;
        const N = 40;
        for (let i = 0; i < N; i++) {
          const rng = new Prng(0x1000 + i * 7919 + stage.id * 131 + job.hp);
          const power = itemPowerFor(Math.min(10, stage.id + powerOffset), 1);
          const [w, a] = gearFor(rng, job, power, stage.id);
          const r = simulateRun({
            seed: (0x2000 + i * 104729) >>> 0,
            job, weapon: w, armor: a, rule, stage, tier: 1
          });
          if (r.outcome === 'clear') clears++;
          if (r.outcome === 'death') deaths++;
          depthSum += r.depth;
          lootSum += r.loot.length;
        }
        console.log(
          `${String(stage.id).padStart(2)}     ${job.name.padEnd(6)}  ${rule.name.padEnd(6)}  ` +
          `${String(Math.round(clears / N * 100)).padStart(5)}%  ` +
          `${String(Math.round(deaths / N * 100)).padStart(4)}%  ` +
          `${(depthSum / N).toFixed(1).padStart(5)}/${stage.encounters}  ` +
          `${(lootSum / N).toFixed(1).padStart(5)}`
        );
      }
    }
  }
}

const mode = process.argv[2] ?? 'matched';
if (mode === 'matched') probe('そのステージ相当の装備', 0);
else probe('2段階上の装備（周回した想定）', 2);
