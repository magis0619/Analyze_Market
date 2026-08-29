import Foundation

// 戦闘シミュレーション（仕様書 §6）。
// 内部ターン制で解決し、画面には一切描画しない。この層は UI を参照しない。
//
// **TS 版の行の並びをそのまま写している。** 乱数を引く順番、比較の向き、
// 丸めの位置——どれか1つでも変えると、同じ種から違う結果が出る。
// 「Swift らしく書き直す」ことは、ここではしない。

/// バランス調整用の定数。
///
/// 設計の勘所: HPは1ステージを通して単調減少する（§6.2）。自動回復がないため、
/// 「1遭遇あたりに削られるHP × 遭遇数」が最大HPを超えるかどうかで到達深度が決まる。
private enum TUNING {
    static let enemyHp = 46.0
    static let enemyAttack = 6.0
    static let enemyDefense = 4.2
    static let enemyInterval = 2.2
    static let bossHp = 200.0
    static let bossAttack = 8.0
    /// 防御率の分母係数。大きいほど防具が効きにくい
    static let defenseConst = 30.0
    static let defenseCap = 0.8
}

/// 内部解決の時間刻み（秒）。実時間とは無関係の仮想時間。
private let DT = 0.25
/// 1遭遇の打ち切り（無限ループ防止）。仮想秒。
private let ENCOUNTER_TIMEOUT = 180.0
/// 戦利品の上限（§7.3）。
private let MAX_LOOT = 10
/// 派遣の最短所要時間（ステージ全長に対する比）。
/// これが無いと「8時間」と表示した派遣が1秒で帰ってくる。
public let MIN_TRIP_RATIO = 0.25
/// 救済枠が働く最低の戦利品数
private let PITY_MIN_LOOT = 4
/// balanced が無視する敵防御の割合。
/// 中量級に取り柄が無いと、一撃が敵HPの境目に乗る片手剣が構造的に最下位になる。
private let BALANCED_PIERCE = 0.35

// MARK: - 敵

/// 参照型にする。`enemies.find(...)` で取った1体を書き換える形なので、
/// 値型にすると「取った先」が複製になって、与えたダメージがどこにも残らない。
private final class Enemy {
    let name: String
    var hp: Double
    let maxHp: Double
    let attack: Double
    let defense: Double
    /// 攻撃間隔（秒）
    let interval: Double
    let isBoss: Bool

    init(name: String, hp: Double, maxHp: Double, attack: Double,
         defense: Double, interval: Double, isBoss: Bool) {
        self.name = name
        self.hp = hp
        self.maxHp = maxHp
        self.attack = attack
        self.defense = defense
        self.interval = interval
        self.isBoss = isBoss
    }
}

/// ステージ・難易度・深度から敵の強さの基準値を出す。
private func enemyScale(_ stage: StageDef, _ tier: Int, _ encIdx: Int) -> Double {
    let depth = Double(encIdx) / Double(Swift.max(1, stage.encounters - 1))
    return (0.85 + 0.20 * Double(stage.id)) * difficultyMul(tier) * (1 + depth * 0.5)
}

/// 敵の攻撃力だけに掛ける正規化係数。
///
/// 被ダメージの総量が遭遇数に依らないよう正規化する。遭遇数はステージの長さを
/// 決める値であって、難易度のハンドルではない。
private func attritionNorm(_ stage: StageDef) -> Double {
    9.0 / Double(stage.encounters)
}

private func makeEnemies(
    _ rng: inout Prng, _ stage: StageDef, _ tier: Int, _ encIdx: Int, _ isBossFight: Bool
) -> [Enemy] {
    let scale = enemyScale(stage, tier, encIdx)
    if isBossFight {
        return [Enemy(
            name: bossName(stage.id),
            hp: TUNING.bossHp * scale, maxHp: TUNING.bossHp * scale,
            attack: TUNING.bossAttack * scale * attritionNorm(stage),
            defense: TUNING.enemyDefense * 1.3 * scale,
            interval: 2.0,
            isBoss: true
        )]
    }
    // 1遭遇の敵数は 3〜5 体（§6.2）
    let count = 3 + rng.int(3)
    // 1遭遇＝同じ種類の群れ。名前が遭遇ごとに変わることで、
    // レポートの「何に倒されたか」が具体的になる
    let pool = enemiesForStage(stage.id)
    let label = pool.isEmpty ? "魔物" : rng.pick(pool).name
    var enemies: [Enemy] = []
    for _ in 0..<count {
        let jitter = 0.85 + rng.float() * 0.3
        enemies.append(Enemy(
            name: label,
            hp: TUNING.enemyHp * scale * jitter, maxHp: TUNING.enemyHp * scale * jitter,
            attack: TUNING.enemyAttack * scale * attritionNorm(stage),
            defense: TUNING.enemyDefense * scale,
            interval: TUNING.enemyInterval,
            isBoss: false
        ))
    }
    return enemies
}

