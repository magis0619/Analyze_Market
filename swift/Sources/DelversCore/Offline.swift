import Foundation

// オフライン進行（仕様書 §7.2）。上限8時間。端末時刻の巻き戻しを検知する。
//
// **`Date()` を呼ばない。** 時刻は必ず引数で注入する。
// ここが自分で現在時刻を取りに行くと、テストで任意の時刻を与えられなくなり、
// 「8時間放置したら何が起きるか」を確かめる方法が実際に8時間待つことしかなくなる。

/// オフライン進行の上限（秒）。これを超えた分は進行しない（§7.2）。
public let OFFLINE_CAP_SEC: Double = 8 * 3600

public struct ClockState: Equatable, Sendable {
    /// これまでに観測した最新の時刻（epoch ms）。巻き戻し検知に使う
    public var lastSeen: Double
    public init(lastSeen: Double) { self.lastSeen = lastSeen }
}

public struct Progress: Equatable, Sendable {
    /// 経過した実時間（秒）。上限8時間でクランプ済み
    public var elapsedSec: Double
    /// 残り時間（秒）
    public var remainingSec: Double
    public var completed: Bool
    /// 0〜1
    public var ratio: Double
}

/// 時刻を1手進める。端末時刻が巻き戻っていたら進行させない（§7.2）。
/// 返り値の lastSeen を必ず保存すること。
public func advanceClock(_ state: ClockState, now: Double) -> ClockState {
    // 前回保存時刻より過去なら進行量ゼロ＝観測時刻を据え置く
    if now < state.lastSeen { return ClockState(lastSeen: state.lastSeen) }
    return ClockState(lastSeen: now)
}

/// 派遣の進捗を求める。
///
/// 進捗は「開始時刻」と「観測時刻」という2つの絶対時刻からのみ導出する。
/// 差分を足し込む形にしないため、8時間を一括で計算しても、1分ずつ480回に
/// 分割して計算しても、結果は必ず一致する（§7.2）。
public func dispatchProgress(_ dispatch: Dispatch, _ clock: ClockState) -> Progress {
    let rawSec = (clock.lastSeen - dispatch.startedAt) / 1000
    let elapsedSec = Swift.max(0, Swift.min(rawSec, OFFLINE_CAP_SEC))
    let remainingSec = Swift.max(0, Double(dispatch.durationSec) - elapsedSec)
    return Progress(
        elapsedSec: elapsedSec,
        remainingSec: remainingSec,
        completed: elapsedSec >= Double(dispatch.durationSec),
        ratio: dispatch.durationSec <= 0
            ? 1
            : Swift.max(0, Swift.min(1, elapsedSec / Double(dispatch.durationSec)))
    )
}
