import Foundation

// DELVERS の決定論シミュレーションで使う型（`src/sim/types.ts` の写し）。
// このモジュールは UIKit / SwiftUI / SceneKit を一切参照しない。
// 画面に触れない層であることを、import の無さで担保する。

// MARK: - 属性

public enum Element: String, CaseIterable, Codable, Sendable {
    case physical, fire, lightning, poison, ice
}

/// JS 側の `ELEMENTS` と同じ並び。順序に意味がある場所があるので固定する。
public let ELEMENTS: [Element] = [.physical, .fire, .lightning, .poison, .ice]

/// 属性ごとの配分（合計 1.0）。
///
/// **辞書ではなく順序付きにする。** JS 版は `{ physical: 0.5, fire: 0.5 }` のような
/// オブジェクトで持っていて、`Object.entries` は**挿入順**で回る。
/// `dominantElement` は `>` で最大を選ぶので、同率のときは**先に入ったほう**が勝つ。
/// Swift の `Dictionary` は順序を持たないため、そのまま辞書にすると
/// 同率配分（0.5/0.5）の武器で主属性が実行ごとに変わる——
/// サムネの色も台座の光も揺れる、再現しない不具合になる。
public struct ElementSplit: Equatable, Sendable {
    public struct Share: Equatable, Sendable {
        public let element: Element
        public let value: Double
        public init(_ element: Element, _ value: Double) {
            self.element = element
            self.value = value
        }
    }

    public private(set) var shares: [Share]

    public init(_ shares: [Share] = []) { self.shares = shares }

    /// 挿入順を保ったまま足す。同じ属性が2度来たら上書きする（JS の代入と同じ）。
    public mutating func set(_ element: Element, _ value: Double) {
        if let i = shares.firstIndex(where: { $0.element == element }) {
            shares[i] = Share(element, value)
        } else {
            shares.append(Share(element, value))
        }
    }

    public subscript(_ element: Element) -> Double? {
        shares.first { $0.element == element }?.value
    }

    public var isEmpty: Bool { shares.isEmpty }
}

/// 配分の中で最も比率の高い属性。同率なら**先に入ったほう**（JS と同じ）。
public func dominantElement(_ split: ElementSplit) -> Element {
    var best: Element = .physical
    var bestVal = -1.0
    for s in split.shares where s.value > bestVal {
        bestVal = s.value
        best = s.element
    }
    return best
}

// MARK: - 装備

public enum Slot: String, Codable, Sendable {
    case weapon, armor
}

public enum Rarity: String, Codable, CaseIterable, Sendable {
    case common, fine, rare, relic
}

public func rarityRank(_ r: Rarity) -> Int {
    switch r {
    case .common: return 0
    case .fine: return 1
    case .rare: return 2
    case .relic: return 3
    }
}

/// 稀少以上はカットインの対象（§5.7・§7.4）。
public func hasCutIn(_ r: Rarity) -> Bool { r == .rare || r == .relic }

public struct BaseTypeDef: Sendable {
    public let id: String
    public let name: String
    public let slot: Slot
    /// 武器：itemPower に対する攻撃力倍率／防具：防御力倍率
    public let mul: Double
    /// 武器のみ：基準攻撃速度（回/秒）。防具は 0
    public let speed: Double
    public let critMin: Double
    public let critMax: Double
    /// アフィックス池のフィルタに使う（§5.8）
    public let tags: [String]
}

public enum AffixKind: String, Codable, Sendable {
    case attackPct       // 攻撃力 +X%
    case critDmgPct      // 会心ダメージ +X%
    case elementFlat     // 属性ダメージ追加 +X
    case lowHpPct        // HP50%以下で威力 +X%
    case comboSpeedPct   // 連続ヒットで速度 +X%（最大5回）
    case defensePct      // 防御 +X%
    case resistPct       // 属性耐性 +X%
    case killHeal        // 撃破時にHP回復 +X（固定値）
}

public struct AffixDef: Sendable {
    public let kind: AffixKind
    public let name: String
    public let slot: Slot
    public let min: Double
    public let max: Double
    public let isPercent: Bool
    /// このアフィックスを引けるベースタイプのタグ
    public let tags: [String]
    /// 属性を伴うアフィックスか
    public let elemental: Bool
}