// MARK: - 属性

/// 属性係数：耐性属性なら0.5、弱点属性なら1.5、それ以外1.0（§6.3）。
private func elementMul(_ stage: StageDef, _ elem: Element) -> Double {
    if stage.resists.contains(elem) { return 0.5 }
    if stage.weakTo == elem { return 1.5 }
    return 1.0
}

// MARK: - 順序を保つ集計
//
// JS のオブジェクトは**挿入順**で回るので、`topEntry` は同率のとき
// 「先に入ったほう」を返す。Swift の Dictionary は順序を持たないため、
// そのまま辞書にすると、同率のときに選ばれる要因が実行ごとに変わる——
// 「見どころ」の1行が回すたびに違う、という再現しない不具合になる。

struct OrderedTally<Key: Hashable> {
    private(set) var keys: [Key] = []
    private var values: [Key: Double] = [:]

    subscript(_ k: Key) -> Double { values[k] ?? 0 }

    mutating func add(_ k: Key, _ v: Double) {
        if values[k] == nil { keys.append(k) }
        values[k] = (values[k] ?? 0) + v
    }

    /// 最大の1件。同率なら先に入ったほう。
    var top: (key: Key, value: Double)? {
        var best: (Key, Double)?
        for k in keys {
            let v = values[k] ?? 0
            if best == nil || v > best!.1 { best = (k, v) }
        }
        guard let b = best else { return nil }
        return (key: b.0, value: b.1)
    }
}

// MARK: - 装備の集計

private struct Loadout {
    var attack: Double
    var speed: Double
    var critRate: Double
    var critMul: Double
    /// 属性ごとの実効攻撃力（属性係数適用前の配分）
    var split: [(Element, Double)]
    /// 属性ごとの固定追加ダメージ
    var flatElem: [(Element, Double)]
    var attackPct: Double
    var lowHpPct: Double
    var comboSpeedPct: Double
    var defense: Double
    var defensePct: Double
    /// 属性ごとの耐性(0〜1)
    var resist: [Element: Double]
    var killHeal: Double
    var weaponUnique: UniqueKind?
    var armorUnique: UniqueKind?
}

/// 持たせた薬（薬草園）。**乱数は一切引かない。**
public struct PotionEffect: Sendable {
    public let element: Element
    public let resist: Double
    public let name: String
    public init(element: Element, resist: Double, name: String) {
        self.element = element
        self.resist = resist
        self.name = name
    }
}

