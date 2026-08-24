import { Prng } from './prng';
import type {
  AdvSnapshot, DungeonEventDef, EventOptionDef, OfferedOption,
  RunOutcome, SimEvent, SimInput, SimResult
} from './types';
import { DUNGEON_EVENTS } from '../data/events';
import { EQUIPMENT, equipDef, isLightOutfit, isOverweight } from '../data/equipment';
import { LOOT } from '../data/loot';

// 決定論シミュレーション（仕様 §4）。
// simulate(seed, adventurer, equipment[], choices[]) => SimResult
// 1ランは seed + 装備ID配列 + 選択履歴 だけで完全再現できる。
// このモジュールは Canvas / DOM を一切参照しない。

export const RUN_SECONDS = 60;
export const CHOICE_TIMES: readonly number[] = [14, 34, 54];
const DESCENT_RATE = 0.16; // depth per second
const DEPTH_CAP = 11.9;    // E15 撃破以外で 12 に到達しない
const MAX_DEPTH = 12;

const AMBIENT_LINES: readonly string[] = [
  '岩肌に古い縄の跡がある',
  '遠くで水の滴る音がする',
  '壁の苔がかすかに光っている',
  '風が下から吹き上げてくる',
  '誰かの足跡が下へ続いている',
  '崩れた坑木をまたいで進む',
  '冷たい空気が濃くなってきた',
  '小石がひとりでに転がり落ちた',
  '梯子の段がひとつ欠けている',
  '壁に爪で削った印が残る',
  '遠くで何かの咆哮が反響した',
  '足元から生ぬるい風が抜ける',
  '鼠が壁の隙間へ逃げ込んだ',
  '古い矢じりが岩に刺さっている',
  '滴る水が帽子を叩いた',
  '燃え尽きた松明が落ちている',
  '壁の白い骨を横目に過ぎる',
  '砂がさらさらと流れ落ちる',
  '手すりほどの太い根が垂れる',
  '空になった水筒が転がっている',
  '岩の隙間から目が光った気がした',
  '遠雷のような地鳴りがした'
];

interface SimState {
  t: number;
  depth: number;
  hp: number;
  timePenalty: number; // 残り停止秒数（採掘・迂回などの時間消費）
  loot: string[];
  gold: number;
  usedHeal: boolean;
  carried: string[]; // 途中入手（E5）を含む
  usedEventIds: string[];
  /** 選択の根拠として実際に使われた装備（消耗が進む） */
  usedEquip: string[];
  events: SimEvent[];
  // 手紙用の記録
  bestUse?: { equipId: string; score: number; line: string };
  overweightBlocked?: string; // 重装のせいで選択肢が閉じたイベント名
  deathCause?: string;
  retreatReason?: string;
  fate?: 'survived' | 'died' | 'retreated';
  slayedGuardian: boolean;
}

function offeredOptions(
  def: DungeonEventDef, adv: AdvSnapshot, carried: string[], st: SimState
): OfferedOption[] {
  const light = isLightOutfit(carried, adv.level);
  const over = isOverweight(carried, adv.level);
  const constant: OfferedOption[] = [];
  const fromEquip: OfferedOption[] = [];

  for (const opt of def.options) {
    if (!opt.requires) {
      constant.push({ def: opt, sourceEquip: [], disabled: false });
      continue;
    }
    const req = opt.requires;
    const src: string[] = [];
    let ok = true;
    if (req.items) {
      for (const id of req.items) {
        if (carried.includes(id)) src.push(id);
        else ok = false;
      }
    }
    if (ok && req.anyOf) {
      const hit = req.anyOf.find(id => carried.includes(id));
      if (hit) src.push(hit);
      else ok = false;
    }
    if (ok && req.favoredWeapon) {
      if (carried.includes(adv.favoredWeapon)) src.push(adv.favoredWeapon);
      else ok = false;
    }
    if (ok && req.light) {
      if (!light) {
        // 装備条件は満たすのに重装のせいで閉じた場合を手紙用に記録
        if (src.length > 0 && over) st.overweightBlocked = def.name;
        ok = false;
      }
    }
    if (ok && src.length > 0) {
      fromEquip.push({ def: opt, sourceEquip: src, disabled: false });
    }
  }

  // 傷薬：戦闘系でないイベントで、消耗していて未使用なら追加の選択肢が開く
  const safeOpt = def.options.find(o => o.safe);
  const nonCombat = !safeOpt || safeOpt.effects.dmg === undefined;
  if (
    nonCombat && !st.usedHeal && carried.includes('T4') &&
    st.hp < adv.maxHp * 0.7 && fromEquip.length < 2
  ) {
    fromEquip.push({
      def: {
        id: 'heal', label: '傷薬で手当てする',
        requires: { items: ['T4'] },
        effects: { heal: true },
        logLine: '傷薬で傷口をふさいだ'
      },
      sourceEquip: ['T4'],
      disabled: false
    });
  }

  // 選択肢 = 常時(1〜2) + 装備で開く(0〜2)
  const opts = [...constant, ...fromEquip.slice(0, 2)];

  // 短気：他に選べる選択肢がある場合のみ「逃げる」をグレーアウト
  if (adv.personality === 'hasty') {
    const fleeIdx = opts.filter(o => o.def.flee);
    const nonFlee = opts.filter(o => !o.def.flee);
    if (fleeIdx.length > 0 && nonFlee.length > 0) {
      for (const o of fleeIdx) {
        o.disabled = true;
        o.disabledReason = '短気';
      }
    }
  }
  return opts;
}

