// このファイルは自動生成。手で編集しない。
//
//     npx tsx tools/gen-swift-tables.ts > swift/Sources/DelversCore/Data/Generated.swift
//
// 元は src/data/*.ts。**並び順に意味がある**——rng.pick / rng.int の対象なので、
// 見やすさのために並べ替えると同じ種から別のゲームが立ち上がる。

import Foundation

public let BASE_TYPES: [BaseTypeDef] = [
    BaseTypeDef(id: "dagger", name: "短剣", slot: .weapon,
                mul: 0.265, speed: 2.1, critMin: 9, critMax: 13,
                tags: ["fast", "crit", "physical"]),
    BaseTypeDef(id: "sword", name: "片手剣", slot: .weapon,
                mul: 0.5, speed: 1.26, critMin: 5, critMax: 7,
                tags: ["balanced", "crit", "physical"]),
    BaseTypeDef(id: "greatsword", name: "両手剣", slot: .weapon,
                mul: 0.85, speed: 0.66, critMin: 4, critMax: 6,
                tags: ["slow", "heavy", "physical"]),
    BaseTypeDef(id: "spear", name: "槍", slot: .weapon,
                mul: 0.552, speed: 1.02, critMin: 5, critMax: 7,
                tags: ["balanced", "reach", "physical"]),
    BaseTypeDef(id: "bow", name: "弓", slot: .weapon,
                mul: 0.423, speed: 1.5, critMin: 7, critMax: 9,
                tags: ["fast", "crit", "ranged"]),
    BaseTypeDef(id: "staff", name: "杖", slot: .weapon,
                mul: 0.547, speed: 1.14, critMin: 4, critMax: 6,
                tags: ["caster", "elemental"]),
    BaseTypeDef(id: "light", name: "軽鎧", slot: .armor,
                mul: 0.4, speed: 0, critMin: 0, critMax: 0,
                tags: ["light", "evasive"]),
    BaseTypeDef(id: "medium", name: "中鎧", slot: .armor,
                mul: 0.52, speed: 0, critMin: 0, critMax: 0,
                tags: ["medium", "balanced"]),
    BaseTypeDef(id: "heavy", name: "重鎧", slot: .armor,
                mul: 0.66, speed: 0, critMin: 0, critMax: 0,
                tags: ["heavy", "sturdy"]),
]

public let AFFIXES: [AffixDef] = [
    AffixDef(kind: .attackPct, name: "攻撃力", slot: .weapon,
             min: 8, max: 15, isPercent: true,
             tags: ["physical", "elemental"], elemental: false),
    AffixDef(kind: .critDmgPct, name: "会心ダメージ", slot: .weapon,
             min: 15, max: 40, isPercent: true,
             tags: ["crit"], elemental: false),
    AffixDef(kind: .elementFlat, name: "属性ダメージ", slot: .weapon,
             min: 4, max: 12, isPercent: false,
             tags: ["elemental", "ranged", "reach"], elemental: true),
    AffixDef(kind: .lowHpPct, name: "窮地の威力", slot: .weapon,
             min: 20, max: 50, isPercent: true,
             tags: ["heavy", "slow", "balanced"], elemental: false),
    AffixDef(kind: .comboSpeedPct, name: "連撃加速", slot: .weapon,
             min: 3, max: 8, isPercent: true,
             tags: ["fast"], elemental: false),
    AffixDef(kind: .defensePct, name: "防御", slot: .armor,
             min: 8, max: 15, isPercent: true,
             tags: ["light", "medium", "heavy"], elemental: false),
    AffixDef(kind: .resistPct, name: "属性耐性", slot: .armor,
             min: 10, max: 30, isPercent: true,
             tags: ["medium", "heavy", "sturdy"], elemental: true),
    AffixDef(kind: .killHeal, name: "撃破時回復", slot: .armor,
             min: 2, max: 6, isPercent: false,
             tags: ["light", "medium", "evasive", "balanced"], elemental: false),
]

public let UNIQUES: [UniqueDef] = [
    UniqueDef(kind: .noCritFlatPower, name: "静かな刃",
              text: "会心が発生しない。代わりに全攻撃の威力が常時 +25%", slot: .weapon),
    UniqueDef(kind: .slowTriple, name: "重き一撃",
              text: "攻撃速度が半減。1撃が3倍、かつ範囲攻撃になる", slot: .weapon),
    UniqueDef(kind: .killStack, name: "喰らう者",
              text: "敵を倒すたびに攻撃力 +1（そのステージ中のみ）", slot: .weapon),
    UniqueDef(kind: .wardStack, name: "積年の盾",
              text: "被弾するたびに防御 +2（そのステージ中のみ）", slot: .armor),
    UniqueDef(kind: .lastStand, name: "背水の鎧",
              text: "HPが25%を切っている間、受けるダメージが半減する", slot: .armor),
    UniqueDef(kind: .thorns, name: "棘の外套",
              text: "被弾するたび、受けたダメージの40%を相手に返す", slot: .armor),
    UniqueDef(kind: .greedyGlass, name: "強欲の器",
              text: "ドロップ +50%、被ダメージ +25%", slot: .both),
]

