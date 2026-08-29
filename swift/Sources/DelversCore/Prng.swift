import Foundation

/// 種を指定できる xorshift32。シミュレーションはこれ**だけ**を使う（仕様 C2）。
///
/// **JS 版のビットの癖まで写している。** 元実装（`src/sim/prng.ts`）はこう書かれている:
///
/// ```js
/// x ^= x << 13; x >>>= 0;
/// x ^= x >> 17;              // ← 論理シフトではなく算術シフト
/// x ^= x << 5;  x >>>= 0;
/// ```
///
/// 3行目の `>>` は JS では**符号付き右シフト**で、値が 2^31 以上のとき上位に 1 が
/// 詰まる。教科書どおりの xorshift32（`>>>` 相当）を書くと、種によって数列が
/// まるごと別物になり、同じ種から違うゲームが立ち上がる。
/// 「移植したのに結果が違う」の原因はまずここなので、golden.json の `prng` が
/// 最初に落ちるように並べてある。
public struct Prng {
    private var s: UInt32

    /// - Parameter seed: 32bit へ丸めた種。0 は禁じ手（全ゼロで固まる）なので黄金比定数に置換する。
    public init(seed: UInt32) {
        let start: UInt32 = seed == 0 ? 0x9e37_79b9 : seed
        s = Prng.step(start)
    }

    /// JS の `Number` から作る。`>>> 0` と同じ丸め方をする。
    ///
    /// ラベルを `seed:` にしない。`Prng(seed: 42)` と書いたときに
    /// リテラルがどちらの型にも寄れて、オーバーロードの解決が読み手に見えなくなる。
    public init(jsSeed: Int) {
        self.init(seed: UInt32(truncatingIfNeeded: jsSeed))
    }

    @inline(__always)
    private static func step(_ input: UInt32) -> UInt32 {
        var x = input
        x ^= x &<< 13
        // ここだけ符号付きで潰す。JS の `x >> 17` と同じ bit を得るための変換
        x ^= UInt32(bitPattern: Int32(bitPattern: x) >> 17)
        x ^= x &<< 5
        return x
    }

    /// 生の 32bit。
    public mutating func next() -> UInt32 {
        s = Prng.step(s)
        return s
    }

    /// `[0, 1)` の一様乱数。
    public mutating func float() -> Double {
        Double(next()) / 4_294_967_296.0
    }

    /// `[0, n)` の一様整数。
    ///
    /// JS 側は `next() % n` を **Number の剰余**で計算している。値は 2^53 未満なので
    /// 誤差は出ないが、Swift で `UInt32(n)` に落とすと n が 32bit を超えたとき落ちる。
    /// 64bit で受けてから割る。
    public mutating func int(_ n: Int) -> Int {
        if n <= 0 { return 0 }
        return Int(UInt64(next()) % UInt64(n))
    }

    /// `[a, b]` の一様整数（両端を含む）。
    public mutating func range(_ a: Int, _ b: Int) -> Int {
        a + int(b - a + 1)
    }

    /// 1つ選ぶ。空配列は呼び出し側の誤りなので落とす（JS 版も throw する）。
    public mutating func pick<T>(_ arr: [T]) -> T {
        precondition(!arr.isEmpty, "pick from empty array")
        return arr[int(arr.count)]
    }

    /// 確率 p で true。
    public mutating func chance(_ p: Double) -> Bool {
        float() < p
    }
}