public struct Affix: Equatable, Sendable {
    public let kind: AffixKind
    /// 内部の連続値。画面には出さない（§5.6）
    public let value: Double
    /// 表示用の5段階ティア（1〜5）
    public let tier: Int
    /// elementFlat / resistPct のときの対象属性
    public let element: Element?

    public init(kind: AffixKind, value: Double, tier: Int, element: Element? = nil) {
        self.kind = kind
        self.value = value
        self.tier = tier
        self.element = element
    }
}

public enum UniqueKind: String, Codable, Sendable {
    // --- 武器専用 ---
    case noCritFlatPower   // 会心が発生しない。代わりに全攻撃の威力が常時上昇
    case slowTriple        // 攻撃速度が半減し、1撃が3倍かつ範囲攻撃
    case killStack         // 敵を倒すたびに攻撃力+1（そのステージ中のみ）
    // --- 防具専用 ---
    case wardStack         // 被弾するたび防御+2（そのステージ中のみ）
    case lastStand         // HP25%以下で被ダメージ半減
    case thorns            // 被弾時、受けた分の一部を相手に返す
    // --- 両方に付く ---
    case greedyGlass       // ドロップ率+50%、被ダメージ+25%
}

public struct UniqueDef: Sendable {
    public enum Fit: String, Sendable { case weapon, armor, both }
    public let kind: UniqueKind
    public let name: String
    /// ルールを書き換える1行（§5.2 L4）
    public let text: String
    /// 付けてよいスロット。ここを絞らないと、戦闘側が一度も読まない品ができる。
    public let slot: Fit
}

public struct Item: Equatable, Sendable {
    public var id: String
    public var baseId: String
    public var slot: Slot
    public var rarity: Rarity
    /// 武器：攻撃力／防具：防御力。999で頭打ち（§5.9）
    public var power: Int
    /// 武器のみ：攻撃速度（回/秒）
    public var speed: Double
    /// 武器のみ：会心率(%)
    public var crit: Double
    public var element: ElementSplit
    public var affixes: [Affix]
    public var unique: UniqueKind?
    /// 未鑑定（帰還直後）は true。開封すると false
    public var identified: Bool
    /// 生成元のステージ（図鑑の記録用 §7.4）
    public var fromStage: Int
    /// インベントリのロック（一括売却から保護）
    public var locked: Bool

    public init(
        id: String, baseId: String, slot: Slot, rarity: Rarity,
        power: Int, speed: Double, crit: Double,
        element: ElementSplit, affixes: [Affix], unique: UniqueKind?,
        identified: Bool, fromStage: Int, locked: Bool = false
    ) {
        self.id = id
        self.baseId = baseId
        self.slot = slot
        self.rarity = rarity
        self.power = power
        self.speed = speed
        self.crit = crit
        self.element = element
        self.affixes = affixes
        self.unique = unique
        self.identified = identified
        self.fromStage = fromStage
        self.locked = locked
    }
}

// MARK: - 冒険者

public enum JobId: String, Codable, CaseIterable, Sendable {
    case swordsman, guardian, skirmisher
}

public struct JobDef: Sendable {
    public let id: JobId
    public let name: String
    public let hp: Double
    /// 装備できる防具タグ。空なら制限なし
    public let armorRestriction: [String]
    /// 被ダメージ倍率（0.8 なら -20%）
    public let damageTakenMul: Double
    /// ステージ所要時間の倍率
    public let timeMul: Double
    /// 回避率(0〜1)
    public let evasion: Double
    /// ドロップ数の加算
    public let bonusDrops: Int
    public let desc: String
}

public enum RetreatRule: String, Codable, CaseIterable, Sendable {
    case reckless, standard, cautious
}

public struct RetreatRuleDef: Sendable {
    public let id: RetreatRule
    public let name: String
    /// この割合を下回ったら帰還。0 なら HP0 まで戦う
    public let threshold: Double
    public let desc: String
}

// MARK: - ステージ

/// 敵が纏う属性。複合は特定の1属性を持たない。
public enum StageElement: Equatable, Sendable {
    case single(Element)
    case mixed
}