/** 装備が何かしらの選択肢を開き得るイベントか（抽選の重み付け用・副作用なし）。 */
function wouldOpenEquipOption(
  def: DungeonEventDef, adv: AdvSnapshot, carried: string[]
): boolean {
  const light = isLightOutfit(carried, adv.level);
  for (const opt of def.options) {
    const req = opt.requires;
    if (!req) continue;
    let ok = true;
    if (req.items) ok = req.items.every(id => carried.includes(id));
    if (ok && req.anyOf) ok = req.anyOf.some(id => carried.includes(id));
    if (ok && req.favoredWeapon) ok = carried.includes(adv.favoredWeapon);
    if (ok && req.light) ok = light;
    if (ok) return true;
  }
  return false;
}

function pickEvent(
  rng: Prng, depth: number, used: string[], final: boolean,
  adv: AdvSnapshot, carried: string[]
): DungeonEventDef {
  const d = Math.max(1, Math.floor(depth));
  if (final && depth >= 11.5) {
    const e15 = DUNGEON_EVENTS.find(e => e.id === 'E15');
    if (e15) return e15;
  }
  const pool = DUNGEON_EVENTS.filter(e =>
    e.id !== 'E15' && !used.includes(e.id) && d >= e.minDepth && d <= e.maxDepth
  );
  if (pool.length > 0) {
    // 「渡しておいた装備が効く」瞬間を作るため、装備で開き得るイベントへ40%寄せる。
    // 装備0点なら openable は常に空で、抽選は完全に一様（C6 を破らない）。
    // 比率は65%から引き下げ済み：複数イベントに跨って有利な装備（縄梯子等）を
    // 抽選面でも増幅してしまい、単品性能の差を超えて偏りを拡大させていたため
    // （批評ラウンド2 B-1）。装備1つが2イベントに噛む場合、両方とも
    // openable に入り抽選が二重に有利になるので、寄せ幅そのものを抑える。
    const openable = pool.filter(e => wouldOpenEquipOption(e, adv, carried));
    const roll = rng.chance(0.4);
    if (openable.length > 0 && roll) return rng.pick(openable);
    // 「1択＋5秒待ち」のパネルを減らすため、常時選択肢が2つあるイベントを優先
    const multi = pool.filter(e =>
      e.options.filter(o => !o.requires).length >= 2 || wouldOpenEquipOption(e, adv, carried)
    );
    const roll2 = rng.chance(0.5);
    if (multi.length > 0 && roll2) return rng.pick(multi);
    return rng.pick(pool);
  }
  // 範囲に該当なし：最も近い帯のイベントへフォールバック
  const all = DUNGEON_EVENTS.filter(e => e.id !== 'E15' && !used.includes(e.id));
  const source = all.length > 0 ? all : DUNGEON_EVENTS.filter(e => e.id !== 'E15');
  let best = source[0];
  let bestDist = Infinity;
  for (const e of source) {
    const dist = d < e.minDepth ? e.minDepth - d : d > e.maxDepth ? d - e.maxDepth : 0;
    if (dist < bestDist) { bestDist = dist; best = e; }
  }
  if (!best) throw new Error('no event available');
  return best;
}