public let JOBS: [JobDef] = [
    JobDef(id: .swordsman, name: "剣士", hp: 100,
           armorRestriction: [], damageTakenMul: 1, timeMul: 1,
           evasion: 0, bonusDrops: 0,
           desc: "基準値。補正なし。あらゆる防具を装備できる"),
    JobDef(id: .guardian, name: "重装兵", hp: 140,
           armorRestriction: ["heavy"], damageTakenMul: 0.8, timeMul: 1.15,
           evasion: 0, bonusDrops: 0,
           desc: "重防具のみ。被ダメージ -20%／所要時間 +15%"),
    JobDef(id: .skirmisher, name: "遊撃兵", hp: 70,
           armorRestriction: ["light"], damageTakenMul: 1, timeMul: 0.8,
           evasion: 0.15, bonusDrops: 1,
           desc: "軽防具のみ。回避 +15%／所要時間 -20%／ドロップ +1"),
]

public let RETREAT_RULES: [RetreatRuleDef] = [
    RetreatRuleDef(id: .reckless, name: "深追い", threshold: 0,
                   desc: "HP0まで戦う。最深到達だが死亡リスク最大"),
    RetreatRuleDef(id: .standard, name: "標準", threshold: 0.3,
                   desc: "HP30%を切った時点で帰還"),
    RetreatRuleDef(id: .cautious, name: "慎重", threshold: 0.5,
                   desc: "HP50%を切った時点で帰還"),
]

public let UNLOCK_STAGE_FOR_SLOT: [Int] = [0, 3, 6]
public let SLOT_COST: [Int] = [0, 600, 2400]

public let STAGES: [StageDef] = [
    StageDef(id: 1, name: "廃坑", minutes: 5,
             enemyElement: .single(.physical), weakTo: nil, resists: [],
             encounters: 9, dropBias: .weapon, rarityBonus: 1, unlockCost: 0),
    StageDef(id: 2, name: "苔の回廊", minutes: 10,
             enemyElement: .single(.poison), weakTo: .fire, resists: [.poison],
             encounters: 10, dropBias: .armor, rarityBonus: 1.05, unlockCost: 120),
    StageDef(id: 3, name: "灼熱坑", minutes: 20,
             enemyElement: .single(.fire), weakTo: .lightning, resists: [.fire],
             encounters: 11, dropBias: .weapon, rarityBonus: 1.1, unlockCost: 320),
    StageDef(id: 4, name: "氷結層", minutes: 40,
             enemyElement: .single(.ice), weakTo: .fire, resists: [.ice],
             encounters: 12, dropBias: .even, rarityBonus: 1.15, unlockCost: 700),
    StageDef(id: 5, name: "雷鳴洞", minutes: 60,
             enemyElement: .single(.lightning), weakTo: .poison, resists: [.lightning],
             encounters: 13, dropBias: .weapon, rarityBonus: 1.2, unlockCost: 1300),
    StageDef(id: 6, name: "腐界", minutes: 90,
             enemyElement: .single(.poison), weakTo: .fire, resists: [.poison, .physical],
             encounters: 14, dropBias: .armor, rarityBonus: 1.28, unlockCost: 2400),
    StageDef(id: 7, name: "溶岩回廊", minutes: 120,
             enemyElement: .single(.fire), weakTo: .ice, resists: [.fire],
             encounters: 15, dropBias: .even, rarityBonus: 1.36, unlockCost: 4200),
    StageDef(id: 8, name: "骸の間", minutes: 180,
             enemyElement: .single(.physical), weakTo: .lightning, resists: [.physical, .poison],
             encounters: 16, dropBias: .weapon, rarityBonus: 1.45, unlockCost: 7000),
    StageDef(id: 9, name: "深層祭壇", minutes: 300,
             enemyElement: .mixed, weakTo: nil, resists: [.fire, .ice],
             encounters: 17, dropBias: .even, rarityBonus: 1.7, unlockCost: 12000),
    StageDef(id: 10, name: "深淵", minutes: 480,
             enemyElement: .mixed, weakTo: nil, resists: [.fire, .ice, .lightning],
             encounters: 18, dropBias: .even, rarityBonus: 2, unlockCost: 20000),
]

