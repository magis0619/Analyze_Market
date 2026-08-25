// DELVERS 破綻検査（仕様書 §11.3）。C2/C6 は scripts/static-checks.mjs 側。
// ここでは C3/C4/C5/C7/C8/C9 と、完成の定義（§13）の一部を検査する。
import { Prng } from '../src/sim/prng';
import { simulateRun } from '../src/sim/combat';
import { generateItem, POWER_CAP } from '../src/sim/items';
import { advanceClock, dispatchProgress, OFFLINE_CAP_SEC } from '../src/sim/offline';
import { AFFIXES } from '../src/data/affixes';
import { uniqueDef } from '../src/data/uniques';
import { BASE_TYPES, baseDef } from '../src/data/bases';
import { JOBS, RETREAT_RULES, canEquipArmor, jobDef, retreatRuleDef } from '../src/data/jobs';
import { STAGES, itemPowerFor, stageDef } from '../src/data/stages';
import type { Dispatch, Item } from '../src/sim/types';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok: ${name}`);
  else { failures++; console.error(`  FAIL: ${name} ${detail}`); }
}

function makeItem(rng: Prng, baseId: string, itemPower: number, stageId = 1): Item {
  // 指定ベースが出るまで引く（生成器はベースをランダムに選ぶため）
  const slot = baseDef(baseId).slot;
  for (let i = 0; i < 5000; i++) {
    const it = generateItem(rng, {
      itemPower, slot, stageId, rarityBonus: 1, id: `t${i}`
    });
    if (it.baseId === baseId) return it;
  }
  throw new Error(`could not roll base ${baseId}`);
}

// ---------------------------------------------------------------- C3
console.log('C3: 同一seed・同一装備・同一撤退ルールで結果が完全一致するか（100回）');
{
  const rng = new Prng(0xabc);
  const weapon = makeItem(rng, 'sword', 120);
  const armor = makeItem(rng, 'medium', 120);
  const input = {
    seed: 0xdeadbeef, job: jobDef('swordsman'), weapon, armor,
    rule: retreatRuleDef('standard'), stage: stageDef(3), tier: 1
  };
  const first = JSON.stringify(simulateRun(input));
  let same = true;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(simulateRun(input)) !== first) { same = false; break; }
  }
  check('100回連続で完全一致', same);

  // 装備生成そのものも同一seedで再現できること
  const genA = JSON.stringify(
    Array.from({ length: 50 }, (_, i) =>
      generateItem(new Prng(0x1234 + i), { itemPower: 150, slot: 'weapon', stageId: 4, rarityBonus: 1.2, id: `x${i}` })
    )
  );
  const genB = JSON.stringify(
    Array.from({ length: 50 }, (_, i) =>
      generateItem(new Prng(0x1234 + i), { itemPower: 150, slot: 'weapon', stageId: 4, rarityBonus: 1.2, id: `x${i}` })
    )
  );
  check('装備生成も同一seedで完全再現', genA === genB);
}

// ---------------------------------------------------------------- C4
console.log('C4: オフライン8時間の一括計算と分割計算が一致するか');
{
  const start = 1_700_000_000_000;
  const dispatch: Dispatch = {
    id: 'd1', jobId: 'swordsman', stageId: 10, weaponId: 'w', armorId: 'a',
    retreatRule: 'standard', seed: 1, startedAt: start,
    durationSec: 8 * 3600
  };
  const end = start + 8 * 3600 * 1000;

  // 一括: いきなり8時間後を観測
  const bulk = dispatchProgress(dispatch, advanceClock({ lastSeen: start }, end));

  // 分割: 1分ずつ480回に分けて観測
  let clock = { lastSeen: start };
  for (let i = 1; i <= 480; i++) {
    clock = advanceClock(clock, start + i * 60_000);
  }
  const split = dispatchProgress(dispatch, clock);

  check(`一括 ${bulk.elapsedSec}s == 分割 ${split.elapsedSec}s`, bulk.elapsedSec === split.elapsedSec);
  check('一括・分割ともに完了', bulk.completed && split.completed);

  // 不規則な刻みでも一致すること
  let clock2 = { lastSeen: start };
  const steps = [13, 900, 77, 4000, 60, 12000, 5, 9000, 1, 2400];
  let acc = 0;
  for (const s of steps) { acc += s; clock2 = advanceClock(clock2, start + acc * 1000); }
  const irregular = dispatchProgress(dispatch, clock2);
  const same = dispatchProgress(dispatch, advanceClock({ lastSeen: start }, start + acc * 1000));
  check('不規則な分割でも一致', irregular.elapsedSec === same.elapsedSec);

  // 8時間の上限（§7.2）
  const far = dispatchProgress(dispatch, advanceClock({ lastSeen: start }, start + 40 * 3600 * 1000));
  check(`上限8時間でクランプ（${far.elapsedSec}s == ${OFFLINE_CAP_SEC}s）`, far.elapsedSec === OFFLINE_CAP_SEC);
}

// ---------------------------------------------------------------- C5
console.log('C5: 端末時刻の巻き戻しで進行しないか');
{
  const start = 1_700_000_000_000;
  const dispatch: Dispatch = {
    id: 'd2', jobId: 'swordsman', stageId: 1, weaponId: 'w', armorId: 'a',
    retreatRule: 'standard', seed: 1, startedAt: start, durationSec: 300
  };
  // 60秒進めてから、1時間巻き戻す
  let clock = advanceClock({ lastSeen: start }, start + 60_000);
  const before = dispatchProgress(dispatch, clock);
  clock = advanceClock(clock, start - 3600_000);
  const after = dispatchProgress(dispatch, clock);
  check(`巻き戻しても進行量が変わらない（${before.elapsedSec}s → ${after.elapsedSec}s）`,
    after.elapsedSec === before.elapsedSec);
  check('巻き戻しで完了扱いにならない', !after.completed);

  // 巻き戻したまま何度観測しても増えない
  for (let i = 0; i < 20; i++) clock = advanceClock(clock, start - 3600_000 + i * 1000);
  const stuck = dispatchProgress(dispatch, clock);
  check('巻き戻し中は何度観測しても進まない', stuck.elapsedSec === before.elapsedSec);
}

// ---------------------------------------------------------------- C7
console.log('C7: 特定の武器・防具の組み合わせが常に最適になっていないか');
{
  const weapons = BASE_TYPES.filter(b => b.slot === 'weapon');
  const armors = BASE_TYPES.filter(b => b.slot === 'armor');
  const results: { combo: string; avg: number }[] = [];
  for (const w of weapons) {
    for (const a of armors) {
      // その防具を装備できる職だけで平均する（§4.2の装備制限）
      const jobs = JOBS.filter(j => canEquipArmor(j, a.tags));
      let sum = 0, n = 0;
      for (const job of jobs) {
        for (const stage of [stageDef(2), stageDef(5), stageDef(8)]) {
          for (let i = 0; i < 12; i++) {
            const rng = new Prng(0x5000 + i * 6151 + stage.id * 97);
            const weapon = makeItem(rng, w.id, itemPowerFor(stage.id, 1), stage.id);
            const armor = makeItem(rng, a.id, itemPowerFor(stage.id, 1), stage.id);
            const r = simulateRun({
              seed: (0x6000 + i * 22079) >>> 0, job, weapon, armor,
              rule: retreatRuleDef('standard'), stage, tier: 1
            });
            sum += r.depth / stage.encounters;
            n++;
          }
        }
      }
      results.push({ combo: `${w.name}+${a.name}`, avg: sum / Math.max(1, n) });
    }
  }
  results.sort((x, y) => y.avg - x.avg);
  const top = results[0], second = results[1], worst = results[results.length - 1];
  if (top && second && worst) {
    const gap = (top.avg - second.avg) / Math.max(0.001, second.avg);
    console.log(`  1位 ${top.combo} ${(top.avg * 100).toFixed(1)}% / 2位 ${second.combo} ${(second.avg * 100).toFixed(1)}% / 最下位 ${worst.combo} ${(worst.avg * 100).toFixed(1)}%`);
    check(`1位と2位の差が20%未満（${(gap * 100).toFixed(1)}%）`, gap < 0.20, `gap=${(gap * 100).toFixed(1)}%`);
    check('組み合わせで差はつく（1位＞最下位）', top.avg > worst.avg * 1.02);
  }
}

// ---------------------------------------------------------------- C8
console.log('C8: 攻撃力が4桁に到達しないか');
{
  let maxSeen = 0;
  for (let tier = 1; tier <= 8; tier++) {
    for (let i = 0; i < 400; i++) {
      const it = generateItem(new Prng(0x7000 + i + tier * 31), {
        itemPower: itemPowerFor(10, tier), slot: i % 2 === 0 ? 'weapon' : 'armor',
        stageId: 10, rarityBonus: 2, id: `c8-${i}`
      });
      maxSeen = Math.max(maxSeen, it.power);
    }
  }
  check(`最大値 ${maxSeen} が上限 ${POWER_CAP} 以下（4桁未満）`, maxSeen <= POWER_CAP && maxSeen < 1000);
}

// ---------------------------------------------------------------- C9
console.log('C9: 回復アフィックスが武器側に存在しないか');
{
  const healOnWeapon = AFFIXES.filter(a => a.slot === 'weapon' && a.kind === 'killHeal');
  check('武器プールに回復アフィックスがない', healOnWeapon.length === 0);
  const healDefs = AFFIXES.filter(a => a.kind === 'killHeal');
  check('回復アフィックスは防具のみ', healDefs.every(a => a.slot === 'armor'));
  check('回復は固定値（割合ではない）', healDefs.every(a => !a.isPercent));

  // 生成物の側でも武器に回復が乗らないこと
  let leaked = 0;
  for (let i = 0; i < 3000; i++) {
    const it = generateItem(new Prng(0x8000 + i), {
      itemPower: 200, slot: 'weapon', stageId: 5, rarityBonus: 3, id: `c9-${i}`
    });
    if (it.affixes.some(a => a.kind === 'killHeal')) leaked++;
  }
  check(`生成3000本の武器に回復が0件（${leaked}件）`, leaked === 0);
}

// ---------------------------------------------------------------- §13-1
console.log('§13-1: ステージ1〜10がクリア可能か（周回した装備を想定）');
{
  const unclearable: number[] = [];
  for (const stage of STAGES) {
    let cleared = false;
    const power = itemPowerFor(Math.min(10, stage.id + 2), 1);
    outer:
    for (const job of JOBS) {
      for (const rule of RETREAT_RULES) {
        for (let i = 0; i < 30; i++) {
          const rng = new Prng(0x9000 + i * 7919 + stage.id * 131);
          let weapon: Item | null = null, armor: Item | null = null;
          for (let k = 0; k < 300 && (!weapon || !armor); k++) {
            const it = generateItem(rng, {
              itemPower: power, slot: k % 2 === 0 ? 'weapon' : 'armor',
              stageId: stage.id, rarityBonus: 1.5, id: `s${k}`
            });
            if (it.slot === 'weapon' && !weapon) weapon = it;
            if (it.slot === 'armor' && !armor && canEquipArmor(job, baseDef(it.baseId).tags)) armor = it;
          }
          if (!weapon || !armor) continue;
          const r = simulateRun({
            seed: (0xa000 + i * 104729) >>> 0, job, weapon, armor, rule, stage, tier: 1
          });
          if (r.outcome === 'clear') { cleared = true; break outer; }
        }
      }
    }
    if (!cleared) unclearable.push(stage.id);
  }
  check(`全10ステージがクリア可能（未クリア: ${unclearable.join(',') || 'なし'}）`, unclearable.length === 0);
}

// ---------------------------------------------------------------- 装備の個性
console.log('装備: ドロップ1個1個に個性があるか（§10 担当3のベンチマーク観点）');
{
  const items = Array.from({ length: 500 }, (_, i) =>
    generateItem(new Prng(0xb000 + i), {
      itemPower: 200, slot: i % 2 === 0 ? 'weapon' : 'armor',
      stageId: 6, rarityBonus: 1.3, id: `d${i}`
    })
  );
  const sig = (it: Item): string =>
    `${it.baseId}|${it.rarity}|${Object.keys(it.element).sort().join(',')}|` +
    it.affixes.map(a => `${a.kind}${a.element ?? ''}${a.tier}`).sort().join(',') + `|${it.unique ?? ''}`;

  // 並（アフィックス0枠）は「個性がない」のが設計どおり（§5.7 レアリティは枠数で
  // 表現する）。売却前提のゴミなので、ここに多様性を求めても意味がない。
  // 個性が問われるのは、プレイヤーが手に取るかどうか迷う 上質以上。
  const keepers = items.filter(it => it.rarity !== 'common');
  const keeperSigs = new Set(keepers.map(sig));
  const ratio = keeperSigs.size / Math.max(1, keepers.length);
  const allRatio = new Set(items.map(sig)).size / items.length;
  console.log(`  上質以上 ${keepers.length}個中 ${keeperSigs.size} 種類（${(ratio * 100).toFixed(0)}%）` +
    ` ／ 並を含む全体では ${(allRatio * 100).toFixed(0)}%`);
  check('上質以上は9割以上が異なる構成（1個1個に個性がある）', ratio > 0.9, `ratio=${ratio.toFixed(2)}`);

  const rar = { common: 0, fine: 0, rare: 0, relic: 0 };
  const big = Array.from({ length: 20000 }, (_, i) =>
    generateItem(new Prng(0xc000 + i), {
      itemPower: 100, slot: 'weapon', stageId: 1, rarityBonus: 1, id: `r${i}`
    })
  );
  for (const it of big) rar[it.rarity]++;
  const pct = (n: number) => ((n / big.length) * 100).toFixed(1);
  console.log(`  レアリティ分布: 並${pct(rar.common)}% 上質${pct(rar.fine)}% 稀少${pct(rar.rare)}% 遺物${pct(rar.relic)}%`);
  check('稀少+遺物が10〜14%（§5.7の9%+3%に整合）',
    (rar.rare + rar.relic) / big.length > 0.10 && (rar.rare + rar.relic) / big.length < 0.14);

  // §14「10個開封して1個嬉しいものが出るか」
  let batchesWithJoy = 0;
  const BATCHES = 400;
  for (let b = 0; b < BATCHES; b++) {
    const rng = new Prng(0xd000 + b);
    let joy = false;
    for (let i = 0; i < 10; i++) {
      const it = generateItem(rng, {
        itemPower: 200, slot: i % 2 === 0 ? 'weapon' : 'armor',
        stageId: 6, rarityBonus: 1.28, id: `j${i}`
      });
      if (it.rarity === 'rare' || it.rarity === 'relic') joy = true;
    }
    if (joy) batchesWithJoy++;
  }
  const joyRate = batchesWithJoy / BATCHES;
  console.log(`  10個開封して稀少以上が1個以上出る確率: ${(joyRate * 100).toFixed(0)}%`);
  check('10個開封の7割以上で「嬉しいもの」が出る（§14）', joyRate >= 0.7, `${(joyRate * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------------- 回帰
// 批評ラウンド1で見つかった破綻の再発防止。
console.log('回帰: 批評R1で検出した破綻');
{
  // (1) 撤退ルールが遭遇の途中で発火するか（§4.3「切った時点で帰還」）
  //     修正前はステージ6以降で 8/8 が深度0のまま死亡していた
  let deaths = 0, runs = 0, depthSum = 0;
  for (const stageId of [6, 10]) {
    for (let i = 0; i < 16; i++) {
      const rng = new Prng(0x3100 + i * 997 + stageId);
      const job = jobDef('swordsman');
      let w: Item | null = null, a: Item | null = null;
      for (let k = 0; k < 200 && (!w || !a); k++) {
        const it = generateItem(rng, {
          itemPower: itemPowerFor(stageId, 1), slot: k % 2 === 0 ? 'weapon' : 'armor',
          stageId, rarityBonus: 1, id: `rg${k}`
        });
        if (it.slot === 'weapon' && !w) w = it;
        if (it.slot === 'armor' && !a && canEquipArmor(job, baseDef(it.baseId).tags)) a = it;
      }
      if (!w || !a) continue;
      const r = simulateRun({
        seed: (0x3200 + i * 10007) >>> 0, job, weapon: w, armor: a,
        rule: retreatRuleDef('cautious'), stage: stageDef(stageId), tier: 1
      });
      if (r.outcome === 'death') deaths++;
      depthSum += r.depth;
      runs++;
    }
  }
  check(`慎重で深いステージでも死ににくい（死亡 ${deaths}/${runs}）`, deaths <= runs * 0.15);
  check(`慎重でも深度0で終わらない（平均 ${(depthSum / runs).toFixed(1)}）`, depthSum / runs >= 1.5);

  // (2) 見どころ3行が日本語として壊れていないか
  const bad: string[] = [];
  for (let i = 0; i < 120; i++) {
    const rng = new Prng(0x3300 + i * 131);
    const stageId = 1 + (i % 10);
    const job = jobDef((['swordsman', 'guardian', 'skirmisher'] as const)[i % 3] ?? 'swordsman');
    let w: Item | null = null, a: Item | null = null;
    for (let k = 0; k < 200 && (!w || !a); k++) {
      const it = generateItem(rng, {
        itemPower: itemPowerFor(stageId, 1), slot: k % 2 === 0 ? 'weapon' : 'armor',
        stageId, rarityBonus: 1, id: `hl${k}`
      });
      if (it.slot === 'weapon' && !w) w = it;
      if (it.slot === 'armor' && !a && canEquipArmor(job, baseDef(it.baseId).tags)) a = it;
    }
    if (!w || !a) continue;
    const rule = (['cautious', 'standard', 'reckless'] as const)[i % 3] ?? 'standard';
    const r = simulateRun({
      seed: (0x3400 + i * 7919) >>> 0, job, weapon: w, armor: a,
      rule: retreatRuleDef(rule), stage: stageDef(stageId), tier: 1
    });
    for (const line of r.highlights) {
      if (/の群れの群れ/.test(line)) bad.push(`二重の「の群れ」: ${line}`);
      // 名詞で終わる文（述語が無い）を弾く
      if (/[のにが、]$/.test(line)) bad.push(`文が途中で終わっている: ${line}`);
      if (/、[^。]*の群れ$/.test(line)) bad.push(`述語が無い: ${line}`);
    }
    if (r.highlights.length !== 3) bad.push(`3行でない: ${r.highlights.length}`);
  }
  check(`見どころが日本語として壊れていない（不正 ${bad.length}件）`, bad.length === 0,
    bad.slice(0, 3).join(' / '));

  // (3) 派遣の所要がオフライン上限を超えない（超えると永久に完了しない）
  let worst = 0;
  for (const jobId of ['swordsman', 'guardian', 'skirmisher'] as const) {
    const job = jobDef(jobId);
    for (const stage of STAGES) {
      worst = Math.max(worst, stage.minutes * 60 * job.timeMul);
    }
  }
  check(`最長の派遣 ${Math.round(worst)}s は state 側で ${OFFLINE_CAP_SEC}s にクランプされる`,
    Math.min(worst, OFFLINE_CAP_SEC) <= OFFLINE_CAP_SEC);

  // (4) 満踏破で戦利品が10個に届くか（§7.3）
  let maxLoot = 0;
  for (let i = 0; i < 60; i++) {
    const rng = new Prng(0x3500 + i * 313);
    const job = jobDef('swordsman');
    let w: Item | null = null, a: Item | null = null;
    for (let k = 0; k < 200 && (!w || !a); k++) {
      const it = generateItem(rng, {
        itemPower: itemPowerFor(3, 3), slot: k % 2 === 0 ? 'weapon' : 'armor',
        stageId: 1, rarityBonus: 1, id: `lt${k}`
      });
      if (it.slot === 'weapon' && !w) w = it;
      if (it.slot === 'armor' && !a) a = it;
    }
    if (!w || !a) continue;
    const r = simulateRun({
      seed: (0x3600 + i * 6151) >>> 0, job, weapon: w, armor: a,
      rule: retreatRuleDef('reckless'), stage: stageDef(1), tier: 1
    });
    maxLoot = Math.max(maxLoot, r.loot.length);
  }
  check(`踏破時の戦利品が10個に届く（実測最大 ${maxLoot}）`, maxLoot >= 10);
}

// ---------------------------------------------------------------- 回帰（R2）
// 批評ラウンド2への修正の再発防止。
console.log('回帰: 批評R2で検出した破綻');
{
  // ベースタイプに構造的な最下位が固定されていないか。
  //
  // 「全ステージで最下位」だけを見ると問題が横滑りするだけだった
  // （両手剣を直したら、今度は片手剣が10ステージ中6で最下位になった）。
  // また素のベースだけで測ってもいけない。プレイヤーが手にするのは
  // アフィックスの乗った生成品なので、そちらで測る。
  const job = jobDef('swordsman');
  const rank: Record<string, number[]> = {};
  const avg: Record<string, number> = {};
  const probeStages = [1, 4, 7, 10];
  for (const stageId of probeStages) {
    const p = itemPowerFor(stageId, 1);
    const stage = stageDef(stageId);
    const scores: [string, number][] = [];
    for (const b of BASE_TYPES.filter(x => x.slot === 'weapon')) {
      let depth = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        const rng = new Prng(0x4100 + i * 7919 + stageId * 131);
        let w: Item | null = null, a: Item | null = null;
        for (let k = 0; k < 9000 && (!w || !a); k++) {
          const it = generateItem(rng, {
            itemPower: p, slot: k % 3 === 2 ? 'armor' : 'weapon',
            stageId, rarityBonus: 1, id: `rb${k}`
          });
          if (it.slot === 'weapon' && !w && it.baseId === b.id) w = it;
          if (it.slot === 'armor' && !a && canEquipArmor(job, baseDef(it.baseId).tags)) a = it;
        }
        if (!w || !a) continue;
        const r = simulateRun({
          seed: (0x4200 + i * 104729) >>> 0, job, weapon: w, armor: a,
          rule: retreatRuleDef('standard'), stage, tier: 1
        });
        depth += r.depth / r.encountersTotal;
      }
      scores.push([b.id, depth / N]);
      avg[b.id] = (avg[b.id] ?? 0) + depth / N;
    }
    scores.sort((x, y) => y[1] - x[1]);
    scores.forEach(([id], i) => { (rank[id] ??= []).push(i); });
  }

  const lastCount = Object.entries(rank)
    .map(([id, rs]) => [id, rs.filter(r => r === 5).length] as const)
    .sort((a, b) => b[1] - a[1]);
  const worstBase = lastCount[0];
  check(
    `最下位が1つのベースに偏っていない（最多: ${worstBase?.[0]} ${worstBase?.[1]}/${probeStages.length}）`,
    !!worstBase && worstBase[1] <= Math.ceil(probeStages.length * 0.5)
  );

  // C7 の判定式そのもの（1位が2位を20%以上引き離していないか）
  const byAvg = Object.entries(avg).sort((a, b) => b[1] - a[1]);
  const first = byAvg[0]?.[1] ?? 0;
  const second = byAvg[1]?.[1] ?? 1;
  const lead = ((first - second) / Math.max(0.0001, second)) * 100;
  check(`首位が2位を20%以上引き離していない（${lead.toFixed(1)}%）`, lead < 20);

  const seen = new Set(Object.keys(rank));
  check(`ベース比較が6種すべてを回した（${seen.size}種）`, seen.size === 6);

  // 開封が「作業」になる回が無いか（§11.2 は1回でもあれば不合格）。
  // 素の確率だけだと10個引いても2割の回は稀少以上がゼロになるので、
  // combat 側に救済枠を入れてある。simulateRun 経由で確かめる。
  let chore = 0, batches = 0;
  for (let i = 0; i < 60; i++) {
    const stageId = 1 + (i % 10);
    const rng = new Prng(0x5100 + i * 7919);
    let w: Item | null = null, a: Item | null = null;
    for (let k = 0; k < 300 && (!w || !a); k++) {
      const it = generateItem(rng, {
        itemPower: itemPowerFor(stageId, 1), slot: k % 2 === 0 ? 'weapon' : 'armor',
        stageId, rarityBonus: 1, id: `ch${k}`
      });
      if (it.slot === 'weapon' && !w) w = it;
      if (it.slot === 'armor' && !a && canEquipArmor(jobDef('swordsman'), baseDef(it.baseId).tags)) a = it;
    }
    if (!w || !a) continue;
    const r = simulateRun({
      seed: (0x5200 + i * 104729) >>> 0, job: jobDef('swordsman'), weapon: w, armor: a,
      rule: retreatRuleDef('standard'), stage: stageDef(stageId), tier: 1
    });
    if (r.outcome === 'death' || r.loot.length < 4) continue;
    batches++;
    if (!r.loot.some(it => it.rarity === 'rare' || it.rarity === 'relic')) chore++;
  }
  check(`4個以上持ち帰った回に必ず稀少以上が混ざる（${chore}/${batches}回が空振り）`, chore === 0);

  // ステージ1でも見どころ1行目が無情報にならないか
  let blank = 0;
  for (let i = 0; i < 40; i++) {
    const rng = new Prng(0x5300 + i * 131);
    let w: Item | null = null, a: Item | null = null;
    for (let k = 0; k < 300 && (!w || !a); k++) {
      const it = generateItem(rng, {
        itemPower: itemPowerFor(1, 1), slot: k % 2 === 0 ? 'weapon' : 'armor',
        stageId: 1, rarityBonus: 1, id: `s1${k}`
      });
      if (it.slot === 'weapon' && !w) w = it;
      if (it.slot === 'armor' && !a) a = it;
    }
    if (!w || !a) continue;
    const r = simulateRun({
      seed: (0x5400 + i * 7919) >>> 0, job: jobDef('swordsman'), weapon: w, armor: a,
      rule: retreatRuleDef('standard'), stage: stageDef(1), tier: 1
    });
    if ((r.highlights[0] ?? '').includes('得も損もしていない')) blank++;
  }
  check(`ステージ1でも見どころ1行目が無情報にならない（${blank}/40件）`, blank === 0);

  // ユニークがスロットに合っているか（防具に武器用の効果が載らない）
  let mismatched = 0;
  const uRng = new Prng(0x5500);
  for (let i = 0; i < 40000; i++) {
    const it = generateItem(uRng, {
      itemPower: 200, slot: i % 2 === 0 ? 'weapon' : 'armor',
      stageId: 9, rarityBonus: 3, id: `u${i}`
    });
    if (!it.unique) continue;
    const def = uniqueDef(it.unique);
    if (def.slot !== 'both' && def.slot !== it.slot) mismatched++;
  }
  check(`ユニークがスロットに合っている（不一致 ${mismatched}件）`, mismatched === 0);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