function rollLoot(rng: Prng, depth: number, rare: boolean): string {
  const d = Math.max(1, Math.floor(depth));
  const pool = LOOT.filter(l => l.rare === rare && d >= l.minDepth && d <= l.maxDepth);
  const fallback = LOOT.filter(l => l.rare === rare);
  const src = pool.length > 0 ? pool : fallback;
  return rng.pick(src).id;
}

function useScore(effects: EventOptionDef['effects']): number {
  if (effects.rareLoot) return 100;
  return (effects.depth ?? 0) * 10 + (effects.loot ?? 0) * 5 +
    (effects.dmg === 'none' ? 8 : 0) + (effects.heal ? 4 : 0) + (effects.toolGain ? 3 : 0);
}

function applyOption(
  st: SimState, rng: Prng, adv: AdvSnapshot, ev: DungeonEventDef,
  opt: OfferedOption, slot: number
): void {
  const fx = opt.def.effects;
  st.events.push({
    kind: 'resolve', t: st.t, slot, eventId: ev.id, optionId: opt.def.id,
    byEquip: opt.sourceEquip, text: opt.def.logLine
  });
  if (opt.sourceEquip.length > 0) {
    const score = useScore(fx);
    const first = opt.sourceEquip[0];
    if (first !== undefined && (!st.bestUse || score > st.bestUse.score)) {
      st.bestUse = { equipId: first, score, line: opt.def.logLine };
    }
    for (const id of opt.sourceEquip) {
      if (!st.usedEquip.includes(id)) st.usedEquip.push(id);
    }
  }
  if (fx.heal) {
    st.usedHeal = true;
    const amount = Math.floor(adv.maxHp * 0.6);
    st.hp = Math.min(adv.maxHp, st.hp + amount);
    st.events.push({ kind: 'heal', t: st.t, amount, hp: st.hp, maxHp: adv.maxHp });
  }
  if (fx.dmg && fx.dmg !== 'none') {
    let dmg = 0;
    if (fx.dmg === 'fight') {
      dmg = Math.floor(4 + st.depth * 0.9) + rng.int(4);
      const hasWeapon = st.carried.some(id => equipDef(id).kind === 'weapon');
      const hasArmor = st.carried.some(id => equipDef(id).kind === 'armor');
      if (hasWeapon) dmg -= 2;
      if (hasArmor) dmg -= 1;
      dmg = Math.max(2, dmg);
    } else if (fx.dmg === 'small') {
      dmg = 2 + rng.int(2);
    } else {
      dmg = 9 + rng.int(6);
    }
    st.hp -= dmg;
    st.events.push({
      kind: 'damage', t: st.t, amount: dmg, hp: Math.max(0, st.hp), maxHp: adv.maxHp,
      text: ev.name
    });
    if (st.hp <= 0) {
      st.fate = 'died';
      st.deathCause = ev.name;
      return;
    }
  }
  if (fx.depth) {
    st.depth = Math.min(DEPTH_CAP, st.depth + fx.depth);
    st.events.push({ kind: 'depth', t: st.t, depth: st.depth });
  }
  if (fx.time) {
    if (fx.time < 0) {
      st.timePenalty += -fx.time;
      st.events.push({ kind: 'mine', t: st.t, seconds: -fx.time });
    } else {
      st.depth = Math.min(DEPTH_CAP, st.depth + fx.time * DESCENT_RATE);
      st.events.push({ kind: 'depth', t: st.t, depth: st.depth });
    }
  }
  if (fx.loot) {
    for (let i = 0; i < fx.loot; i++) {
      const id = rollLoot(rng, st.depth, false);
      st.loot.push(id);
      st.events.push({ kind: 'loot', t: st.t, lootId: id, rare: false, text: '' });
    }
  }
  if (fx.rareLoot) {
    if (ev.id === 'E15') { st.depth = MAX_DEPTH; st.slayedGuardian = true; }
    const id = rollLoot(rng, st.depth, true);
    st.loot.push(id);
    st.events.push({ kind: 'loot', t: st.t, lootId: id, rare: true, text: '' });
    if (ev.id === 'E15') {
      st.events.push({ kind: 'depth', t: st.t, depth: MAX_DEPTH });
    }
  }
  if (fx.gold) {
    const amount = 10 + rng.int(21);
    st.gold += amount;
    st.events.push({ kind: 'gold', t: st.t, amount });
  }
  if (fx.toolGain) {
    const tools = EQUIPMENT.filter(e => e.kind === 'tool' && !st.carried.includes(e.id));
    if (tools.length > 0) {
      const gained = rng.pick(tools);
      st.carried.push(gained.id);
      st.events.push({ kind: 'log', t: st.t, text: `${gained.name}を手に入れた` });
    } else {
      const amount = 8 + rng.int(9);
      st.gold += amount;
      st.events.push({ kind: 'gold', t: st.t, amount });
    }
  }
  if (fx.endRun && st.fate === undefined) {
    st.fate = 'survived';
    if (ev.id === 'E15' && !st.slayedGuardian) {
      st.retreatReason = '番人を前に引き返した';
    }
  }
}

