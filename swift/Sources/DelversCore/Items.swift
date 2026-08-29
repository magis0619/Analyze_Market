import Foundation

// 装備生成（仕様書 §5）。このゲームの中核。
//
// 設計原則（§5.1）: 総ダメージ量は狭くしか揺らさず、配分と効果を大きく揺らす。
// 新しい武器が古い武器の単純な上位互換になった時点で失敗である。
//
// **乱数を引く順番がそのまま仕様。** ここで1つ順序を入れ替えると、
// 同じ種から違う品が出る。TS 版の行の並びをそのまま写してあるので、
// 「読みやすく並べ替える」ことはしない。

/// 攻撃力・防御力の上限（§5.9）。4桁に到達させない。
public let POWER_CAP = 999

/// アフィックス枠の上限（§5.2）。
private func affixSlotMax(_ slot: Slot) -> Int {
    slot == .weapon ? 4 : 3
}

// MARK: - レアリティ

struct RarityRule {
    let rarity: Rarity
    let weight: Double
    /// アフィックス枠の下限・上限
    let affixMin: Int
    let affixMax: Int
    let hasUnique: Bool
}

/// §5.7 レアリティは「枠数」で表現し、数値の高さでは表現しない。
let RARITY_RULES: [RarityRule] = [
    RarityRule(rarity: .common, weight: 60, affixMin: 0, affixMax: 0, hasUnique: false),
    RarityRule(rarity: .fine,   weight: 28, affixMin: 1, affixMax: 2, hasUnique: false),
    RarityRule(rarity: .rare,   weight: 9,  affixMin: 3, affixMax: 4, hasUnique: false),
    // 遺物は「2固定+ランダム1」。稀少より枠は少ないが、ルールを書き換えるユニークが付く
    RarityRule(rarity: .relic,  weight: 3,  affixMin: 2, affixMax: 3, hasUnique: true)
]

private func rollRarity(_ rng: inout Prng, _ rarityBonus: Double) -> RarityRule {
    // rarityBonus はステージのレア率補正。稀少・遺物の重みだけを持ち上げる。
    let weights = RARITY_RULES.map { r -> Double in
        (r.rarity == .rare || r.rarity == .relic) ? r.weight * rarityBonus : r.weight
    }
    // 足す順まで JS と同じにする（左から）。順序が違うと最後の桁がずれる
    var total = 0.0
    for w in weights { total += w }
    var roll = rng.float() * total
    for i in 0..<RARITY_RULES.count {
        roll -= weights[i]
        if roll < 0 { return RARITY_RULES[i] }
    }
    return RARITY_RULES[0]
}

// MARK: - 属性配分

private struct SplitShape {
    /// 物理の比率。残りが属性側
    let physical: Double
    let weight: Double
    /// 属性寄せの武器（杖など）での重み
    let casterWeight: Double
}

/// §5.2 L2「属性配分は大きく振る」
private let SPLIT_SHAPES: [SplitShape] = [
    SplitShape(physical: 1.0, weight: 18, casterWeight: 4),
    SplitShape(physical: 0.7, weight: 22, casterWeight: 12),
    SplitShape(physical: 0.5, weight: 22, casterWeight: 22),
    SplitShape(physical: 0.3, weight: 20, casterWeight: 30),
    SplitShape(physical: 0.0, weight: 18, casterWeight: 32)
]

let NON_PHYSICAL: [Element] = [.fire, .lightning, .poison, .ice]

private func rollElementSplit(_ rng: inout Prng, isCaster: Bool) -> ElementSplit {
    let weights = SPLIT_SHAPES.map { isCaster ? $0.casterWeight : $0.weight }
    var total = 0.0
    for w in weights { total += w }
    var roll = rng.float() * total
    var shape = SPLIT_SHAPES[0]
    for i in 0..<SPLIT_SHAPES.count {
        roll -= weights[i]
        if roll < 0 { shape = SPLIT_SHAPES[i]; break }
    }
    var split = ElementSplit()
    // **入れる順が意味を持つ。** 物理を先に入れるので、同率のときは物理が主属性になる
    if shape.physical > 0 { split.set(.physical, shape.physical) }
    let rest = 1 - shape.physical
    if rest > 0 {
        // rest が 0 のときは引かない。ここで無条件に引くと乱数がずれる
        let elem = rng.pick(NON_PHYSICAL)
        split.set(elem, rest)
    }
    return split
}

// MARK: - ティア

/// 内部の連続値を5段階に丸める（§5.6）。画面には ★ の数だけを出す。
public func tierOf(_ value: Double, _ min: Double, _ max: Double) -> Int {
    if max <= min { return 1 }
    let t = (value - min) / (max - min)
    return Swift.max(1, Swift.min(5, Int((t * 5).rounded(.down)) + 1))
}

// MARK: - 生成

private func rollAffixes(_ rng: inout Prng, pool: [AffixDef], count: Int) -> [Affix] {
    var picked: [Affix] = []
    var remaining = pool
    let n = Swift.min(count, remaining.count)
    for _ in 0..<n {
        let idx = rng.int(remaining.count)
        let def = remaining.remove(at: idx)
        let value = def.min + rng.float() * (def.max - def.min)
        var element: Element? = nil
        if def.elemental { element = rng.pick(NON_PHYSICAL) }
        picked.append(Affix(
            kind: def.kind, value: value,
            tier: tierOf(value, def.min, def.max), element: element
        ))
    }
    return picked
}

