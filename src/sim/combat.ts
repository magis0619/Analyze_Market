import { Prng } from './prng';
import type {
  AffixKind, Element, Item, JobDef, RetreatRuleDef, RunResult, StageDef
} from './types';
import { baseDef } from '../data/bases';
import { affixDef } from '../data/affixes';
import { bossName, difficultyMul, itemPowerFor } from '../data/stages';
import { generateItem } from './items';
import { enemiesForStage } from '../data/enemies';

// 戦闘シミュレーション（仕様書 §6）。
// 戦闘は内部ターン制で解決し、画面には一切描画しない。
// このモジュールは Canvas / DOM を参照しない（C6）。

/**
 * バランス調整用の定数。
 *
 * 設計の勘所: HPは1ステージを通して単調減少する（§6.2）。自動回復がないため、
 * 「1遭遇あたりに削られるHP × 遭遇数」が最大HPを超えるかどうかで到達深度が決まる。
 * 装備が噛み合っていれば7〜8割の深さまで進み、噛み合っていなければ早々に
 * 撤退ラインへ落ちる、という配分を狙って実測しながら詰めた値。
 */
const TUNING = {
  enemyHp: 46,
  enemyAttack: 6.0,
  enemyDefense: 4.2,
  enemyInterval: 2.2,
  bossHp: 200,
  bossAttack: 8.0,
  /** 防御率の分母係数。大きいほど防具が効きにくい */
  defenseConst: 30,
  defenseCap: 0.8
};

/** 内部解決の時間刻み（秒）。実時間とは無関係の仮想時間。 */
const DT = 0.25;
/** 1遭遇の打ち切り（無限ループ防止）。仮想秒。 */
const ENCOUNTER_TIMEOUT = 180;
/** 戦利品の上限（§7.3）。職・ユニークの加算を含めてこれを超えない。 */
const MAX_LOOT = 10;

// ---------------------------------------------------------------- 敵

interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  /** 攻撃間隔（秒） */
  interval: number;
  isBoss: boolean;
}

/** ステージ・難易度・深度から敵の強さの基準値を出す。 */
function enemyScale(stage: StageDef, tier: number, encIdx: number): number {
  const depth = encIdx / Math.max(1, stage.encounters - 1);
  return (0.85 + 0.20 * stage.id) * difficultyMul(tier) * (1 + depth * 0.5);
}

/**
 * 敵の攻撃力だけに掛ける正規化係数。
 *
 * HPは1ステージを通して単調減少し、自動回復がない（§6.2）。そのため
 * 「1遭遇あたりの被ダメージ」が一定なら、遭遇数の多い深いステージほど
 * 到達率が機械的に落ちてしまい、遭遇数を増やすこと自体が難易度になってしまう。
 * 遭遇数はステージの長さ（体感の尺）を決めるための値であって、難易度の
 * ハンドルではない。よって被ダメージの総量が遭遇数に依らないよう正規化し、
 * 難易度はステージ係数・深度ランプ・属性の噛み合いだけで表現する。
 */
function attritionNorm(stage: StageDef): number {
  return 9 / stage.encounters;
}

function makeEnemies(
  rng: Prng, stage: StageDef, tier: number, encIdx: number, isBossFight: boolean
): Enemy[] {
  const scale = enemyScale(stage, tier, encIdx);
  if (isBossFight) {
    return [{
      name: bossName(stage.id),
      hp: TUNING.bossHp * scale, maxHp: TUNING.bossHp * scale,
      attack: TUNING.bossAttack * scale * attritionNorm(stage),
      defense: TUNING.enemyDefense * 1.3 * scale,
      interval: 2.0,
      isBoss: true
    }];
  }
  // 1遭遇の敵数は 3〜5 体（§6.2）
  const count = 3 + rng.int(3);
  // 1遭遇＝同じ種類の群れ。名前が遭遇ごとに変わることで、
  // レポートの「何に倒されたか」が具体的になる
  const pool = enemiesForStage(stage.id);
  const label = pool.length > 0 ? rng.pick(pool).name : '魔物';
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = 0.85 + rng.float() * 0.3;
    enemies.push({
      name: label,
      hp: TUNING.enemyHp * scale * jitter, maxHp: TUNING.enemyHp * scale * jitter,
      attack: TUNING.enemyAttack * scale * attritionNorm(stage),
      defense: TUNING.enemyDefense * scale,
      interval: TUNING.enemyInterval,
      isBoss: false
    });
  }
  return enemies;
}

