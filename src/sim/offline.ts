import type { Dispatch } from './types';

// オフライン進行（仕様書 §7.2）。上限8時間。端末時刻の巻き戻しを検知する。
// このモジュールは Canvas / DOM も `Date.now()` も参照しない。
// 時刻は必ず引数で注入する（テストで任意の時刻を与えられるようにするため）。

/** オフライン進行の上限（秒）。これを超えた分は進行しない（§7.2）。 */
export const OFFLINE_CAP_SEC = 8 * 3600;

export interface ClockState {
  /** これまでに観測した最新の時刻（epoch ms）。巻き戻し検知に使う */
  lastSeen: number;
}

export interface Progress {
  /** 経過した実時間（秒）。上限8時間でクランプ済み */
  elapsedSec: number;
  /** 残り時間（秒） */
  remainingSec: number;
  completed: boolean;
  /** 0〜1 */
  ratio: number;
}

/**
 * 時刻を1手進める。端末時刻が巻き戻っていたら進行させない（§7.2・C5）。
 * 返り値の lastSeen を必ず保存すること。
 */
export function advanceClock(state: ClockState, now: number): ClockState {
  // 前回保存時刻より過去なら進行量ゼロ＝観測時刻を据え置く
  if (now < state.lastSeen) return { lastSeen: state.lastSeen };
  return { lastSeen: now };
}

/**
 * 派遣の進捗を求める。
 *
 * 進捗は「開始時刻」と「観測時刻」という2つの絶対時刻からのみ導出する。
 * 差分を足し込む形にしないため、8時間を一括で計算しても、1分ずつ480回に
 * 分割して計算しても、結果は必ず一致する（§7.2・C4）。
 */
export function dispatchProgress(
  dispatch: Dispatch, clock: ClockState
): Progress {
  const rawSec = (clock.lastSeen - dispatch.startedAt) / 1000;
  const elapsedSec = Math.max(0, Math.min(rawSec, OFFLINE_CAP_SEC));
  const remainingSec = Math.max(0, dispatch.durationSec - elapsedSec);
  return {
    elapsedSec,
    remainingSec,
    completed: elapsedSec >= dispatch.durationSec,
    ratio: dispatch.durationSec <= 0
      ? 1
      : Math.max(0, Math.min(1, elapsedSec / dispatch.durationSec))
  };
}