public struct StageDef: Sendable {
    public let id: Int
    public let name: String
    /// 実時間（分）
    public let minutes: Int
    public let enemyElement: StageElement
    /// 弱点属性（この属性で殴ると1.5倍）
    public let weakTo: Element?
    /// 敵が耐性を持つ属性（0.5倍）
    public let resists: [Element]
    public let encounters: Int
    public let dropBias: DropBias
    /// レア率の補正倍率
    public let rarityBonus: Double
    /// 解放費用（金）
    public let unlockCost: Int

    public enum DropBias: String, Sendable { case weapon, armor, even }
}

// MARK: - 敵（§6.2）

public struct EnemyDef: Sendable {
    public let id: String
    public let name: String
    /// 出現するステージ帯（§7.1 の番号）
    public let minStage: Int
    public let maxStage: Int
    /// 見た目の属性。数値には影響せず、名札の説得力のためだけに使う
    public let flavor: Element
    /// 描画用アイコンキー
    public let icon: String
}

// MARK: - 薬草園

public struct HerbDef: Sendable {
    public let id: String
    public let name: String
    /// どの属性に効く薬の材料になるか
    public let element: Element
    /// 育ちきるまでの秒数（実時間）
    public let growSec: Int
    /// 収穫で採れる数
    public let yieldCount: Int
    /// 種の購入価格
    public let seedCost: Int
    /// 3D と一覧で使う1文字
    public let glyph: String
}

public struct PotionDef: Sendable {
    public let id: String
    public let name: String
    /// どの属性の攻撃を和らげるか
    public let element: Element
    /// 被ダメージの軽減率（0〜1）
    public let resist: Double
    /// 主材料。これを2つ使う
    public let main: String
    /// 主材料以外の薬草を、この数だけ使う（何でもよい）
    public let other: Int
    public let text: String
}

// MARK: - 戦闘結果

public enum RunOutcome: String, Codable, Sendable {
    case retreat, clear, death
}

public struct RunStats: Equatable, Sendable {
    public var dealt: Int
    public var taken: Int
    public var kills: Int
    public var hits: Int
    public var crits: Int
    public var biggestHit: Int
    public var evaded: Int
    /// 持たせた薬が肩代わりした被ダメージ（薬草園）
    public var potionSaved: Int
}

public struct RunResult: Equatable, Sendable {
    public var outcome: RunOutcome
    /// 到達した遭遇数
    public var depth: Int
    public var encountersTotal: Int
    public var bossDefeated: Bool
    /// 未鑑定の戦利品（最大10個 §7.3）
    public var loot: [Item]
    public var gold: Int
    /// 結果1行（§7.3）
    public var headline: String
    /// 見どころ3行（§7.3・最重要）
    public var highlights: [String]
    /// 到達深度グラフ用の HP 推移（遭遇ごと、0〜1）
    public var hpCurve: [Double]
    /// 実時間（秒）
    public var durationSec: Int
    public var stats: RunStats
}

// MARK: - 派遣

public struct Dispatch: Equatable, Sendable {
    public var id: String
    public var jobId: JobId
    public var stageId: Int
    public var weaponId: String
    public var armorId: String
    public var retreatRule: RetreatRule
    /// 決定論シードと結果は派遣時に確定する
    public var seed: UInt32
    /// 開始時刻（epoch ms）
    public var startedAt: Double
    /// 完了までの実時間（秒）
    public var durationSec: Int
    /// 持たせた薬（薬草園）。持たせなければ nil
    public var potionId: String?

    public init(
        id: String, jobId: JobId, stageId: Int, weaponId: String, armorId: String,
        retreatRule: RetreatRule, seed: UInt32, startedAt: Double, durationSec: Int,
        potionId: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.stageId = stageId
        self.weaponId = weaponId
        self.armorId = armorId
        self.retreatRule = retreatRule
        self.seed = seed
        self.startedAt = startedAt
        self.durationSec = durationSec
        self.potionId = potionId
    }
}

// MARK: - JS と同じ丸め方

/// JS の `Math.round`。
///
/// Swift の `rounded()` は .5 を**絶対値の大きいほう**へ送るが、
/// JS は常に `floor(x + 0.5)`（＝ +∞ 方向）で丸める。負の .5 で 1 ずれる。
/// ゴールドや深度に効くので、専用に持つ。
@inline(__always)
public func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

@inline(__always)
public func jsRoundInt(_ x: Double) -> Int { Int(jsRound(x)) }