// ---------------------------------------------------------------- 属性

/** 属性係数：耐性属性なら0.5、弱点属性なら1.5、それ以外1.0（§6.3）。 */
function elementMul(stage: StageDef, elem: Element): number {
  if (stage.resists.includes(elem)) return 0.5;
  if (stage.weakTo === elem) return 1.5;
  return 1.0;
}

// ---------------------------------------------------------------- 装備の集計

interface Loadout {
  attack: number;
  speed: number;
  critRate: number;
  critMul: number;
  /** 属性ごとの実効攻撃力（属性係数適用前の配分） */
  split: [Element, number][];
  /** 属性ごとの固定追加ダメージ */
  flatElem: [Element, number][];
  attackPct: number;
  lowHpPct: number;
  comboSpeedPct: number;
  defense: number;
  defensePct: number;
  /** 属性ごとの耐性(0〜1) */
  resist: Partial<Record<Element, number>>;
  killHeal: number;
  weaponUnique: Item['unique'];
  armorUnique: Item['unique'];
}

function buildLoadout(weapon: Item, armor: Item): Loadout {
  const wBase = baseDef(weapon.baseId);
  const lo: Loadout = {
    attack: weapon.power,
    speed: weapon.speed || wBase.speed,
    critRate: weapon.crit / 100,
    critMul: 1.5,
    split: [],
    flatElem: [],
    attackPct: 0,
    lowHpPct: 0,
    comboSpeedPct: 0,
    defense: armor.power,
    defensePct: 0,
    resist: {},
    killHeal: 0,
    weaponUnique: weapon.unique,
    armorUnique: armor.unique
  };
  for (const [k, v] of Object.entries(weapon.element)) {
    if (v !== undefined && v > 0) lo.split.push([k as Element, v]);
  }
  if (lo.split.length === 0) lo.split.push(['physical', 1]);

  for (const a of weapon.affixes) {
    switch (a.kind) {
      case 'attackPct': lo.attackPct += a.value; break;
      case 'critDmgPct': lo.critMul += a.value / 100; break;
      case 'elementFlat': lo.flatElem.push([a.element ?? 'fire', a.value]); break;
      case 'lowHpPct': lo.lowHpPct += a.value; break;
      case 'comboSpeedPct': lo.comboSpeedPct += a.value; break;
      default: break;
    }
  }
  for (const a of armor.affixes) {
    switch (a.kind) {
      case 'defensePct': lo.defensePct += a.value; break;
      case 'resistPct': {
        const e = a.element ?? 'fire';
        lo.resist[e] = (lo.resist[e] ?? 0) + a.value / 100;
        break;
      }
      case 'killHeal': lo.killHeal += a.value; break;
      default: break;
    }
  }
  // L4 ユニーク（§5.5）
  if (weapon.unique === 'noCritFlatPower') {
    lo.critRate = 0;
    lo.attackPct += 25;
  }
  if (weapon.unique === 'slowTriple') {
    lo.speed *= 0.5;
  }
  return lo;
}

// ---------------------------------------------------------------- 記録

interface Telemetry {
  damageByElement: Partial<Record<Element, number>>;
  damageByAffix: Partial<Record<AffixKind, number>>;
  /** 属性係数によって失った／得た分 */
  resistedLoss: number;
  weaknessGain: number;
  totalDealt: number;
  totalTaken: number;
  takenByElement: Partial<Record<Element, number>>;
  resistSaved: number;
  healed: number;
  crits: number;
  hits: number;
  kills: number;
  biggestHit: number;
  evaded: number;
}

function newTelemetry(): Telemetry {
  return {
    damageByElement: {}, damageByAffix: {},
    resistedLoss: 0, weaknessGain: 0, totalDealt: 0,
    totalTaken: 0, takenByElement: {}, resistSaved: 0,
    healed: 0, crits: 0, hits: 0, kills: 0, biggestHit: 0, evaded: 0
  };
}

// ---------------------------------------------------------------- 本体

export interface SimulateInput {
  seed: number;
  job: JobDef;
  weapon: Item;
  armor: Item;
  rule: RetreatRuleDef;
  stage: StageDef;
  /** 難易度ティア（1始まり。ステージ10クリアで+1） */
  tier: number;
}