private func buildLoadout(_ weapon: Item, _ armor: Item, _ potion: PotionEffect?) -> Loadout {
    let wBase = baseDef(weapon.baseId)
    var lo = Loadout(
        attack: Double(weapon.power),
        speed: weapon.speed != 0 ? weapon.speed : wBase.speed,
        critRate: weapon.crit / 100,
        critMul: 1.5,
        split: [],
        flatElem: [],
        attackPct: 0,
        lowHpPct: 0,
        comboSpeedPct: 0,
        defense: Double(armor.power),
        defensePct: 0,
        resist: [:],
        killHeal: 0,
        weaponUnique: weapon.unique,
        armorUnique: armor.unique
    )
    for s in weapon.element.shares where s.value > 0 {
        lo.split.append((s.element, s.value))
    }
    if lo.split.isEmpty { lo.split.append((.physical, 1)) }

    for a in weapon.affixes {
        switch a.kind {
        case .attackPct: lo.attackPct += a.value
        case .critDmgPct: lo.critMul += a.value / 100
        case .elementFlat: lo.flatElem.append((a.element ?? .fire, a.value))
        case .lowHpPct: lo.lowHpPct += a.value
        case .comboSpeedPct: lo.comboSpeedPct += a.value
        default: break
        }
    }
    for a in armor.affixes {
        switch a.kind {
        case .defensePct: lo.defensePct += a.value
        case .resistPct:
            let e = a.element ?? .fire
            lo.resist[e] = (lo.resist[e] ?? 0) + a.value / 100
        case .killHeal: lo.killHeal += a.value
        default: break
        }
    }

    // 薬は防具の耐性と同じ場所に足す。上限（0.75）も共通なので、
    // 「耐性防具＋同属性の薬」で無敵にはならない
    if let p = potion {
        lo.resist[p.element] = (lo.resist[p.element] ?? 0) + p.resist
    }
    // L4 ユニーク（§5.5）
    if weapon.unique == .noCritFlatPower {
        lo.critRate = 0
        lo.attackPct += 25
    }
    if weapon.unique == .slowTriple {
        lo.speed *= 0.5
    }
    return lo
}

// MARK: - 記録

private struct Telemetry {
    var damageByElement = OrderedTally<Element>()
    var damageByAffix = OrderedTally<AffixKind>()
    /// 属性係数によって失った／得た分
    var resistedLoss = 0.0
    var weaknessGain = 0.0
    var totalDealt = 0.0
    var totalTaken = 0.0
    var takenByElement = OrderedTally<Element>()
    var resistSaved = 0.0
    /// そのうち薬が減らしたぶん
    var potionSaved = 0.0
    /// 防具ユニーク『背水の鎧』が肩代わりした被弾量
    var lastStandSaved = 0.0
    /// 防具ユニーク『棘の外套』が返したダメージ量
    var thornsDealt = 0.0
    var healed = 0.0
    var crits = 0
    var hits = 0
    var kills = 0
    var biggestHit = 0.0
    var evaded = 0
}

// MARK: - 本体

public struct SimulateInput {
    public var seed: UInt32
    public var job: JobDef
    public var weapon: Item
    public var armor: Item
    public var rule: RetreatRuleDef
    public var stage: StageDef
    /// 難易度ティア（1始まり。ステージ10クリアで+1）
    public var tier: Int
    public var potion: PotionEffect?

    public init(seed: UInt32, job: JobDef, weapon: Item, armor: Item,
                rule: RetreatRuleDef, stage: StageDef, tier: Int,
                potion: PotionEffect? = nil) {
        self.seed = seed
        self.job = job
        self.weapon = weapon
        self.armor = armor
        self.rule = rule
        self.stage = stage
        self.tier = tier
        self.potion = potion
    }
}