public struct GenerateOptions {
    public var itemPower: Int
    public var slot: Slot
    public var stageId: Int
    /// ステージのレア率補正
    public var rarityBonus: Double
    /// アイテムIDの生成に使う一意な接頭辞
    public var id: String
    /// レアリティ抽選を飛ばして固定する（救済枠で使う）
    public var forceRarity: Rarity?

    public init(itemPower: Int, slot: Slot, stageId: Int, rarityBonus: Double,
                id: String, forceRarity: Rarity? = nil) {
        self.itemPower = itemPower
        self.slot = slot
        self.stageId = stageId
        self.rarityBonus = rarityBonus
        self.id = id
        self.forceRarity = forceRarity
    }
}

public func generateItem(_ rng: inout Prng, _ opts: GenerateOptions) -> Item {
    let candidates = BASE_TYPES.filter { $0.slot == opts.slot }
    let base = rng.pick(candidates)

    // **forceRarity のときは抽選を引かない。**
    // JS 側は `find(...) ?? rollRarity(...)` で、見つかれば右辺を評価しない。
    // ここで無条件に引くと、救済枠を含む回だけ以降の乱数が1つぶんずれる。
    let rule: RarityRule
    if let forced = opts.forceRarity,
       let found = RARITY_RULES.first(where: { $0.rarity == forced }) {
        rule = found
    } else {
        rule = rollRarity(&rng, opts.rarityBonus)
    }

    // --- L1 基礎値（§5.3）---
    // 攻撃力と攻撃速度は厳密な逆相関。片方が高ロールならもう片方は必ず低ロール。
    let t = rng.float()
    let center = Double(opts.itemPower) * base.mul
    var powerRaw: Double
    var speedRaw = 0.0
    var critRaw = 0.0
    if opts.slot == .weapon {
        // t=0 → 攻撃力+10% / 速度-4.8%、t=1 → 攻撃力-10% / 速度+4.8%
        powerRaw = center * (1.10 - 0.20 * t)
        speedRaw = base.speed * (0.952 + 0.096 * t)
        critRaw = base.critMin + rng.float() * (base.critMax - base.critMin)
    } else {
        // 防具は速度を持たないので、素直に ±10%
        powerRaw = center * (0.90 + 0.20 * rng.float())
    }
    let power = Swift.min(POWER_CAP, jsRoundInt(powerRaw))
    let speed = jsRound(speedRaw * 100) / 100
    let crit = jsRound(critRaw * 10) / 10

    // --- L2 属性配分（武器のみ）---
    let element: ElementSplit = opts.slot == .weapon
        ? rollElementSplit(&rng, isCaster: base.tags.contains("elemental"))
        : ElementSplit()

    // --- L3 アフィックス（§5.8: ベースタイプで池をフィルタする）---
    let pool = affixPoolFor(slot: opts.slot, baseTags: base.tags)
    let wanted = rule.affixMin + rng.int(rule.affixMax - rule.affixMin + 1)
    let count = Swift.min(wanted, affixSlotMax(opts.slot))
    let affixes = rollAffixes(&rng, pool: pool, count: count)

    // --- L4 ユニーク ---
    // スロットに合うものだけを引く。絞らないと、戦闘側が読まない効果が載る。
    let unique: UniqueKind? = rule.hasUnique
        ? rng.pick(uniquesForSlot(opts.slot)).kind
        : nil

    return Item(
        id: opts.id, baseId: base.id, slot: opts.slot, rarity: rule.rarity,
        power: power, speed: speed, crit: crit,
        element: element, affixes: affixes, unique: unique,
        identified: false, fromStage: opts.stageId
    )
}

/// 死亡して装備を全て失ったときに支給される最低性能の初期装備（§4.4）。
public func starterItem(slot: Slot, id: String) -> Item {
    let base = slot == .weapon ? baseDef("sword") : baseDef("light")
    var element = ElementSplit()
    if slot == .weapon { element.set(.physical, 1) }
    return Item(
        id: id, baseId: base.id, slot: slot, rarity: .common,
        power: jsRoundInt(60 * base.mul),
        speed: slot == .weapon ? base.speed : 0,
        crit: slot == .weapon ? base.critMin : 0,
        element: element, affixes: [], unique: nil,
        identified: true, fromStage: 0
    )
}

/// 売却価格。ゴミ装備が金に変わらないと純粋なストレスになる（§7.5）。
public func sellValue(_ item: Item) -> Int {
    let mul: Double
    switch item.rarity {
    case .common: mul = 1
    case .fine: mul = 2.5
    case .rare: mul = 7
    case .relic: mul = 20
    }
    return Swift.max(1, jsRoundInt(Double(item.power) * 0.25 * mul))
}

/// JS の `Number.prototype.toString(36)` と同じ表記。アイテムIDの組み立てに使う。
public func base36(_ v: UInt32) -> String {
    String(v, radix: 36)
}
