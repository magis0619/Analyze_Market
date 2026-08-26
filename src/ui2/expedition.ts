import type { Dispatch, RunResult, StageDef } from '../sim/types';

// 派遣中に見えるもの（改善指示書 §4「待機時間の演出」）。
//
// **出来事は捏造しない。** 派遣した瞬間に本物のシミュレーションが走り切って
// 結果が保存されている（state.dispatch → data.results[id]）ので、
// 「何が起きたか」は最初から全部分かっている。
// 適当なログを乱数で作ると、帰還レポートの見どころと食い違って
// 「さっきの足音は何だったのか」という嘘になる。ここでは実データから引く。
//
// **先の出来事は見せない。** 結果が確定していても、進行率より先は伏せる。
// 見えてしまうと待つ意味が無くなる。
//
// 介入は入れない（この作品は派遣前に3つ決めたら終わり、というのが芯）。
// 「見るものはあるが、見なくてよい」を守る。

export interface Beat {
  /** 0〜1。進行バー上の位置 */
  at: number;
  /** 何層目の出来事か */
  depth: number;
  kind: 'fight' | 'hurt' | 'rally' | 'boss' | 'retreat' | 'fall';
  text: string;
}

/** 「大きく削られた」と呼ぶ落ち込みの下限 */
const HURT = 0.10;
/** 「立て直した」と呼ぶ回復の下限 */
const RALLY = 0.05;
/** 道中に置く出来事の数（指示書 §4 は2〜4件。終わりの1件を別に持つ） */
const SAMPLES = 4;

/**
 * 実際の HP 推移から、語る価値のある場面を拾う。
 *
 * **一定間隔で必ず1つ出す。** 最初は「大きく削られた」等の異常だけを
 * 拾っていたが、装備が整った回は一度も閾値を越えず、
 * 20分の派遣で見えるものが「潜り始めた」の1行だけになった——
 * 待ち時間に何か見せる、という目的をまるごと外していた。
 * 区間ごとに、その区間で一番大きく動いた場面を選んで言う。
 */
export function beatsOf(result: RunResult, stage: StageDef): Beat[] {
  const curve = result.hpCurve;
  // **進行バーの 100% は「ステージの全長」ではなく「この派遣の終わり」。**
  //
  // hpCurve は先頭が開始時の HP で、遭遇を1つ試すごとに1つ増える。
  // 一方 result.depth は**踏破できた**数なので、撤退した回は1つ少ない。
  // ステージ全長で割ると、撤退の印が途中の出来事より手前に落ちて、
  // 「3層で削られた → 4層で削られた → 2層で引き返した」という
  // 時間が巻き戻る足取りになっていた。この派遣自身の長さで割る。
  const steps = Math.max(1, curve.length - 1);
  const out: Beat[] = [];

  out.push({ at: 0, depth: 0, kind: 'fight', text: `${stage.name}へ潜り始めた` });

  const n = Math.min(SAMPLES, Math.max(0, steps - 1));
  for (let k = 1; k <= n; k++) {
    const lo = Math.max(1, Math.floor(((k - 1) / n) * steps) + 1);
    const hi = Math.min(steps, Math.floor((k / n) * steps));
    if (hi < lo) continue;

    // 区間の中で一番大きく動いた遭遇を代表にする
    let at = lo, best = -Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs((curve[i - 1] ?? 1) - (curve[i] ?? 1));
      if (d > best) { best = d; at = i; }
    }
    const prev = curve[at - 1] ?? 1;
    const now = curve[at] ?? 1;
    const d = prev - now;
    const hp = Math.round(now * 100);

    const kind: Beat['kind'] = d >= HURT ? 'hurt' : d <= -RALLY ? 'rally' : 'fight';
    out.push({ at: at / steps, depth: at, kind, text: `${phrase(kind, d, now, at)}（HP ${hp}%）` });
  }

  // 終わりは必ず最後。到達深度はラベルに出すが、位置には使わない
  if (result.bossDefeated) {
    out.push({ at: 1, depth: result.depth, kind: 'boss', text: '最奥の主を討ち取った' });
  } else if (result.outcome === 'death') {
    out.push({ at: 1, depth: result.depth, kind: 'fall', text: '力尽きた' });
  } else {
    out.push({ at: 1, depth: result.depth, kind: 'retreat', text: '引き返した' });
  }

  // 近すぎる出来事は間引く。同じ場所に印が重なると、何個あるのか分からない
  const kept: Beat[] = [];
  for (const b of out) {
    const last = kept[kept.length - 1];
    const ending = b.kind === 'boss' || b.kind === 'fall' || b.kind === 'retreat';
    if (last && b.at - last.at < 0.05 && !ending) continue;
    kept.push(b);
  }
  return kept;
}

/**
 * 場面の言い方。
 *
 * 同じ語が4回続くと、何も言っていないのと同じになる（実際、装備が整った回は
 * 「押し合いが続いている」が4行並んだ）。同じ意味でも言い方を変える。
 * **選び方は決定的にする**——画面を開くたびに文が変わると、
 * 出来事ではなく飾りだと分かってしまう。
 */
const PHRASES: Record<Beat['kind'], string[]> = {
  hurt: ['大きく削られた', '手痛い一撃をもらった', '防戦一方になった', '囲まれて崩れた'],
  rally: ['体勢を立て直した', '息を吹き返した', '傷を癒やしながら進んだ'],
  fight: ['押し合いが続いている', 'じりじり削られている', '消耗が積もってきた', '互角に渡り合っている'],
  boss: [], retreat: [], fall: []
};
const EASY = ['危なげなく抜けた', '難なく突破した', '相手にならなかった', '足を止めずに進んだ'];
const DIRE = ['余力が残っていない', '立っているのがやっと', '次の一撃が危ない'];

function phrase(kind: Beat['kind'], delta: number, hp: number, seed: number): string {
  if (hp <= 0.3) return DIRE[seed % DIRE.length] ?? DIRE[0] ?? '';
  const pool = kind === 'fight' && delta <= 0.01 ? EASY : PHRASES[kind];
  if (pool.length === 0) return '';
  return pool[seed % pool.length] ?? pool[0] ?? '';
}

/** 進行率までに起きたぶんだけ。先は伏せる。 */
export function beatsSoFar(beats: readonly Beat[], ratio: number): Beat[] {
  return beats.filter(b => b.at <= ratio + 1e-6);
}

/**
 * その派遣の出来事。結果がまだ無ければ空。
 *
 * 結果は派遣した時点で確定しているので、ここで乱数は引かない
 * （引くと画面を開くたびに違う出来事になる）。
 */
export function dispatchBeats(
  d: Dispatch,
  results: Record<string, RunResult>,
  stage: StageDef
): Beat[] {
  const r = results[d.id];
  return r ? beatsOf(r, stage) : [];
}

export const BEAT_TONE: Record<Beat['kind'], string> = {
  fight: 'faint', hurt: 'down', rally: 'up',
  boss: 'gold', retreat: 'dim', fall: 'down'
};
