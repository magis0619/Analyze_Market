import DelversCore
import Foundation

/// 起動時の指定（web 版の `?reset=1&seed=…&devitems=…` と同じ役割）。
///
/// **見て直すための仕掛け。** 目的の画面まで毎回手で辿っていたら、
/// 批評の輪が回らない。決まった種と決まった持ち物で、狙った画面をそのまま出す。
///
///   xcrun simctl launch booted com.delvers.app -reset -seed 42 -devitems 40 -screen garden
///
/// 遊びの近道ではない。ここから入れるのは**状態を作って画面を出す**ところまでで、
/// ルールを飛ばす口は開けない。
struct LaunchOptions {
    var reset = false
    var seed: UInt32 = 0x51A7E
    /// 開発用に配る装備の数
    var devItems = 0
    /// 直接開く画面
    var screen: String?
    /// 未鑑定品をこの数だけ持たせる
    var pending = 0
    /// 未読レポートを作る
    var report = false
    /// 潜行中のまま止める（帰還させない）。「派遣中に拠点がどう見えるか」を撮るため
    var away = false
    /// SceneKit の統計表示。C4（滑らかさ）を体感ではなく数で見るため
    var fps = false
    /// 畑を育てきった状態にする
    var grown = false
    /// 金
    var gold: Int?

    static func fromProcess() -> LaunchOptions {
        let args = ProcessInfo.processInfo.arguments
        func value(_ key: String) -> String? {
            guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        var o = LaunchOptions()
        o.reset = args.contains("-reset")
        if let s = value("-seed"), let n = UInt32(s) { o.seed = n }
        if let s = value("-devitems"), let n = Int(s) { o.devItems = n }
        if let s = value("-pending"), let n = Int(s) { o.pending = n }
        if let s = value("-gold"), let n = Int(s) { o.gold = n }
        o.report = args.contains("-report")
        o.away = args.contains("-away")
        o.fps = args.contains("-fps")
        o.grown = args.contains("-grown")
        o.screen = value("-screen")
        return o
    }

    var route: Route? {
        switch screen {
        case "title": return .title
        case "base": return .base
        case "dispatch": return .dispatch
        case "status": return .status("d1")
        case "opening": return .opening
        case "inventory": return .inventory
        case "compendium": return .compendium
        case "garden": return .garden
        case "alchemy": return .alchemy
        case "report": return .report("")   // 実際の id は Shell が差し替える
        default: return nil
        }
    }

    /// 指定に沿って状態を作る。
    func seedState(_ st: GameState, now: Double) {
        if devItems > 0 || pending > 0 || report || grown || gold != nil {
            st.data.unlockedStages = [1, 2, 3, 4, 5]
            st.data.clearedStages = [1, 2]
        }
        if let g = gold { st.data.gold = g }
        if devItems > 0 {
            var rng = Prng(seed: seed ^ 0xD1CE)
            for i in 0..<devItems {
                var it = generateItem(&rng, GenerateOptions(
                    itemPower: itemPowerFor(stageId: 4, tier: 1),
                    slot: i % 2 == 0 ? .weapon : .armor,
                    stageId: 4, rarityBonus: 1.6, id: "dev-\(i)"))
                it.identified = true
                st.data.inventory.append(it)
            }
            // 一番強いものを装備させる。初期装備のままだと派遣が数秒で終わり、
            // 派遣中の見え方を一度も確かめられない
            for slot in [Slot.weapon, .armor] {
                if let best = st.data.inventory.filter({ $0.slot == slot })
                    .max(by: { $0.power < $1.power }) {
                    var eq = st.equipped(.swordsman)
                    if slot == .weapon { eq.weapon = best.id } else { eq.armor = best.id }
                    st.data.equipped[JobId.swordsman.rawValue] = eq
                }
            }
        }
        if pending > 0 {
            var rng = Prng(seed: seed ^ 0xBEEF)
            for i in 0..<pending {
                st.data.pending.append(generateItem(&rng, GenerateOptions(
                    itemPower: itemPowerFor(stageId: 5, tier: 1),
                    slot: i % 2 == 0 ? .weapon : .armor,
                    stageId: 5, rarityBonus: 2.4, id: "pend-\(i)")))
            }
        }
        if grown {
            st.data.garden.seeds["ironleaf"] = 3
            st.data.garden.seeds["embermoss"] = 2
            st.data.garden.seeds["stormroot"] = 2
            _ = st.plant(0, "embermoss")
            _ = st.plant(1, "stormroot")
            // 植えた時刻を過去へ。実時間は待てない
            for i in st.data.garden.beds.indices {
                st.data.garden.beds[i]?.plantedAt -= 3600 * 1000
            }
            st.data.garden.herbs = ["ironleaf": 4, "embermoss": 3, "venomcap": 2]
            st.data.garden.potions = ["ironblood": 1, "fireoil": 2]
        }
        if report {
            _ = st.dispatch(job: .swordsman, stage: 2, rule: .standard, now: now - 600_000)
            st.tick(now)
        }
        if away {
            // tick しない。**潜行の途中で止める**——D3（状態が光で伝わるか）は
            // 「今まさに誰かが出ている拠点」を見ないと確かめられない
            _ = st.dispatch(job: .swordsman, stage: 2, rule: .standard, now: now)
        }
        st.save()
    }
}
