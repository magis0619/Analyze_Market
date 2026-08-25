// B軸検証（§11.2）。20回派遣を回し、指標を数値で出す。
//
// §11.2 の5指標のうち「開封が作業に感じた」「インベントリ整理が苦痛だった」は
// 実画面を触らないと判定できないため、ここでは数値化できる3指標を出し、
// 残り2つは批評エージェントが実画面で判定する（その旨を出力にも明記する）。
import { Prng } from '../src/sim/prng';
import { simulateRun } from '../src/sim/combat';
import { generateItem, sellValue } from '../src/sim/items';
import { stageDef, itemPowerFor } from '../src/data/stages';
import { jobDef, retreatRuleDef, canEquipArmor } from '../src/data/jobs';
import { baseDef } from '../src/data/bases';
import { itemName } from '../src/ui/itemview';
import type { Item, JobId, RetreatRule } from '../src/sim/types';

const RUNS = 20;
const seedArg = process.argv[2];
const rootSeed = seedArg ? parseInt(seedArg, 16) : 0xc0ffee;

interface Owned { weapon: Item | null; armor: Item | null; }

const rng = new Prng(rootSeed);
const stash: Item[] = [];
const owned: Record<JobId, Owned> = {
  swordsman: { weapon: null, armor: null },
  guardian: { weapon: null, armor: null },
  skirmisher: { weapon: null, armor: null }
};

// 初期装備
for (const slot of ['weapon', 'armor'] as const) {
  stash.push(generateItem(rng, { itemPower: 100, slot, stageId: 1, rarityBonus: 1, id: `init-${slot}` }));
}

let noDilemma = 0;     // 装備選択に迷わなかった回数（最適解が自明だった）
let unexplained = 0;   // 結果の理由が分からなかった回数
let goodFind = 0;      // 「この武器いいな」と思えた回数
let gold = 0;

console.log(`# B軸プレイテスト（seed ${rootSeed.toString(16)}、${RUNS}回派遣）\n`);

for (let run = 1; run <= RUNS; run++) {
  const jobId: JobId = run % 3 === 0 ? 'guardian' : run % 3 === 1 ? 'swordsman' : 'skirmisher';
  const job = jobDef(jobId);
  const stageId = Math.min(10, 1 + Math.floor((run - 1) / 2));
  const stage = stageDef(stageId);
  const rule: RetreatRule = run % 4 === 0 ? 'reckless' : run % 4 === 2 ? 'cautious' : 'standard';

  // --- 装備選択：所持品から「この職が装備できるもの」の候補を出す ---
  const weapons = stash.filter(i => i.slot === 'weapon');
  const armors = stash.filter(i => i.slot === 'armor' && canEquipArmor(job, baseDef(i.baseId).tags));
  if (weapons.length === 0 || armors.length === 0) {
    for (const slot of ['weapon', 'armor'] as const) {
      stash.push(generateItem(rng, {
        itemPower: itemPowerFor(stageId, 1), slot, stageId, rarityBonus: 1, id: `fill-${run}-${slot}`
      }));
    }
    continue;
  }

  // 「画面に出ている一番大きな数字を選ぶ」素朴な選択。
  // 武器は威力単独ではベースタイプ間で比較できないため、UIが主役に据えている
  // 秒間火力（威力×速度）で選ぶ＝情報を得たプレイヤーの最も素直な挙動。
  const naiveW = [...weapons].sort((a, b) => b.power * b.speed - a.power * a.speed)[0] as Item;
  const naiveA = [...armors].sort((a, b) => b.power - a.power)[0] as Item;

  // 全候補を実際に回して、本当に一番深く潜れる組み合わせを求める。
  // 候補は「秒間火力の上位」から採る。所持順で切ると古い弱装備ばかりを
  // 比較することになり、素朴な選択が常に勝ってしまう（測定の誤り）。
  const wCand = [...weapons].sort((a, b) => b.power * b.speed - a.power * a.speed).slice(0, 10);
  const aCand = [...armors].sort((a, b) => b.power - a.power).slice(0, 10);
  let best: { w: Item; a: Item; depth: number } | null = null;
  for (const w of wCand) {
    for (const a of aCand) {
      const r = simulateRun({
        seed: (rootSeed ^ (run * 7919)) >>> 0, job, weapon: w, armor: a,
        rule: retreatRuleDef(rule), stage, tier: 1
      });
      if (!best || r.depth > best.depth) best = { w, a, depth: r.depth };
    }
  }
  const naiveRun = simulateRun({
    seed: (rootSeed ^ (run * 7919)) >>> 0, job, weapon: naiveW, armor: naiveA,
    rule: retreatRuleDef(rule), stage, tier: 1
  });

  // 素朴な選択が最適解と一致するなら「迷う余地がなかった」
  const naiveIsBest = best !== null
    && naiveRun.depth >= best.depth * 0.98;
  if (naiveIsBest) noDilemma++;

  owned[jobId] = { weapon: naiveW, armor: naiveA };
  const result = naiveRun;
  gold += result.gold;

  // --- 結果の理由が分かるか（見どころ3行の具体性）---
  const specific = result.highlights.filter(h =>
    /炎|雷|毒|氷|物理|会心|攻撃力|防御|耐性|回復|遺物|窮地|連撃|属性ダメージ/.test(h)
  ).length;
  const explained = result.highlights.length >= 3 && specific >= 2;
  if (!explained) unexplained++;

  // --- 戦利品に「いいな」と思える物があるか ---
  const cur = owned[jobId];
  const upgrade = result.loot.find(it => {
    const equipped = it.slot === 'weapon' ? cur.weapon : cur.armor;
    if (it.slot === 'armor' && !canEquipArmor(job, baseDef(it.baseId).tags)) return false;
    if (it.rarity === 'rare' || it.rarity === 'relic') return true;
    return equipped ? it.power > equipped.power * 1.08 : true;
  });
  if (upgrade) goodFind++;
  stash.push(...result.loot);

  console.log(`## ${run}回目  ${job.name} → ${stage.name}（${retreatRuleDef(rule).name}）`);
  console.log(`  装備: ${itemName(naiveW)} 威力${naiveW.power} / ${itemName(naiveA)} 防御${naiveA.power}`);
  console.log(`  素朴な選択が最適: ${naiveIsBest ? 'はい（迷う余地なし）' : `いいえ（最善は深度${best?.depth}、素朴だと${result.depth}）`}`);
  console.log(`  結果: ${result.headline}`);
  for (const h of result.highlights) console.log(`    - ${h}`);
  console.log(`  戦利品 ${result.loot.length}個` +
    (upgrade ? ` ／ 注目: ${itemName(upgrade)}（${upgrade.rarity}）` : ' ／ 目ぼしい物なし'));
  console.log('');
}

// ゴミ装備が金に変わるか（§7.5）
const junk = stash.filter(i => i.rarity === 'common');
const junkGold = junk.reduce((s, i) => s + sellValue(i), 0);

console.log('--- 集計（§11.2 B軸）---');
console.log(`装備選択に迷わなかった回数: ${noDilemma}/${RUNS}（10以上で不合格）`);
console.log(`結果の理由が分からなかった回数: ${unexplained}/${RUNS}（0でなければ不合格）`);
console.log(`「この武器いいな」と思えた回数: ${goodFind}/${RUNS}（5未満で不合格）`);
console.log(`所持品 ${stash.length}点、うち並 ${junk.length}点（売却で ${junkGold}G）、獲得金 ${gold}G`);
console.log('※「開封が作業に感じた回数」「インベントリ整理が苦痛だった回数」は');
console.log('  実画面を触らないと判定できないため、批評エージェントが実機で判定する。');