export function simulateRun(input: SimulateInput): RunResult {
  const { job, weapon, armor, rule, stage, tier } = input;
  const rng = new Prng(input.seed);
  const lo = buildLoadout(weapon, armor);
  const tm = newTelemetry();

  const maxHp = job.hp;
  let hp = maxHp;
  const hpCurve: number[] = [1];

  // 大振りの武器は薙ぎ払う（下の攻撃処理を参照）
  const cleaves = baseDef(weapon.baseId).tags.includes('heavy');

  const greedy = weapon.unique === 'greedyGlass' || armor.unique === 'greedyGlass';
  const takenMul = job.damageTakenMul * (greedy ? 1.25 : 1);

  let killStackBonus = 0;
  let outcome: RunResult['outcome'] = 'clear';
  let depth = 0;
  let bossDefeated = false;
  let deathCause = '';

  // 属性係数を先に確定しておく（表示・見どころ用にも使う）
  const splitMuls = lo.split.map(([e, p]) => ({ e, p, mul: elementMul(stage, e) }));

  // 遭遇の途中で撤退ラインを割ったかどうか
  let bailedMidEncounter = false;

  for (let encIdx = 0; encIdx < stage.encounters; encIdx++) {
    const isBossFight = encIdx === stage.encounters - 1;
    const enemies = makeEnemies(rng, stage, tier, encIdx, isBossFight);
    let combo = 0;
    let attackAccum = 0;
    const enemyAccum = enemies.map(() => 0);
    let t = 0;

    while (t < ENCOUNTER_TIMEOUT) {
      if (enemies.every(e => e.hp <= 0)) break;
      if (hp <= 0) break;
      // §4.3 は「HPが閾値を切った時点で帰還」と定めている。遭遇と遭遇の間で
      // しか見ないと、1回の遭遇で押し切られたときに撤退ルールが一切効かない
      // （実測でステージ6以降は8/8が深度0で死亡していた）。
      // ボス戦だけは途中離脱させない（勝ち切るか死ぬかの局面のため）。
      if (rule.threshold > 0 && !isBossFight && hp / maxHp < rule.threshold) {
        bailedMidEncounter = true;
        break;
      }

      // --- プレイヤーの攻撃 ---
      const comboMul = 1 + (Math.min(5, combo) * lo.comboSpeedPct) / 100;
      attackAccum += lo.speed * comboMul * DT;
      while (attackAccum >= 1) {
        attackAccum -= 1;
        const target = enemies.find(e => e.hp > 0);
        if (!target) break;

        const lowHp = hp / maxHp <= 0.5 ? lo.lowHpPct : 0;
        const pctMul = 1 + (lo.attackPct + lowHp) / 100;
        const atkBase = lo.attack + killStackBonus;

        // 属性配分ごとに係数を掛ける（§6.3）
        let raw = 0;
        const perElement: [Element, number][] = [];
        for (const s of splitMuls) {
          const d = atkBase * s.p * s.mul * pctMul;
          raw += d;
          perElement.push([s.e, d]);
          const flat = atkBase * s.p * pctMul;
          if (s.mul < 1) tm.resistedLoss += flat - d;
          if (s.mul > 1) tm.weaknessGain += d - flat;
        }
        // 属性ダメージ追加アフィックス
        let flatAffixDealt = 0;
        for (const [e, v] of lo.flatElem) {
          const d = v * elementMul(stage, e) * pctMul;
          raw += d;
          flatAffixDealt += d;
          perElement.push([e, d]);
        }

        const uniqueMul = weapon.unique === 'slowTriple' ? 3 : 1;
        let dmg = Math.max(1, raw * uniqueMul - target.defense);

        let isCrit = false;
        if (lo.critRate > 0 && rng.float() < lo.critRate) {
          isCrit = true;
          dmg *= lo.critMul;
          tm.crits++;
        }

        // 集計（見どころ生成用）
        const scale = raw > 0 ? dmg / raw : 0;
        for (const [e, d] of perElement) {
          tm.damageByElement[e] = (tm.damageByElement[e] ?? 0) + d * scale;
        }
        if (lo.attackPct > 0) {
          const share = dmg * (lo.attackPct / 100) / pctMul;
          tm.damageByAffix.attackPct = (tm.damageByAffix.attackPct ?? 0) + share;
        }
        if (lowHp > 0) {
          const share = dmg * (lowHp / 100) / pctMul;
          tm.damageByAffix.lowHpPct = (tm.damageByAffix.lowHpPct ?? 0) + share;
        }
        if (flatAffixDealt > 0) {
          tm.damageByAffix.elementFlat =
            (tm.damageByAffix.elementFlat ?? 0) + flatAffixDealt * scale;
        }
        if (isCrit) {
          const share = dmg * (1 - 1 / lo.critMul);
          tm.damageByAffix.critDmgPct = (tm.damageByAffix.critDmgPct ?? 0) + share;
        }
        if (combo > 0 && lo.comboSpeedPct > 0) {
          tm.damageByAffix.comboSpeedPct =
            (tm.damageByAffix.comboSpeedPct ?? 0) + dmg * (comboMul - 1);
        }
        tm.totalDealt += dmg;
        tm.hits++;
        tm.biggestHit = Math.max(tm.biggestHit, dmg);
        combo = Math.min(5, combo + 1);

        // slowTriple は範囲攻撃（§5.5）
        if (weapon.unique === 'slowTriple') {
          for (const e of enemies) {
            if (e.hp <= 0) continue;
            e.hp -= dmg;
            if (e.hp <= 0) onKill();
          }
        } else if (cleaves) {
          // 大振りの武器（heavy タグ）は、倒しきって余った分を次の敵へ薙ぎ払う。
          //
          // これが無いと大振り型は構造的に必ず最下位になる。敵1体のHPは46で、
          // 両手剣の一撃は90前後——毎回ほぼ半分が死体に吸われて捨てられる。
          // 一方で被ダメージは実時間で入るので、遅い武器ほど倒しきるまでに
          // 余計に殴られ、撤退ラインに早く落ちる。実測でも両手剣は全ステージで
          // 最下位（ステージ4で踏破率49.9%、短剣は72.5%）だった。
          // 余剰を繰り越すことで「1体ずつなら普通、群れには滅法強い」という
          // 大振り型の取り柄が生まれ、手数型とのトレードオフが成立する。
          let carry = dmg;
          for (const e of enemies) {
            if (carry <= 0) break;
            if (e.hp <= 0) continue;
            const applied = Math.min(e.hp, carry);
            e.hp -= applied;
            carry -= applied;
            if (e.hp <= 0) onKill(); else break;
          }
        } else {
          target.hp -= dmg;
          if (target.hp <= 0) onKill();
        }
      }

      // --- 敵の攻撃 ---
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || e.hp <= 0) continue;
        enemyAccum[i] = (enemyAccum[i] ?? 0) + DT / e.interval;
        while ((enemyAccum[i] ?? 0) >= 1) {
          enemyAccum[i] = (enemyAccum[i] ?? 0) - 1;
          if (job.evasion > 0 && rng.float() < job.evasion) {
            tm.evaded++;
            continue;
          }
          const elem: Element = stage.enemyElement === 'mixed'
            ? (['fire', 'ice', 'lightning', 'poison'] as const)[rng.int(4)] ?? 'fire'
            : stage.enemyElement;
          const defTotal = lo.defense * (1 + lo.defensePct / 100);
          const defRate = Math.min(
            TUNING.defenseCap,
            defTotal / (defTotal + TUNING.defenseConst * enemyScale(stage, tier, encIdx))
          );
          const res = Math.min(0.75, lo.resist[elem] ?? 0);
          const beforeRes = e.attack * (1 - defRate) * takenMul;
          const taken = beforeRes * (1 - res);
          tm.resistSaved += beforeRes - taken;
          hp -= taken;
          tm.totalTaken += taken;
          tm.takenByElement[elem] = (tm.takenByElement[elem] ?? 0) + taken;
          if (hp <= 0) {
            deathCause = e.name;
            break;
          }
        }
        if (hp <= 0) break;
      }

      t += DT;
    }

    function onKill(): void {
      tm.kills++;
      if (weapon.unique === 'killStack') killStackBonus += 1;
      if (lo.killHeal > 0 && hp > 0) {
        const before = hp;
        hp = Math.min(maxHp, hp + lo.killHeal);
        tm.healed += hp - before;
      }
    }

    if (bailedMidEncounter) {
      // その遭遇は踏破していないので深度は encIdx のまま
      outcome = 'retreat';
      depth = encIdx;
      hpCurve.push(Math.max(0, hp / maxHp));
      break;
    }

    if (hp <= 0) {
      outcome = 'death';
      depth = encIdx;
      hpCurve.push(0);
      break;
    }

    depth = encIdx + 1;
    hpCurve.push(Math.max(0, hp / maxHp));
    if (isBossFight) bossDefeated = true;

    // 撤退判定（§4.3）。深追いは threshold 0 なので発火しない
    if (rule.threshold > 0 && hp / maxHp < rule.threshold && !isBossFight) {
      outcome = 'retreat';
      break;
    }
  }

  if (outcome === 'clear' && depth < stage.encounters) {
    // 打ち切り等で最後まで行けなかった場合は撤退扱い
    outcome = 'retreat';
  }

  // --- 戦利品（§7.3 未鑑定品を最大10個）---
  const loot: Item[] = [];
  if (outcome !== 'death') {
    // 満踏破で MAX_LOOT に届く配分にする（§7.3「未鑑定品を最大10個」）。
    // 職・ユニークの加算は上限未満のときに効く。
    let count = Math.round(2 + (depth / stage.encounters) * (MAX_LOOT - 2));
    count += job.bonusDrops;
    if (greedy) count = Math.round(count * 1.5);
    count = Math.max(0, Math.min(MAX_LOOT, count));
    const power = itemPowerFor(stage.id, tier);
    for (let i = 0; i < count; i++) {
      const slot = pickSlot(rng, stage.dropBias);
      loot.push(generateItem(rng, {
        itemPower: power,
        slot,
        stageId: stage.id,
        rarityBonus: stage.rarityBonus,
        id: `${input.seed.toString(36)}-${i}`
      }));
    }
  }

  const gold = outcome === 'death'
    ? 0
    : Math.round(depth * (6 + stage.id * 3) * difficultyMul(tier));

  const durationSec = Math.round(
    (stage.minutes * 60) * job.timeMul * (depth / stage.encounters)
  );

  return {
    outcome,
    depth,
    encountersTotal: stage.encounters,
    bossDefeated,
    loot,
    gold,
    headline: buildHeadline(outcome, depth, stage, bossDefeated, deathCause),
    highlights: buildHighlights(tm, weapon, armor, outcome, splitMuls, deathCause,
      depth, stage.encounters),
    hpCurve,
    durationSec: Math.max(1, durationSec)
  };
}

