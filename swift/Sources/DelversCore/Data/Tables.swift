import Foundation

// データ表の**引き方**（`src/data/*.ts` の関数側）。
// 表そのものは `Generated.swift` にあり、TS の実データから生成している——
// 一度手で写したらステージ7〜9を丸ごと取り違えた。表は目で写すものではない。

// MARK: - ベースタイプ

private let baseById: [String: BaseTypeDef] = {
    var m: [String: BaseTypeDef] = [:]
    for b in BASE_TYPES { m[b.id] = b }
    return m
}()

public func baseDef(_ id: String) -> BaseTypeDef {
    guard let d = baseById[id] else { preconditionFailure("unknown base type: \(id)") }
    return d
}

public func basesForSlot(_ slot: Slot) -> [BaseTypeDef] {
    BASE_TYPES.filter { $0.slot == slot }
}

// MARK: - アフィックス

/// そのベースタイプが引けるアフィックスだけ（§5.8）。**表の並び順のまま返す。**
/// 並びは `rng.int(remaining.count)` が指す先を決めるので、絞り方を変えると引く効果が変わる。
public func affixPoolFor(slot: Slot, baseTags: [String]) -> [AffixDef] {
    AFFIXES.filter { a in
        a.slot == slot && a.tags.contains { baseTags.contains($0) }
    }
}

private let affixByKind: [AffixKind: AffixDef] = {
    var m: [AffixKind: AffixDef] = [:]
    for a in AFFIXES { m[a.kind] = a }
    return m
}()

public func affixDef(_ kind: AffixKind) -> AffixDef {
    guard let d = affixByKind[kind] else { preconditionFailure("unknown affix: \(kind)") }
    return d
}

// MARK: - ユニーク

private let uniqueByKind: [UniqueKind: UniqueDef] = {
    var m: [UniqueKind: UniqueDef] = [:]
    for u in UNIQUES { m[u.kind] = u }
    return m
}()

public func uniqueDef(_ kind: UniqueKind) -> UniqueDef {
    guard let d = uniqueByKind[kind] else { preconditionFailure("unknown unique: \(kind)") }
    return d
}

/// そのスロットに付けてよいユニーク（§5.5）。必ず1件以上返る。
public func uniquesForSlot(_ slot: Slot) -> [UniqueDef] {
    UNIQUES.filter { u in
        switch u.slot {
        case .both: return true
        case .weapon: return slot == .weapon
        case .armor: return slot == .armor
        }
    }
}

// MARK: - 職と撤退ルール

private let jobById: [JobId: JobDef] = {
    var m: [JobId: JobDef] = [:]
    for j in JOBS { m[j.id] = j }
    return m
}()

public func jobDef(_ id: JobId) -> JobDef {
    guard let d = jobById[id] else { preconditionFailure("unknown job: \(id)") }
    return d
}

public func canEquipArmor(_ job: JobDef, armorTags: [String]) -> Bool {
    if job.armorRestriction.isEmpty { return true }
    return job.armorRestriction.contains { armorTags.contains($0) }
}

private let ruleById: [RetreatRule: RetreatRuleDef] = {
    var m: [RetreatRule: RetreatRuleDef] = [:]
    for r in RETREAT_RULES { m[r.id] = r }
    return m
}()

public func retreatRuleDef(_ id: RetreatRule) -> RetreatRuleDef {
    guard let d = ruleById[id] else { preconditionFailure("unknown retreat rule: \(id)") }
    return d
}

// MARK: - ステージ

private let stageById: [Int: StageDef] = {
    var m: [Int: StageDef] = [:]
    for s in STAGES { m[s.id] = s }
    return m
}()

public func stageDef(_ id: Int) -> StageDef {
    guard let d = stageById[id] else { preconditionFailure("unknown stage: \(id)") }
    return d
}

/// 整数乗。**`pow` を使わない。**
///
/// JS 側は `Math.pow(2.2, tier-1)` と書いてあるが、`pow` は libm ごとに
/// 最後の 1ulp が違いうる。1ulp のずれは敵の攻撃力に乗り、`hp <= 0` の判定を
/// 一度ひっくり返すだけで、その先の乱数の使われ方が全部ずれる——
/// 「たまに結果が違う」という、最も追いにくい壊れ方になる。
///
/// V8 の `Math.pow` は整数指数のとき繰り返し乗算と bit 単位で一致することを
/// 確認してある（tools/golden.ts の `tables.difficultyMul` が実測値を持っている）。
/// 両実装とも繰り返し乗算に寄せて、libm への依存を断つ。
@inline(__always)
private func intPow(_ base: Double, _ exp: Int) -> Double {
    var r = 1.0
    var i = 0
    while i < exp {
        r *= base
        i += 1
    }
    return r
}

/// 難易度ティアを含めた敵の強さ倍率。ステージ10クリアで難易度+1（§7.1）。
public func difficultyMul(_ tier: Int) -> Double {
    intPow(2.2, tier - 1)
}

/// そのステージで出るアイテムの itemPower（上限999は生成側でクランプ）。
public func itemPowerFor(stageId: Int, tier: Int) -> Int {
    jsRoundInt(Double(80 + stageId * 24) * intPow(1.35, tier - 1))
}

// MARK: - 敵

/// そのステージに出る敵。帯から漏れたら全件返す（必ず1件は返る）。
public func enemiesForStage(_ stageId: Int) -> [EnemyDef] {
    let hit = ENEMIES.filter { stageId >= $0.minStage && stageId <= $0.maxStage }
    return hit.isEmpty ? ENEMIES : hit
}

// MARK: - 薬草園

private let herbById: [String: HerbDef] = {
    var m: [String: HerbDef] = [:]
    for h in HERBS { m[h.id] = h }
    return m
}()

public func herbDef(_ id: String) -> HerbDef {
    guard let d = herbById[id] else { preconditionFailure("unknown herb: \(id)") }
    return d
}

public func herbForElement(_ e: Element) -> HerbDef {
    HERBS.first { $0.element == e } ?? HERBS[0]
}

private let potionById: [String: PotionDef] = {
    var m: [String: PotionDef] = [:]
    for p in POTIONS { m[p.id] = p }
    return m
}()

public func potionDef(_ id: String) -> PotionDef {
    guard let d = potionById[id] else { preconditionFailure("unknown potion: \(id)") }
    return d
}

public func potionForElement(_ e: Element) -> PotionDef? {
    POTIONS.first { $0.element == e }
}
