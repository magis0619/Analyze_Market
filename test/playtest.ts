// B軸検証補助：10ランを通しでプレイし、選択と因果の記録を出力する。
// 「渡しておいてよかった」= 装備由来の選択肢を実際に選んで利得を得た回数として集計。
import { simulate } from '../src/sim/simulate';
import type { SimResult } from '../src/sim/types';
import { Shop } from '../src/game/shop';
import { equipDef } from '../src/data/equipment';
import { eventDef } from '../src/data/events';
import { Prng } from '../src/sim/prng';

const seedArg = process.argv[2];
const shop = new Shop(seedArg ? parseInt(seedArg, 16) : 0xc0ffee);
const rng = new Prng(0x9999);

let gladCount = 0;       // 装備由来の選択肢を選べたラン数
let equipOptionRuns = 0; // 装備由来の選択肢が1回でも開いたラン数

for (let runNo = 1; runNo <= 10; runNo++) {
  const adv = shop.advSnapshot();
  const avail = shop.available();
  // 人間らしい見立て：性格と依頼深度をみてツール優先で3点
  const pref: string[] = [];
  if (adv.personality === 'greedy') pref.push('T2', 'T1');
  if (adv.personality === 'timid') pref.push('T4', 'A2');
  if (adv.personality === 'hasty') pref.push(adv.favoredWeapon, 'A3');
  if (adv.questDepth >= 9) pref.push('T3', 'A4', 'T1');
  else pref.push('T3', 'A2', 'T1', 'W2');
  const equipment: string[] = [];
  for (const id of pref) {
    if (equipment.length >= 3) break;
    if (avail.includes(id) && !equipment.includes(id)) equipment.push(id);
  }
  while (equipment.length < 3 && avail.length > equipment.length) {
    const rest = avail.filter(id => !equipment.includes(id));
    const id = rest[rng.int(rest.length)];
    if (id) equipment.push(id);
  }

  console.log(`\n=== ラン${runNo} 第${shop.regular.generation}代 ${adv.name}(${adv.personality}) Lv${adv.level} 依頼深度${adv.questDepth}`);
  console.log(`  見立て: ${equipment.map(id => equipDef(id).name).join(' / ')}`);

  const choices: number[] = [];
  let res: SimResult = simulate({ seed: shop.runSeed(), adventurer: adv, equipment, choices });
  let gladThisRun = false;
  let sawEquipOption = false;
  for (let guard = 0; guard < 6 && !res.outcome; guard++) {
    const p = res.pending;
    if (!p) break;
    const ev = eventDef(p.eventId);
    const desc = p.options.map((o, i) => {
      const src = o.sourceEquip.length > 0 ? `[${o.sourceEquip.map(id => equipDef(id).name).join('+')}]` : '';
      return `${i}:${o.def.label}${src}${o.disabled ? '(不可)' : ''}`;
    }).join(' | ');
    // 人間らしい選択：装備由来があれば選ぶ
    let pick = p.safeIndex;
    p.options.forEach((o, i) => {
      if (!o.disabled && o.sourceEquip.length > 0 && pick === p.safeIndex) pick = i;
    });
    const picked = p.options[pick];
    if (picked && picked.sourceEquip.length > 0) gladThisRun = true;
    if (p.options.some(o => o.sourceEquip.length > 0)) sawEquipOption = true;
    console.log(`  [選択] ${ev.name}: ${desc} → ${pick}`);
    choices.push(pick);
    res = simulate({ seed: shop.runSeed(), adventurer: adv, equipment, choices });
  }
  const out = res.outcome;
  if (!out) throw new Error('no outcome');
  for (const e of res.events) {
    if (e.kind === 'choice' && e.forced !== undefined) {
      console.log(`  [強制] ${e.eventName}（強欲）`);
    }
    if (e.kind === 'loot' && e.rare) console.log('  [レア発見]');
  }
  console.log(`  結果: ${out.fate} 深度${out.depth}/${out.questDepth} ${out.questMet ? '達成' : '未達'} 戦利品${out.lootIds.length}`);
  console.log(`  手紙: ${out.letterLine}`);
  if (gladThisRun) gladCount++;
  if (sawEquipOption) equipOptionRuns++;
  shop.applyOutcome(equipment, out);
}

console.log(`\n--- 集計 ---`);
console.log(`装備由来の選択肢が開いたラン: ${equipOptionRuns}/10`);
console.log(`「渡しておいてよかった」（装備由来を選べた）ラン: ${gladCount}/10 （5未満なら不合格）`);