function pickSlot(rng: Prng, bias: StageDef['dropBias']): 'weapon' | 'armor' {
  const p = bias === 'weapon' ? 0.65 : bias === 'armor' ? 0.35 : 0.5;
  return rng.float() < p ? 'weapon' : 'armor';
}

// ---------------------------------------------------------------- 出力文

function buildHeadline(
  outcome: RunResult['outcome'], depth: number, stage: StageDef,
  bossDefeated: boolean, deathCause: string
): string {
  if (outcome === 'death') {
    return `深度${depth}で力尽きた／${deathCause || '力及ばず'}`;
  }
  if (outcome === 'clear') {
    return `${stage.name}を踏破／ボス『${bossName(stage.id)}』撃破`;
  }
  return bossDefeated
    ? `深度${depth}で撤退／ボス『${bossName(stage.id)}』撃破`
    : `深度${depth}で撤退／${stage.name}`;
}

const ELEM_NAME: Record<Element, string> = {
  physical: '物理', fire: '炎', lightning: '雷', poison: '毒', ice: '氷'
};

/**
 * 見どころ3行（§7.3）。**最重要。**
 * なぜその結果になったかが分からないと、完全な運ゲーに感じられる。
 * 「最も大きなダメージ要因」「最も効いたアフィックス」「敗因」を出す。
 */