/** 強欲の強制採掘（プレイヤー入力なしで解決される）。 */
function forcedDigOption(def: DungeonEventDef, carried: string[]): OfferedOption {
  const equipOpt = def.options.find(o => o.requires?.items?.every(id => carried.includes(id)));
  if (equipOpt && equipOpt.requires?.items) {
    return { def: equipOpt, sourceEquip: [...equipOpt.requires.items], disabled: false };
  }
  if (def.id === 'E14' && carried.includes('T2')) {
    return {
      def: {
        id: 'dig-partial', label: '掘る', effects: { loot: 1, time: -8 },
        logLine: 'つるはしで深部の鉱脈を削った'
      },
      sourceEquip: ['T2'], disabled: false
    };
  }
  return {
    def: {
      id: 'dig-bare', label: '素手で掘る', effects: { time: -10 },
      logLine: '素手で掘ろうとして時間を浪費した'
    },
    sourceEquip: [], disabled: false
  };
}

export function simulate(input: SimInput): SimResult {
  const { seed, adventurer: adv, choices } = input;
  const rng = new Prng(seed);
  const st: SimState = {
    t: 0, depth: 0, hp: adv.maxHp, timePenalty: 0,
    loot: [], gold: 0, usedHeal: false,
    carried: [...input.equipment],
    usedEventIds: [], usedEquip: [], events: [], slayedGuardian: false
  };
  st.events.push({ kind: 'depart', t: 0 });
  let choiceCursor = 0;
  let slot = 0;
  let lastStratum = -1;
  let nextAmbient = 5 + rng.int(4);
  let lastAmbient = -1;

  for (let sec = 1; sec <= RUN_SECONDS; sec++) {
    st.t = sec;

    if (st.timePenalty > 0) {
      st.timePenalty--;
    } else {
      st.depth = Math.min(DEPTH_CAP, st.depth + DESCENT_RATE);
    }
    st.events.push({ kind: 'depth', t: sec, depth: st.depth });

    const stratum = Math.min(3, Math.floor(st.depth / 3));
    if (stratum !== lastStratum) {
      lastStratum = stratum;
      st.events.push({ kind: 'stratum', t: sec, stratum });
    }

    if (sec >= nextAmbient && !CHOICE_TIMES.includes(sec)) {
      // 直前と同じ文言の連続を避ける
      let idx = rng.int(AMBIENT_LINES.length);
      if (idx === lastAmbient) idx = (idx + 1) % AMBIENT_LINES.length;
      lastAmbient = idx;
      st.events.push({ kind: 'log', t: sec, text: AMBIENT_LINES[idx] ?? '' });
      nextAmbient = sec + 6 + rng.int(5);
    }

    // 臆病：深度5以降、HPが半分を切ると自動で撤退（止められない）
    if (adv.personality === 'timid' && st.depth >= 5 && st.hp < adv.maxHp / 2) {
      st.fate = 'retreated';
      st.retreatReason = '傷を恐れて引き返した';
      st.events.push({ kind: 'retreat', t: sec, reason: st.retreatReason });
      break;
    }

    if (slot < CHOICE_TIMES.length && sec === CHOICE_TIMES[slot]) {
      const final = slot === CHOICE_TIMES.length - 1;
      const ev = pickEvent(rng, st.depth, st.usedEventIds, final, adv, st.carried);
      st.usedEventIds.push(ev.id);
      const isVein = ev.vein === true;

      if (isVein && adv.personality === 'greedy') {
        // 強欲：鉱脈は必ず掘る。選択スロットは消費するが入力は求めない
        const opt = forcedDigOption(ev, st.carried);
        st.events.push({
          kind: 'choice', t: sec, slot, eventId: ev.id, eventName: ev.name,
          icon: ev.icon, depth: st.depth, options: [opt], forced: 0
        });
        applyOption(st, rng, adv, ev, opt, slot);
        slot++;
      } else {
        const opts = offeredOptions(ev, adv, st.carried, st);
        st.events.push({
          kind: 'choice', t: sec, slot, eventId: ev.id, eventName: ev.name,
          icon: ev.icon, depth: st.depth, options: opts
        });
        const picked = choices[choiceCursor];
        if (picked === undefined) {
          const safeIndex = Math.max(0, opts.findIndex(o => o.def.safe && !o.disabled));
          const fallback = opts.findIndex(o => !o.disabled);
          return {
            events: st.events,
            pending: {
              t: sec, slot, eventId: ev.id, eventName: ev.name, icon: ev.icon,
              options: opts,
              safeIndex: safeIndex >= 0 ? safeIndex : Math.max(0, fallback)
            }
          };
        }
        choiceCursor++;
        const idx = Math.min(Math.max(0, picked), opts.length - 1);
        const chosen = opts[idx];
        if (!chosen) throw new Error('invalid choice index');
        const applied = chosen.disabled
          ? opts.find(o => !o.disabled) ?? chosen
          : chosen;
        applyOption(st, rng, adv, ev, applied, slot);
        slot++;
      }
      if (st.fate === 'died') {
        st.events.push({ kind: 'death', t: sec, cause: st.deathCause ?? ev.name });
        break;
      }
      if (st.fate === 'survived') {
        st.events.push({ kind: 'end', t: sec });
        break;
      }
    }
  }

  if (st.fate === undefined) st.fate = 'survived';
  const last = st.events[st.events.length - 1];
  if (st.fate !== 'died' && (!last || last.kind !== 'end')) {
    st.events.push({ kind: 'end', t: st.t });
  }

  // 生還時の装備の消耗（決定論）。傷薬は使用で消費。
  const broken: string[] = [];
  const consumed: string[] = [];
  if (st.usedHeal && input.equipment.includes('T4')) consumed.push('T4');
  if (st.fate !== 'died') {
    // 使った装備ほど傷む：見立ての固定化を防ぎ、棚に自然なローテーションを作る
    for (const id of input.equipment) {
      if (consumed.includes(id)) continue;
      const wear = st.usedEquip.includes(id) ? 0.3 : 0.1;
      if (rng.chance(wear)) broken.push(id);
    }
  }

  const depthReached = st.slayedGuardian ? MAX_DEPTH : Math.floor(st.depth);
  const questMet = depthReached >= adv.questDepth;

  let letterLine: string;
  let letterEquip: string | undefined;
  if (st.fate === 'died') {
    if (st.overweightBlocked) {
      letterLine = `重量超過により${st.overweightBlocked}で退路を断たれ、${st.deathCause}に倒れた`;
    } else {
      letterLine = `${st.deathCause}に力尽きた`;
    }
  } else if (st.fate === 'retreated') {
    letterLine = `深手を負い、深度${depthReached}で${st.retreatReason ?? '引き返した'}`;
  } else if (st.bestUse) {
    letterLine = `${equipDef(st.bestUse.equipId).name}が道を開いた──${st.bestUse.line}`;
    letterEquip = st.bestUse.equipId;
  } else if (st.overweightBlocked) {
    letterLine = `重量超過により${st.overweightBlocked}を越えられなかった`;
  } else {
    letterLine = questMet ? '慎重に進み、依頼を果たして戻った' : '装備は日の目を見ず、浅い帰還となった';
  }

  const outcome: RunOutcome = {
    fate: st.fate,
    depth: depthReached,
    questDepth: adv.questDepth,
    questMet,
    lootIds: st.fate === 'died' ? [] : st.loot,
    goldGained: st.fate === 'died' ? 0 : st.gold,
    brokenEquip: broken,
    consumedEquip: consumed,
    letterLine,
    letterEquip
  };
  return { events: st.events, outcome };
}