public let ENEMIES: [EnemyDef] = [
    EnemyDef(id: "M1", name: "坑道ネズミ", minStage: 1, maxStage: 2, flavor: .physical, icon: "goblin"),
    EnemyDef(id: "M2", name: "ゴブリン", minStage: 1, maxStage: 3, flavor: .physical, icon: "goblin"),
    EnemyDef(id: "M3", name: "苔まみれの屍", minStage: 2, maxStage: 4, flavor: .poison, icon: "corpse"),
    EnemyDef(id: "M4", name: "毒胞子のキノコ", minStage: 2, maxStage: 4, flavor: .poison, icon: "swamp"),
    EnemyDef(id: "M5", name: "灼熱のコウモリ", minStage: 3, maxStage: 5, flavor: .fire, icon: "dragon"),
    EnemyDef(id: "M6", name: "燃える石像", minStage: 3, maxStage: 6, flavor: .fire, icon: "golem"),
    EnemyDef(id: "M7", name: "氷牙のオオカミ", minStage: 4, maxStage: 6, flavor: .ice, icon: "goblin"),
    EnemyDef(id: "M8", name: "凍える亡霊", minStage: 4, maxStage: 7, flavor: .ice, icon: "corpse"),
    EnemyDef(id: "M9", name: "雷を纏う蟲", minStage: 5, maxStage: 7, flavor: .lightning, icon: "swamp"),
    EnemyDef(id: "M10", name: "帯電した石塊", minStage: 5, maxStage: 8, flavor: .lightning, icon: "golem"),
    EnemyDef(id: "M11", name: "腐肉喰らい", minStage: 6, maxStage: 8, flavor: .poison, icon: "corpse"),
    EnemyDef(id: "M12", name: "溶岩のトカゲ", minStage: 7, maxStage: 9, flavor: .fire, icon: "dragon"),
    EnemyDef(id: "M13", name: "骸の剣士", minStage: 8, maxStage: 10, flavor: .physical, icon: "knight"),
    EnemyDef(id: "M14", name: "鎧の亡骸", minStage: 8, maxStage: 10, flavor: .physical, icon: "knight"),
    EnemyDef(id: "M15", name: "祭壇の守り手", minStage: 9, maxStage: 10, flavor: .lightning, icon: "guardian"),
    EnemyDef(id: "M16", name: "深淵の影", minStage: 10, maxStage: 10, flavor: .ice, icon: "guardian"),
]

public let HERBS: [HerbDef] = [
    HerbDef(id: "ironleaf", name: "鉄草", element: .physical, growSec: 360, yieldCount: 2, seedCost: 40, glyph: "鉄"),
    HerbDef(id: "embermoss", name: "火苔", element: .fire, growSec: 480, yieldCount: 2, seedCost: 60, glyph: "火"),
    HerbDef(id: "venomcap", name: "毒茸", element: .poison, growSec: 540, yieldCount: 3, seedCost: 70, glyph: "毒"),
    HerbDef(id: "frostbloom", name: "氷花", element: .ice, growSec: 660, yieldCount: 3, seedCost: 90, glyph: "氷"),
    HerbDef(id: "stormroot", name: "雷根", element: .lightning, growSec: 840, yieldCount: 4, seedCost: 120, glyph: "雷"),
]

public let POTIONS: [PotionDef] = [
    PotionDef(id: "ironblood", name: "鉄血の丸薬", element: .physical, resist: 0.28,
              main: "ironleaf", other: 1, text: "物理の被害を 28% 減らす"),
    PotionDef(id: "fireoil", name: "耐炎油", element: .fire, resist: 0.32,
              main: "embermoss", other: 1, text: "炎の被害を 32% 減らす"),
    PotionDef(id: "antidote", name: "解毒剤", element: .poison, resist: 0.32,
              main: "venomcap", other: 1, text: "毒の被害を 32% 減らす"),
    PotionDef(id: "frostsalve", name: "氷耐性軟膏", element: .ice, resist: 0.34,
              main: "frostbloom", other: 1, text: "氷の被害を 34% 減らす"),
    PotionDef(id: "stormward", name: "雷避けの札", element: .lightning, resist: 0.36,
              main: "stormroot", other: 1, text: "雷の被害を 36% 減らす"),
]

public let PLOTS_INITIAL = 2
public let PLOTS_MAX = 6

/// n 枠目を開くのに要る金。
public func plotCost(_ nth: Int) -> Int {
    let table = [0, 0, 400, 1200, 3000, 7000]
    return nth >= 0 && nth < table.count ? table[nth] : 7000
}

/// ボス名。
public func bossName(_ stageId: Int) -> String {
    let names: [Int: String] = [
        1: "坑道の主", 2: "苔喰らい", 3: "灼熱の炉番", 4: "氷牙", 5: "雷鳴の主", 6: "腐肉の女王", 7: "溶岩喰い", 8: "骸の王", 9: "祭壇の守護者", 10: "深淵の目"
    ]
    return names[stageId] ?? "深き者"
}