function buildHighlights(
  tm: Telemetry, weapon: Item, armor: Item,
  outcome: RunResult['outcome'],
  splitMuls: { e: Element; p: number; mul: number }[],
  deathCause: string, depth: number, total: number
): string[] {
  const lines: string[] = [];
  const dealt = Math.max(1, tm.totalDealt);
  const taken = Math.max(1, tm.totalTaken);

  // --- 1行目: 属性の噛み合い（＝武器選択の答え合わせ）---
  const resisted = splitMuls.filter(s => s.mul < 1);
  const weak = splitMuls.filter(s => s.mul > 1);
  if (resisted.length > 0 && tm.resistedLoss > dealt * 0.10) {
    const names = resisted.map(s => ELEM_NAME[s.e]).join('と');
    const lost = Math.round((tm.resistedLoss / (dealt + tm.resistedLoss)) * 100);
    lines.push(`${names}が効かない敵に${names}武器で挑み、火力を約${lost}%捨てていた`);
  } else if (weak.length > 0 && tm.weaknessGain > dealt * 0.05) {
    const names = weak.map(s => ELEM_NAME[s.e]).join('と');
    const gain = Math.round((tm.weaknessGain / Math.max(1, dealt - tm.weaknessGain)) * 100);
    lines.push(`${names}が弱点を突き、火力を約${gain}%上乗せできた`);
  } else if (resisted.length > 0) {
    const names = resisted.map(s => ELEM_NAME[s.e]).join('と');
    lines.push(`${names}は半減される相手だったが、配分が小さく実害は軽かった`);
  } else {
    lines.push('属性は等倍。相性で得も損もしていない');
  }

  // --- 2行目: 効いた装備（アフィックス／ユニーク）---
  if (weapon.unique) {
    lines.push(`遺物の効果が乗り、${tm.hits}回の攻撃を支えた`);
  } else {
    const topAffix = topEntry(tm.damageByAffix);
    if (topAffix && topAffix[1] > dealt * 0.05) {
      const def = affixDef(topAffix[0] as AffixKind);
      lines.push(`「${def.name}」が総ダメージの${Math.round((topAffix[1] / dealt) * 100)}%を稼いだ`);
    } else if (weapon.affixes.length === 0) {
      lines.push('武器にアフィックスが無く、素の攻撃力だけで押していた');
    } else {
      // 会心は「発生率が低い＝結果を左右していない」ことまで含めて正直に書く。
      // 4〜9%の会心を「結果を左右した」と断ずるのは虚偽になる。
      const rate = tm.hits > 0 ? Math.round((tm.crits / tm.hits) * 100) : 0;
      lines.push(rate >= 20
        ? `${tm.hits}回中${tm.crits}回が会心。会心が火力の柱だった`
        : `会心は${tm.hits}回中${tm.crits}回（${rate}%）で、勝敗にはほぼ関与していない`);
    }
  }

  // --- 3行目: 生存の要因／敗因 ---
  if (outcome === 'death') {
    const e = topEntry(tm.takenByElement);
    const en = e ? ELEM_NAME[e[0] as Element] : '敵';
    const hasResist = armor.affixes.some(a => a.kind === 'resistPct' && a.element === e?.[0]);
    if (!hasResist && tm.resistSaved < taken * 0.05) {
      lines.push(`${en}属性の攻撃に耐性が無く、${deathCause || '数に押し切られて'}倒れた`);
    } else if (tm.hits > 0 && dealt / Math.max(1, tm.kills) > 0) {
      lines.push(`防具は仕事をしたが、火力が足りず長期戦になって削り切られた`);
    } else {
      lines.push(`${deathCause || '敵'}に押し切られた`);
    }
  } else if (outcome === 'retreat') {
    const reason = tm.healed > 0
      ? `撃破時回復が計${Math.round(tm.healed)}を戻したが追いつかなかった`
      : tm.resistSaved > taken * 0.10
        ? `属性耐性が被弾を約${Math.round((tm.resistSaved / (taken + tm.resistSaved)) * 100)}%減らした`
        : tm.evaded > 0
          ? `回避が${tm.evaded}回。被弾は抑えたが決め手に欠けた`
          : '防御の支えが無く、HPの残量だけが頼りだった';
    lines.push(`${depth}/${total}で撤退ラインに触れた。${reason}`);
  } else {
    lines.push(tm.healed > 0
      ? `撃破時回復が計${Math.round(tm.healed)}を戻し、最後まで余力を保った`
      : tm.resistSaved > taken * 0.10
        ? `属性耐性が被弾を約${Math.round((tm.resistSaved / (taken + tm.resistSaved)) * 100)}%減らし、踏破を支えた`
        : '被弾を正面から受け切って踏破した');
  }

  return lines.slice(0, 3);
}

function topEntry(rec: Partial<Record<string, number>>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;
    if (!best || v > best[1]) best = [k, v];
  }
  return best;
}