public func simulateRun(_ input: SimulateInput) -> RunResult {
    let job = input.job, weapon = input.weapon, armor = input.armor
    let rule = input.rule, stage = input.stage, tier = input.tier
    var rng = Prng(seed: input.seed)
    let lo = buildLoadout(weapon, armor, input.potion)
    let potionElem = input.potion?.element
    let potionRate = input.potion?.resist ?? 0
    var tm = Telemetry()

    let maxHp = job.hp
    var hp = maxHp
    var hpCurve: [Double] = [1]

    // ベースタグごとの取り柄（§5.1「単純な上位互換を作らない」）。
    //   heavy    … 薙ぎ払い。倒しきって余った分が次の敵へ流れる
    //   balanced … armorPierce。敵防御の一部を無視する
    //   fast/crit… 高い会心率（表の数値で表現済み）
    let wTags = baseDef(weapon.baseId).tags
    let cleaves = wTags.contains("heavy")
    let armorPierce = wTags.contains("balanced") ? BALANCED_PIERCE : 0

    // 防具ユニーク（§5.5）。生成側でスロットを絞っているが、
    // 読む側も「防具に載っているものだけを読む」ことをここで明示する
    let wardStack = armor.unique == .wardStack
    let lastStand = armor.unique == .lastStand
    let thorns = armor.unique == .thorns

    let greedy = weapon.unique == .greedyGlass || armor.unique == .greedyGlass
    let takenMul = job.damageTakenMul * (greedy ? 1.25 : 1)

    var killStackBonus = 0.0
    // 『積年の盾』。被弾するたびに防御が増える（そのステージ中のみ）
    var wardBonus = 0.0
    var outcome: RunOutcome = .clear
    var depth = 0
    var bossDefeated = false
    var deathCause = ""

    // 属性係数を先に確定しておく（表示・見どころ用にも使う）
    let splitMuls: [(e: Element, p: Double, mul: Double)] = lo.split.map {
        (e: $0.0, p: $0.1, mul: elementMul(stage, $0.0))
    }

    // 遭遇の途中で撤退ラインを割ったかどうか
    var bailedMidEncounter = false

    /// 撃破時の処理。TS 版は for の中の関数宣言（巻き上げ）で、
    /// 触るのは外側の変数だけなので、ここでは一度だけ定義する。
    func onKill() {
        tm.kills += 1
        if weapon.unique == .killStack { killStackBonus += 1 }
        if lo.killHeal > 0 && hp > 0 {
            let before = hp
            hp = Swift.min(maxHp, hp + lo.killHeal)
            tm.healed += hp - before
        }
    }

    for encIdx in 0..<stage.encounters {
        let isBossFight = encIdx == stage.encounters - 1
        let enemies = makeEnemies(&rng, stage, tier, encIdx, isBossFight)
        var combo = 0
        var attackAccum = 0.0
        var enemyAccum = [Double](repeating: 0, count: enemies.count)
        var t = 0.0

        while t < ENCOUNTER_TIMEOUT {
            if enemies.allSatisfy({ $0.hp <= 0 }) { break }
            if hp <= 0 { break }
            // §4.3 は「HPが閾値を切った時点で帰還」と定めている。遭遇と遭遇の間で
            // しか見ないと、1回の遭遇で押し切られたときに撤退ルールが効かない。
            // ボス戦だけは途中離脱させない。
            if rule.threshold > 0 && !isBossFight && hp / maxHp < rule.threshold {
                bailedMidEncounter = true
                break
            }

            // --- プレイヤーの攻撃 ---
            let comboMul = 1 + (Double(Swift.min(5, combo)) * lo.comboSpeedPct) / 100
            attackAccum += lo.speed * comboMul * DT
            while attackAccum >= 1 {
                attackAccum -= 1
                guard let target = enemies.first(where: { $0.hp > 0 }) else { break }

                let lowHp = hp / maxHp <= 0.5 ? lo.lowHpPct : 0
                let pctMul = 1 + (lo.attackPct + lowHp) / 100
                let atkBase = lo.attack + killStackBonus

                // 属性配分ごとに係数を掛ける（§6.3）
                var raw = 0.0
                var perElement: [(Element, Double)] = []
                for s in splitMuls {
                    let d = atkBase * s.p * s.mul * pctMul
                    raw += d
                    perElement.append((s.e, d))
                    let flat = atkBase * s.p * pctMul
                    if s.mul < 1 { tm.resistedLoss += flat - d }
                    if s.mul > 1 { tm.weaknessGain += d - flat }
                }
                // 属性ダメージ追加アフィックス
                var flatAffixDealt = 0.0
                for (e, v) in lo.flatElem {
                    let d = v * elementMul(stage, e) * pctMul
                    raw += d
                    flatAffixDealt += d
                    perElement.append((e, d))
                }

                let uniqueMul = weapon.unique == .slowTriple ? 3.0 : 1.0
                var dmg = Swift.max(1, raw * uniqueMul - target.defense * (1 - armorPierce))

                var isCrit = false
                if lo.critRate > 0 && rng.float() < lo.critRate {
                    isCrit = true
                    dmg *= lo.critMul
                    tm.crits += 1
                }

                // 集計（見どころ生成用）
                let scale = raw > 0 ? dmg / raw : 0
                for (e, d) in perElement {
                    tm.damageByElement.add(e, d * scale)
                }
                if lo.attackPct > 0 {
                    tm.damageByAffix.add(.attackPct, dmg * (lo.attackPct / 100) / pctMul)
                }
                if lowHp > 0 {
                    tm.damageByAffix.add(.lowHpPct, dmg * (lowHp / 100) / pctMul)
                }
                if flatAffixDealt > 0 {
                    tm.damageByAffix.add(.elementFlat, flatAffixDealt * scale)
                }
                if isCrit {
                    tm.damageByAffix.add(.critDmgPct, dmg * (1 - 1 / lo.critMul))
                }
                if combo > 0 && lo.comboSpeedPct > 0 {
                    tm.damageByAffix.add(.comboSpeedPct, dmg * (comboMul - 1))
                }
                tm.totalDealt += dmg
                tm.hits += 1
                tm.biggestHit = Swift.max(tm.biggestHit, dmg)
                combo = Swift.min(5, combo + 1)

                // slowTriple は範囲攻撃（§5.5）
                if weapon.unique == .slowTriple {
                    for e in enemies {
                        if e.hp <= 0 { continue }
                        e.hp -= dmg
                        if e.hp <= 0 { onKill() }
                    }
                } else if cleaves {
                    // 大振りの武器（heavy タグ）は、倒しきって余った分を次の敵へ薙ぎ払う。
                    // これが無いと大振り型は構造的に必ず最下位になる（実測済み）。
                    var carry = dmg
                    for e in enemies {
                        if carry <= 0 { break }
                        if e.hp <= 0 { continue }
                        let applied = Swift.min(e.hp, carry)
                        e.hp -= applied
                        carry -= applied
                        if e.hp <= 0 { onKill() } else { break }
                    }
                } else {
                    target.hp -= dmg
                    if target.hp <= 0 { onKill() }
                }
            }

            // --- 敵の攻撃 ---
            for i in 0..<enemies.count {
                let e = enemies[i]
                if e.hp <= 0 { continue }
                enemyAccum[i] += DT / e.interval
                while enemyAccum[i] >= 1 {
                    enemyAccum[i] -= 1
                    if job.evasion > 0 && rng.float() < job.evasion {
                        tm.evaded += 1
                        continue
                    }
                    let elem: Element
                    switch stage.enemyElement {
                    case .mixed:
                        let mixedPool: [Element] = [.fire, .ice, .lightning, .poison]
                        elem = mixedPool[rng.int(4)]
                    case .single(let se):
                        elem = se
                    }
                    let defTotal = (lo.defense + wardBonus) * (1 + lo.defensePct / 100)
                    let defRate = Swift.min(
                        TUNING.defenseCap,
                        defTotal / (defTotal + TUNING.defenseConst * enemyScale(stage, tier, encIdx))
                    )
                    let res = Swift.min(0.75, lo.resist[elem] ?? 0)
                    let beforeRes = e.attack * (1 - defRate) * takenMul
                    // 薬のぶんだけ別に数える。装備の耐性と混ぜると
                    // 「薬のおかげでどれだけ減ったか」が言えなくなる
                    if potionElem == elem && potionRate > 0 {
                        let withoutPotion = Swift.min(0.75, Swift.max(0, (lo.resist[elem] ?? 0) - potionRate))
                        tm.potionSaved += beforeRes * ((1 - withoutPotion) - (1 - res))
                    }
                    // 『背水の鎧』：HP25%以下で被ダメージ半減
                    let lastStandMul = (lastStand && hp / maxHp <= 0.25) ? 0.5 : 1.0
                    let taken = beforeRes * (1 - res) * lastStandMul
                    tm.resistSaved += beforeRes - taken
                    if lastStandMul < 1 { tm.lastStandSaved += beforeRes * (1 - res) - taken }
                    hp -= taken
                    tm.totalTaken += taken
                    tm.takenByElement.add(elem, taken)
                    // 『積年の盾』：被弾するたび防御+2
                    if wardStack { wardBonus += 2 }
                    // 『棘の外套』：受けた分の40%を返す
                    if thorns && taken > 0 {
                        let back = taken * 0.4
                        e.hp -= back
                        tm.thornsDealt += back
                        if e.hp <= 0 { onKill() }
                    }
                    if hp <= 0 {
                        deathCause = e.name
                        break
                    }
                }
                if hp <= 0 { break }
            }

            t += DT
        }

        if bailedMidEncounter {
            // その遭遇は踏破していないので深度は encIdx のまま
            outcome = .retreat
            depth = encIdx
            hpCurve.append(Swift.max(0, hp / maxHp))
            break
        }

        if hp <= 0 {
            outcome = .death
            depth = encIdx
            hpCurve.append(0)
            break
        }

        depth = encIdx + 1
        hpCurve.append(Swift.max(0, hp / maxHp))
        if isBossFight { bossDefeated = true }

        // 撤退判定（§4.3）。深追いは threshold 0 なので発火しない
        if rule.threshold > 0 && hp / maxHp < rule.threshold && !isBossFight {
            outcome = .retreat
            break
        }
    }

    if outcome == .clear && depth < stage.encounters {
        // 打ち切り等で最後まで行けなかった場合は撤退扱い
        outcome = .retreat
    }

    // --- 戦利品（§7.3 未鑑定品を最大10個）---
    var loot: [Item] = []
    if outcome != .death {
        // 満踏破で MAX_LOOT に届く配分にする。職・ユニークの加算は上限未満のときに効く。
        var count = jsRoundInt(2 + (Double(depth) / Double(stage.encounters)) * Double(MAX_LOOT - 2))
        count += job.bonusDrops
        if greedy { count = jsRoundInt(Double(count) * 1.5) }
        count = Swift.max(0, Swift.min(MAX_LOOT, count))
        let power = itemPowerFor(stageId: stage.id, tier: tier)
        for i in 0..<count {
            let slot = pickSlot(&rng, stage.dropBias)
            loot.append(generateItem(&rng, GenerateOptions(
                itemPower: power, slot: slot, stageId: stage.id,
                rarityBonus: stage.rarityBonus,
                id: "\(base36(input.seed))-\(i)"
            )))
        }

        // 救済枠（§14「10個開封して、7割以上の確率で嬉しいものが出るか」）。
        // 素の確率（稀少9%／遺物3%）だと、10個引いても2割の回は稀少以上が出ない。
        // 開封は演出を最も濃く積んだ画面なので、空振りが混ざるとその回がまるごと作業になる。
        if loot.count >= PITY_MIN_LOOT
            && !loot.contains(where: { $0.rarity == .rare || $0.rarity == .relic }) {
            let idx = rng.int(loot.count)
            let victim = loot[idx]
            loot[idx] = generateItem(&rng, GenerateOptions(
                itemPower: power, slot: victim.slot, stageId: stage.id,
                rarityBonus: stage.rarityBonus,
                id: "\(base36(input.seed))-p\(idx)",
                forceRarity: .rare
            ))
        }
    }

    let gold = outcome == .death
        ? 0
        : jsRoundInt(Double(depth) * (6 + Double(stage.id) * 3) * difficultyMul(tier))

    // 実時間は到達深度に比例する。ただし下限を置く。
    // 比例だけにすると、装備が届いていない回は depth=0 → 1秒で帰ってくる。
    let full = Double(stage.minutes * 60) * job.timeMul
    let durationSec = Swift.max(
        jsRoundInt(full * MIN_TRIP_RATIO),
        jsRoundInt(full * (Double(depth) / Double(stage.encounters)))
    )

    return RunResult(
        outcome: outcome,
        depth: depth,
        encountersTotal: stage.encounters,
        bossDefeated: bossDefeated,
        loot: loot,
        gold: gold,
        headline: buildHeadline(outcome, depth, stage, bossDefeated, deathCause),
        highlights: buildHighlights(
            tm, weapon, armor, outcome, splitMuls, deathCause,
            depth, stage.encounters, stage, input.potion?.name
        ),
        hpCurve: hpCurve,
        durationSec: Swift.max(1, durationSec),
        stats: RunStats(
            dealt: jsRoundInt(tm.totalDealt),
            taken: jsRoundInt(tm.totalTaken),
            kills: tm.kills,
            hits: tm.hits,
            crits: tm.crits,
            biggestHit: jsRoundInt(tm.biggestHit),
            evaded: tm.evaded,
            potionSaved: jsRoundInt(tm.potionSaved)
        )
    )
}

