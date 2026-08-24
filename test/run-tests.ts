// 決定論・破綻検査（C3 / C6 / C7）＋系譜の通し検査。
// tsx で実行する。ブラウザ不要（sim は Canvas 非依存）。
import { simulate } from '../src/sim/simulate';
import type { AdvSnapshot, PersonalityId, SimInput, SimResult } from '../src/sim/types';
import { EQUIPMENT } from '../src/data/equipment';
import { Shop } from '../src/game/shop';
import { Prng } from '../src/sim/prng';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name} ${detail}`);
  }
}

function adv(personality: PersonalityId, level: number, questDepth: number): AdvSnapshot {
  return {
    name: 'テスト', job: '剣士', level, gold: 30, questDepth,
    personality, favoredWeapon: 'W1', maxHp: 10 + level * 2
  };
}

/** 保留があれば選択を積みながら最後まで回す。 */
function playOut(
  input: Omit<SimInput, 'choices'>,
  policy: (r: SimResult) => number
): SimResult {
  const choices: number[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const res = simulate({ ...input, choices });
    if (res.outcome) return res;
    if (!res.pending) throw new Error('no outcome and no pending');
    choices.push(policy(res));
  }
  throw new Error('run did not finish');
}

const safePolicy = (r: SimResult): number => r.pending?.safeIndex ?? 0;

/** 装備由来の選択肢を最優先で選ぶ（コンボの上限性能を測る）。 */
const greedyPolicy = (r: SimResult): number => {
  const p = r.pending;
  if (!p) return 0;
  let best = p.safeIndex;
  let bestScore = -1;
  p.options.forEach((o, i) => {
    if (o.disabled) return;
    const fx = o.def.effects;
    const score = o.sourceEquip.length === 0 ? 0 :
      (fx.rareLoot ? 100 : 0) + (fx.depth ?? 0) * 10 + (fx.loot ?? 0) * 4 +
      (fx.dmg === 'none' ? 8 : 0) + (fx.heal ? 2 : 0) + 1;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
};

// ---------------------------------------------------------------- C3
console.log('C3: 同じ seed と選択履歴で結果が一致するか（100回）');
{
  const input = { seed: 0xdeadbeef, adventurer: adv('greedy', 3, 7), equipment: ['T2', 'T1', 'A2'] };
  const first = JSON.stringify(playOut(input, greedyPolicy));
  let same = true;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(playOut(input, greedyPolicy)) !== first) { same = false; break; }
  }
  check('100回連続で完全一致', same);
}

// ---------------------------------------------------------------- C6
console.log('C6: 装備0点で装備由来の選択肢が出ないか（10ラン）');
{
  let leaks = 0;
  for (let s = 0; s < 10; s++) {
    const choices: number[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const res = simulate({
        seed: 0x1000 + s, adventurer: adv((['timid', 'greedy', 'hasty'] as const)[s % 3] ?? 'timid', 4, 9),
        equipment: [], choices
      });
      for (const ev of res.events) {
        if (ev.kind === 'choice') {
          for (const o of ev.options) {
            if (o.sourceEquip.length > 0) leaks++;
          }
        }
      }
      if (res.outcome) break;
      if (!res.pending) throw new Error('stuck');
      choices.push(res.pending.safeIndex);
    }
  }
  check('装備由来の選択肢 0件', leaks === 0, `leaks=${leaks}`);
}

// ---------------------------------------------------------------- C7
console.log('C7: 特定の3点セットが常に最適になっていないか（全220組）');
{
  const ids = EQUIPMENT.map(e => e.id);
  const combos: string[][] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (let k = j + 1; k < ids.length; k++) {
        const a = ids[i], b = ids[j], c = ids[k];
        if (a && b && c) combos.push([a, b, c]);
      }
  const personalities: PersonalityId[] = ['timid', 'greedy', 'hasty'];
  const results: { combo: string[]; avg: number }[] = [];
  for (const combo of combos) {
    let sum = 0, n = 0;
    for (const p of personalities) {
      for (let s = 0; s < 8; s++) {
        const res = playOut(
          { seed: (0x7c0 + s * 131) >>> 0, adventurer: adv(p, 4, 9), equipment: combo },
          greedyPolicy
        );
        sum += res.outcome?.depth ?? 0;
        n++;
      }
    }
    results.push({ combo, avg: sum / n });
  }
  results.sort((a, b) => b.avg - a.avg);
  const top = results[0];
  const second = results[1];
  const worst = results[results.length - 1];
  if (top && second && worst) {
    const gap = (top.avg - second.avg) / Math.max(0.01, second.avg);
    console.log(`  1位 ${top.combo.join('+')} avg=${top.avg.toFixed(2)} / ` +
      `2位 ${second.combo.join('+')} avg=${second.avg.toFixed(2)} / ` +
      `最下位 ${worst.combo.join('+')} avg=${worst.avg.toFixed(2)}`);
    check('1位と2位の差が20%未満', gap < 0.2, `gap=${(gap * 100).toFixed(1)}%`);
    check('装備で差はつく（1位＞最下位）', top.avg > worst.avg + 0.5);
  }
}

// ---------------------------------------------------------------- 性格
console.log('性格: 制限装置が機能しているか');
{
  // 短気: 逃げるがグレーアウト（代替がある場合）
  let sawDisabledFlee = false;
  for (let s = 0; s < 40 && !sawDisabledFlee; s++) {
    const choices: number[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const res = simulate({
        seed: 0x2222 + s * 7, adventurer: adv('hasty', 4, 9),
        equipment: ['W1', 'A2', 'T3'], choices
      });
      for (const ev of res.events) {
        if (ev.kind === 'choice' && ev.options.some(o => o.disabled && o.def.flee)) {
          sawDisabledFlee = true;
        }
      }
      if (res.outcome) break;
      if (!res.pending) break;
      choices.push(res.pending.safeIndex);
    }
  }
  check('短気の「逃げる」がグレーアウトされる', sawDisabledFlee);

  // 臆病: HP半分未満・深度5以降で自動撤退が観測できる
  let sawRetreat = false;
  for (let s = 0; s < 200 && !sawRetreat; s++) {
    const res = playOut(
      { seed: 0x3333 + s * 13, adventurer: adv('timid', 3, 9), equipment: [] },
      (r) => {
        // わざと戦わせて消耗させる
        const p = r.pending;
        if (!p) return 0;
        const fight = p.options.findIndex(o => !o.disabled && o.def.effects.dmg === 'fight');
        return fight >= 0 ? fight : p.safeIndex;
      }
    );
    if (res.outcome?.fate === 'retreated') sawRetreat = true;
  }
  check('臆病の自動撤退が発生する', sawRetreat);

  // 強欲: 鉱脈で強制採掘（forced choice）が発生する
  let sawForced = false;
  for (let s = 0; s < 120 && !sawForced; s++) {
    const res = playOut(
      { seed: 0x4444 + s * 17, adventurer: adv('greedy', 3, 7), equipment: ['T2', 'T1', 'A2'] },
      safePolicy
    );
    if (res.events.some(e => e.kind === 'choice' && e.forced !== undefined)) sawForced = true;
  }
  check('強欲の強制採掘が発生する', sawForced);
}

// ---------------------------------------------------------------- リプレイデータの軽さ
console.log('リプレイ: seed+装備+選択で数十バイトに収まるか');
{
  const replay = { s: 0xdeadbeef, e: ['T2', 'T1', 'A2'], c: [1, 0, 1] };
  const bytes = new TextEncoder().encode(JSON.stringify(replay)).length;
  check(`リプレイデータ ${bytes} bytes < 96`, bytes < 96);
}

// ---------------------------------------------------------------- 系譜の通し
console.log('系譜: 常連を6ランまで追い切れるか（死亡交代を含む30ラン）');
{
  const shop = new Shop(0xbeef);
  let runs = 0;
  let generations = 1;
  let sawDeath = false;
  let sawSixth = false;
  const rng = new Prng(0x77);
  for (let i = 0; i < 30; i++) {
    const a = shop.advSnapshot();
    const avail = shop.available();
    const equipment: string[] = [];
    const pool = [...avail];
    const n = Math.min(pool.length, 3);
    for (let k = 0; k < n; k++) {
      const idx = rng.int(pool.length);
      const id = pool.splice(idx, 1)[0];
      if (id) equipment.push(id);
    }
    const res = playOut({ seed: shop.runSeed(), adventurer: a, equipment }, greedyPolicy);
    if (!res.outcome) throw new Error('no outcome');
    if (res.outcome.fate === 'died') sawDeath = true;
    if (shop.regular.runIndex === 6) sawSixth = true;
    shop.applyOutcome(equipment, res.outcome);
    generations = shop.regular.generation;
    runs++;
  }
  check(`30ラン完走（世代=${generations}）`, runs === 30);
  check('6ラン目まで到達する系譜がある', sawSixth);
  check('死亡による世代交代が発生する', sawDeath || generations > 1);
  check('在庫が破綻しない（残数>0）', shop.stock.length > 0, `stock=${shop.stock.length}`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