private func pickSlot(_ rng: inout Prng, _ bias: StageDef.DropBias) -> Slot {
    let p: Double
    switch bias {
    case .weapon: p = 0.65
    case .armor: p = 0.35
    case .even: p = 0.5
    }
    return rng.float() < p ? .weapon : .armor
}

// MARK: - 出力文

private func buildHeadline(
    _ outcome: RunOutcome, _ depth: Int, _ stage: StageDef,
    _ bossDefeated: Bool, _ deathCause: String
) -> String {
    if outcome == .death {
        return "深度\(depth)で力尽きた／\(deathCause.isEmpty ? "力及ばず" : deathCause)"
    }
    if outcome == .clear {
        return "\(stage.name)を踏破／ボス『\(bossName(stage.id))』撃破"
    }
    return bossDefeated
        ? "深度\(depth)で撤退／ボス『\(bossName(stage.id))』撃破"
        : "深度\(depth)で撤退／\(stage.name)"
}

let ELEM_NAME: [Element: String] = [
    .physical: "物理", .fire: "炎", .lightning: "雷", .poison: "毒", .ice: "氷"
]

/// 見どころ3行（§7.3）。**最重要。**
/// なぜその結果になったかが分からないと、完全な運ゲーに感じられる。
private func buildHighlights(
    _ tm: Telemetry, _ weapon: Item, _ armor: Item,
    _ outcome: RunOutcome,
    _ splitMuls: [(e: Element, p: Double, mul: Double)],
    _ deathCause: String, _ depth: Int, _ total: Int,
    _ stage: StageDef, _ potionName: String?
) -> [String] {
    var lines: [String] = []
    let dealt = Swift.max(1, tm.totalDealt)
    let taken = Swift.max(1, tm.totalTaken)

    // --- 1行目: 属性の噛み合い（＝武器選択の答え合わせ）---
    let resisted = splitMuls.filter { $0.mul < 1 }
    let weak = splitMuls.filter { $0.mul > 1 }
    if !resisted.isEmpty && tm.resistedLoss > dealt * 0.10 {
        let names = resisted.map { ELEM_NAME[$0.e] ?? "" }.joined(separator: "と")
        let lost = jsRoundInt((tm.resistedLoss / (dealt + tm.resistedLoss)) * 100)
        lines.append("\(names)が効かない敵に\(names)武器で挑み、火力を約\(lost)%捨てていた")
    } else if !weak.isEmpty && tm.weaknessGain > dealt * 0.05 {
        let names = weak.map { ELEM_NAME[$0.e] ?? "" }.joined(separator: "と")
        let gain = jsRoundInt((tm.weaknessGain / Swift.max(1, dealt - tm.weaknessGain)) * 100)
        lines.append("\(names)が弱点を突き、火力を約\(gain)%上乗せできた")
    } else if !resisted.isEmpty {
        let names = resisted.map { ELEM_NAME[$0.e] ?? "" }.joined(separator: "と")
        lines.append("\(names)は半減される相手だったが、配分が小さく実害は軽かった")
    } else {
        // 弱点も耐性も無い相手では属性について何も言えない。その回の実数から語る。
        let perHit = jsRoundInt(dealt / Double(Swift.max(1, tm.hits)))
        lines.append(tm.hits > 0
            ? "属性は等倍。1撃あたり\(perHit)を\(tm.hits)回通して\(tm.kills)体を仕留めた"
            : "属性は等倍。攻撃を1度も当てられないまま終わった")
    }

    // --- 2行目: 効いた装備（アフィックス／ユニーク）---
    if armor.unique == .lastStand && tm.lastStandSaved > taken * 0.05 {
        lines.append("《背水の鎧》が瀕死の間に被弾を\(jsRoundInt(tm.lastStandSaved))肩代わりした")
    } else if armor.unique == .thorns && tm.thornsDealt > dealt * 0.05 {
        lines.append("《棘の外套》が受けた分を\(jsRoundInt(tm.thornsDealt))返し、総火力の\(jsRoundInt((tm.thornsDealt / dealt) * 100))%を稼いだ")
    } else if armor.unique == .wardStack {
        lines.append("《積年の盾》が被弾のたび硬くなり、後半ほど削られにくくなった")
    } else if let wu = weapon.unique {
        lines.append("遺物《\(uniqueDef(wu).name)》の効果が乗り、\(tm.hits)回の攻撃を支えた")
    } else if armor.unique == .greedyGlass || weapon.unique == .greedyGlass {
        lines.append("《強欲の器》がドロップを増やす代わりに、被弾を25%増やしていた")
    } else {
        let topAffix = tm.damageByAffix.top
        if let ta = topAffix, ta.value > dealt * 0.05 {
            let def = affixDef(ta.key)
            lines.append("「\(def.name)」が総ダメージの\(jsRoundInt((ta.value / dealt) * 100))%を稼いだ")
        } else if weapon.affixes.isEmpty {
            lines.append("武器にアフィックスが無く、素の攻撃力だけで押していた")
        } else {
            // 会心は「発生率が低い＝結果を左右していない」ことまで含めて正直に書く。
            let rate = tm.hits > 0 ? jsRoundInt((Double(tm.crits) / Double(tm.hits)) * 100) : 0
            lines.append(rate >= 20
                ? "\(tm.hits)回中\(tm.crits)回が会心。会心が火力の柱だった"
                : "会心は\(tm.hits)回中\(tm.crits)回（\(rate)%）で、勝敗にはほぼ関与していない")
        }
    }

    // --- 薬を持たせていたら、その働きを1行にする（薬草園）。
    // 逆に、**効いたはずの薬を持っていなかった**ことも言う——
    // 次に何をすればいいかが分かるのは、そちらの行のほうである。
    if tm.potionSaved > taken * 0.04, let pn = potionName {
        lines.append("《\(pn)》が被弾を\(jsRoundInt(tm.potionSaved))肩代わりした"
            + "（受けた分の\(jsRoundInt((tm.potionSaved / (taken + tm.potionSaved)) * 100))%）")
    } else if potionName == nil, case .single(let se) = stage.enemyElement, taken > 0 {
        let en = ELEM_NAME[se] ?? ""
        lines.append("\(en)耐性の薬を持たせていれば、被弾を1割ほど抑えられたかもしれない")
    }

    // --- 3行目: 生存の要因／敗因 ---
    if outcome == .death {
        let e = tm.takenByElement.top
        let en = e.map { ELEM_NAME[$0.key] ?? "敵" } ?? "敵"
        let hasResist = armor.affixes.contains { $0.kind == .resistPct && $0.element == e?.key }
        if !hasResist && tm.resistSaved < taken * 0.05 {
            lines.append("\(en)属性の攻撃に耐性が無く、\(deathCause.isEmpty ? "数に押し切られて" : deathCause)倒れた")
        } else if tm.hits > 0 && dealt / Double(Swift.max(1, tm.kills)) > 0 {
            lines.append("防具は仕事をしたが、火力が足りず長期戦になって削り切られた")
        } else {
            lines.append("\(deathCause.isEmpty ? "敵" : deathCause)に押し切られた")
        }
    } else if outcome == .retreat {
        let reason: String
        if tm.healed > 0 {
            reason = "撃破時回復が計\(jsRoundInt(tm.healed))を戻したが追いつかなかった"
        } else if tm.resistSaved > taken * 0.10 {
            reason = "属性耐性が被弾を約\(jsRoundInt((tm.resistSaved / (taken + tm.resistSaved)) * 100))%減らした"
        } else if tm.evaded > 0 {
            reason = "回避が\(tm.evaded)回。被弾は抑えたが決め手に欠けた"
        } else {
            reason = "防御の支えが無く、HPの残量だけが頼りだった"
        }
        lines.append("\(depth)/\(total)で撤退ラインに触れた。\(reason)")
    } else {
        if tm.healed > 0 {
            lines.append("撃破時回復が計\(jsRoundInt(tm.healed))を戻し、最後まで余力を保った")
        } else if tm.resistSaved > taken * 0.10 {
            lines.append("属性耐性が被弾を約\(jsRoundInt((tm.resistSaved / (taken + tm.resistSaved)) * 100))%減らし、踏破を支えた")
        } else {
            lines.append("被弾を正面から受け切って踏破した")
        }
    }

    return Array(lines.prefix(3))
}
