import XCTest
@testable import DelversCore

/// state 層の突き合わせ。**台本を決めた1回の通しを、1手ごとに照合する。**
///
/// sim 層と違って state は状態を持つので、「同じ入力→同じ出力」では足りない。
/// 確かめたいのは「同じ手順を踏んだら同じ状態になるか」なので、
/// TypeScript 側で同じ台本を踏んだときの全体像を1手ずつ写してある
/// （`tools/golden-state.ts`）。
///
/// **ずれた手を名指しする。** 状態は雪だるま式にずれるので、最初にずれた1手さえ
/// 分かれば原因はその手の中にある。最後の状態だけを比べると、
/// 40手前の取りこぼしを探して一日溶かすことになる。
final class StateGoldenTests: XCTestCase {

    private static let golden: [String: JSONValue] = JSONValue.loadResource("golden-state")

    /// 最初にずれた手だけを報告して打ち切る。
    /// 以降は全部道連れで落ちるので、並べても読む価値がない。
    private var derailed = false

    private func check(_ ok: Bool, _ message: @autoclosure () -> String) {
        if derailed { return }
        if !ok {
            derailed = true
            XCTFail(message())
        }
    }

    private func eq<T: Equatable>(_ want: T, _ got: T, _ label: @autoclosure () -> String) {
        check(want == got, "\(label()): 期待 \(want) / 実際 \(got)")
    }

    func test状態の通しが一致する() {
        let seed = UInt32(f(Self.golden["initialSeed"]))
        let t0 = f(Self.golden["t0"])
        let script = a(Self.golden["script"])
        let frames = a(Self.golden["frames"])

        let store = MemorySaveStore()
        let st = GameState(seed: seed, now: t0, store: store, notifier: SilentNotifier())

        // 0 手目は init 直後
        compare(d(d(frames[0])["state"]), st, "init")

        for (k, stepValue) in script.enumerated() {
            if derailed { return }
            let step = d(stepValue)
            let op = s(step["op"])
            let label = "手 \(k)（\(op)）"
            let frame = d(frames[k + 1])

            let outcome = run(step, on: st)
            compareOutcome(frame["ok"], outcome, label)
            compare(d(frame["state"]), st, label)
        }
    }

    // MARK: - 台本を1手動かす

    /// 手の結果。TS 側は true/false と件数を混ぜて返すので、こちらも同じ形で受ける。
    private enum Outcome {
        case flag(Bool)
        case count(Int)
    }

    private func run(_ step: [String: JSONValue], on st: GameState) -> Outcome {
        switch s(step["op"]) {
        case "tick":
            st.tick(f(step["now"]))
            return .flag(true)

        case "setGold":
            st.data.gold = i(step["gold"])
            return .flag(true)

        case "equip":
            let job = JobId(rawValue: s(step["job"]))!
            let idx = i(step["itemIndex"])
            guard idx >= 0, idx < st.data.inventory.count else { return .flag(false) }
            var eq = st.equipped(job)
            if s(step["slot"]) == "weapon" {
                eq.weapon = st.data.inventory[idx].id
            } else {
                eq.armor = st.data.inventory[idx].id
            }
            st.data.equipped[job.rawValue] = eq
            return .flag(true)

        case "dispatch":
            return .flag(st.dispatch(
                job: JobId(rawValue: s(step["job"]))!,
                stage: i(step["stage"]),
                rule: RetreatRule(rawValue: s(step["rule"]))!,
                now: f(step["now"]),
                potionId: optS(step["potion"])
            ))

        case "openAll":
            return .count(st.openAll().count)

        case "sellAllUnlocked":
            return .count(st.sell(st.data.inventory.map(\.id)))

        case "lock":
            let idx = i(step["itemIndex"])
            guard idx >= 0, idx < st.data.inventory.count else { return .flag(false) }
            st.data.inventory[idx].locked.toggle()
            return .flag(true)

        case "unlockStage":
            return .flag(st.unlockStage(i(step["stage"])))

        case "unlockSlot":
            return .flag(st.unlockSlot())

        case "ensureStarterGear":
            st.ensureStarterGear(JobId(rawValue: s(step["job"]))!)
            return .flag(true)

        case "plant":
            return .flag(st.plant(i(step["index"]), s(step["herb"])))

        case "harvest":
            return .count(st.harvest(i(step["index"])))

        case "harvestAll":
            return .count(st.harvestAll())

        case "buySeed":
            return .flag(st.buySeed(s(step["herb"])))

        case "expandGarden":
            return .flag(st.expandGarden())

        case "brew":
            return .flag(st.brew(s(step["potion"])))

        case "reidentify":
            let idx = i(step["itemIndex"])
            guard idx >= 0, idx < st.data.inventory.count else { return .flag(false) }
            var rng = Prng(seed: UInt32(f(step["seed"])))
            return .flag(st.reidentify(st.data.inventory[idx].id, &rng))

        case "reidentifyFirstWithAffix":
            guard let it = st.data.inventory.first(where: { !$0.affixes.isEmpty }) else {
                return .flag(false)
            }
            var rng = Prng(seed: UInt32(f(step["seed"])))
            return .flag(st.reidentify(it.id, &rng))

        case "equipBest":
            // 「攻撃/防御が最大のもの。同値なら手前」。並べ替えを使わないのは、
            // 同値のときの順を実装（安定か否か）に委ねないため
            let job = JobId(rawValue: s(step["job"]))!
            func pick(_ slot: Slot) -> String? {
                var best: (id: String, power: Int)?
                for it in st.data.inventory where it.slot == slot {
                    if best == nil || it.power > best!.power { best = (it.id, it.power) }
                }
                return best?.id
            }
            let w = pick(.weapon), ar = pick(.armor)
            var eq = st.equipped(job)
            if let w { eq.weapon = w }
            if let ar { eq.armor = ar }
            st.data.equipped[job.rawValue] = eq
            return .flag(w != nil && ar != nil)

        case "grantItem":
            var rng = Prng(seed: UInt32(f(step["seed"])))
            let stageId = i(step["stage"])
            var it = generateItem(&rng, GenerateOptions(
                itemPower: i(step["itemPower"]),
                slot: Slot(rawValue: s(step["slot"]))!,
                stageId: stageId,
                rarityBonus: stageDef(stageId).rarityBonus,
                id: s(step["id"])
            ))
            it.identified = true
            st.data.inventory.append(it)
            return .flag(true)

        default:
            XCTFail("知らない手: \(s(step["op"]))")
            return .flag(false)
        }
    }

    private func compareOutcome(_ want: JSONValue?, _ got: Outcome, _ label: String) {
        switch (want, got) {
        case (.bool(let w)?, .flag(let g)):
            eq(w, g, "\(label) の成否")
        case (.number(let w)?, .count(let g)):
            eq(Int(w), g, "\(label) の件数")
        case (.number(let w)?, .flag(let g)):
            // TS 側が数を返す手を、こちらが真偽で返している＝写し違い
            check(false, "\(label): TS は件数 \(Int(w)) を返すのに、Swift は真偽 \(g) を返している")
        case (.bool(let w)?, .count(let g)):
            check(false, "\(label): TS は真偽 \(w) を返すのに、Swift は件数 \(g) を返している")
        default:
            check(false, "\(label): 結果の形が合わない")
        }
    }

    // MARK: - 状態を丸ごと突き合わせる

    private func compare(_ want: [String: JSONValue], _ st: GameState, _ label: String) {
        if derailed { return }
        let dd = st.data

        eq(i(want["gold"]), dd.gold, "\(label) の金")
        eq(i(want["tier"]), dd.tier, "\(label) の難易度")
        eq(i(want["nextId"]), dd.nextId, "\(label) の nextId")
        eq(f(want["lastSeen"]), dd.lastSeen, "\(label) の観測時刻")
        eq(i(want["unlockedSlots"]), dd.unlockedSlots, "\(label) の派遣枠")
        eq(a(want["clearedStages"]).map { i($0) }, dd.clearedStages, "\(label) の踏破済み")
        eq(a(want["unlockedStages"]).map { i($0) }, dd.unlockedStages, "\(label) の解放済み")
        eq(i(want["readyCount"]), st.readyCount(), "\(label) の収穫可能数")
        eq(i(want["slotCount"]), st.slotCount(), "\(label) の枠数")
        eq(optF(want["nextPlotCost"]).map { Int($0) }, st.nextPlotCost(), "\(label) の次の畑の費用")

        // 次の枠の条件
        if let ws = optD(want["nextSlot"]) {
            guard let gs = st.nextSlot() else {
                check(false, "\(label): 次の枠があるはずなのに nil")
                return
            }
            eq(i(ws["index"]), gs.index, "\(label) の次の枠の番号")
            eq(i(ws["needStage"]), gs.needStage, "\(label) の次の枠の条件ステージ")
            eq(i(ws["cost"]), gs.cost, "\(label) の次の枠の費用")
            eq(b(ws["stageDone"]), gs.stageDone, "\(label) の次の枠の踏破判定")
            eq(b(ws["affordable"]), gs.affordable, "\(label) の次の枠の支払い判定")
        } else {
            check(st.nextSlot() == nil, "\(label): 次の枠は無いはずなのに出ている")
        }

        // 所持品。**並び順まで見る**——売却や支給で順が変わると、
        // 画面の見え方も添字で触る処理も変わる
        let wantInv = a(want["inventory"]).map { d($0) }
        eq(wantInv.count, dd.inventory.count, "\(label) の所持品の数")
        if derailed { return }
        for (k, wi) in wantInv.enumerated() where k < dd.inventory.count {
            let gi = dd.inventory[k]
            eq(s(wi["id"]), gi.id, "\(label) の所持品[\(k)] の id")
            eq(s(wi["baseId"]), gi.baseId, "\(label) の所持品[\(k)] のベース")
            eq(s(wi["rarity"]), gi.rarity.rawValue, "\(label) の所持品[\(k)] のレアリティ")
            eq(i(wi["power"]), gi.power, "\(label) の所持品[\(k)] の攻撃/防御")
            eq(b(wi["locked"]), gi.locked, "\(label) の所持品[\(k)] のロック")
            eq(b(wi["identified"]), gi.identified, "\(label) の所持品[\(k)] の鑑定済み")
            eq(i(wi["sell"]), sellValue(gi), "\(label) の所持品[\(k)] の売値")
            let wa = a(wi["affixes"]).map { d($0) }
            eq(wa.count, gi.affixes.count, "\(label) の所持品[\(k)] のアフィックス数")
            for (m, w) in wa.enumerated() where m < gi.affixes.count {
                eq(s(w["kind"]), gi.affixes[m].kind.rawValue, "\(label) の所持品[\(k)].アフィックス[\(m)] の種類")
                eq(f(w["value"]), gi.affixes[m].value, "\(label) の所持品[\(k)].アフィックス[\(m)] の値")
                eq(i(w["tier"]), gi.affixes[m].tier, "\(label) の所持品[\(k)].アフィックス[\(m)] のティア")
            }
        }

        eq(a(want["pending"]).map { s($0) }, dd.pending.map(\.id), "\(label) の未開封")
        eq(a(want["inbox"]).map { s($0) }, dd.inbox, "\(label) の未読レポート")

        // 装備
        for (job, wv) in pairs(want["equipped"]) {
            let we = d(wv)
            let ge = dd.equipped[job] ?? EquipSet()
            eq(optS(we["weapon"]), ge.weapon, "\(label) の \(job) の武器")
            eq(optS(we["armor"]), ge.armor, "\(label) の \(job) の防具")
        }

        // 派遣中
        let wantDis = a(want["dispatches"]).map { d($0) }
        eq(wantDis.count, dd.dispatches.count, "\(label) の派遣中の数")
        if derailed { return }
        for (k, wd) in wantDis.enumerated() where k < dd.dispatches.count {
            let gd = dd.dispatches[k]
            eq(s(wd["id"]), gd.id, "\(label) の派遣[\(k)] の id")
            eq(s(wd["jobId"]), gd.jobId.rawValue, "\(label) の派遣[\(k)] の職")
            eq(i(wd["stageId"]), gd.stageId, "\(label) の派遣[\(k)] の行き先")
            eq(UInt32(f(wd["seed"])), gd.seed, "\(label) の派遣[\(k)] の種")
            eq(f(wd["startedAt"]), gd.startedAt, "\(label) の派遣[\(k)] の出発時刻")
            eq(i(wd["durationSec"]), gd.durationSec, "\(label) の派遣[\(k)] の所要")
            eq(optS(wd["potionId"]), gd.potionId, "\(label) の派遣[\(k)] の薬")
        }

        // 失った装備・図鑑・結果
        eq(a(want["lostKeys"]).map { s($0) }, dd.lost.keys.sorted(), "\(label) の喪失の記録")
        for (key, wv) in pairs(want["lostIds"]) {
            eq(a(wv).map { s($0) }, (dd.lost[key] ?? []).map(\.id), "\(label) の \(key) で失った品")
        }
        let wantComp = pairs(want["compendium"])
        eq(wantComp.count, dd.compendium.count, "\(label) の図鑑の項目数")
        for (key, wv) in wantComp {
            let we = d(wv)
            guard let ge = dd.compendium[key] else {
                check(false, "\(label): 図鑑に \(key) が無い")
                return
            }
            eq(i(we["firstStage"]), ge.firstStage, "\(label) の図鑑 \(key) の初出")
            eq(i(we["count"]), ge.count, "\(label) の図鑑 \(key) の数")
        }
        for (key, wv) in pairs(want["results"]) {
            let wr = d(wv)
            guard let gr = dd.results[key] else {
                check(false, "\(label): 結果に \(key) が無い")
                return
            }
            eq(s(wr["outcome"]), gr.outcome.rawValue, "\(label) の結果 \(key) の結末")
            eq(i(wr["depth"]), gr.depth, "\(label) の結果 \(key) の深度")
            eq(i(wr["gold"]), gr.gold, "\(label) の結果 \(key) の金")
            eq(a(wr["loot"]).map { s($0) }, gr.loot.map(\.id), "\(label) の結果 \(key) の戦利品")
        }

        // 畑
        let wg = d(want["garden"])
        eq(i(wg["plots"]), dd.garden.plots, "\(label) の畑の枠数")
        let wantBeds = a(wg["beds"])
        eq(wantBeds.count, dd.garden.beds.count, "\(label) の畑の配列長")
        if derailed { return }
        for (k, wb) in wantBeds.enumerated() where k < dd.garden.beds.count {
            if let wbed = optD(wb) {
                guard let gbed = dd.garden.beds[k] else {
                    check(false, "\(label): 畑[\(k)] は植わっているはずなのに空き")
                    return
                }
                eq(s(wbed["herbId"]), gbed.herbId, "\(label) の畑[\(k)] の薬草")
                eq(f(wbed["plantedAt"]), gbed.plantedAt, "\(label) の畑[\(k)] の植えた時刻")
            } else {
                check(dd.garden.beds[k] == nil, "\(label): 畑[\(k)] は空きのはずなのに植わっている")
            }
        }
        for (key, wv) in pairs(wg["seeds"]) {
            eq(i(wv), dd.garden.seeds[key] ?? 0, "\(label) の種 \(key)")
        }
        for (key, wv) in pairs(wg["herbs"]) {
            eq(i(wv), dd.garden.herbs[key] ?? 0, "\(label) の収穫物 \(key)")
        }
        for (key, wv) in pairs(wg["potions"]) {
            eq(i(wv), dd.garden.potions[key] ?? 0, "\(label) の薬 \(key)")
        }
    }

    // MARK: - 移植それ自体の性質

    func test保存して読み直すと同じ状態になる() {
        let store = MemorySaveStore()
        let st = GameState(seed: 1234, now: 1_000_000, store: store)
        st.data.gold = 777
        st.plant(0, "ironleaf")
        st.save()

        // 同じ置き場所から作り直す＝アプリを閉じて開いたのと同じ
        let again = GameState(seed: 9999, now: 1_000_000, store: store)
        XCTAssertEqual(again.data.gold, 777, "金が保存されていない")
        XCTAssertEqual(again.data.seed, 1234, "種が保存されていない（引数の種で上書きされた）")
        XCTAssertEqual(again.data.garden.beds[0]?.herbId, "ironleaf", "畑が保存されていない")
        XCTAssertEqual(again.data, st.data, "読み直した状態が元と違う")
    }

    func test版が違うセーブは作り直す() {
        // 版が上がったのに古い形を読み込むと、途中まで読めてしまって
        // 「一部だけ古い」状態が生まれる。読めないなら作り直す。
        let bad = #"{"version": 1, "gold": 999}"#.data(using: .utf8)!
        let store = MemorySaveStore(bad)
        let st = GameState(seed: 42, now: 500, store: store)
        XCTAssertEqual(st.data.gold, 0, "版違いのセーブを拾ってしまっている")
        XCTAssertEqual(st.data.version, SAVE_VERSION)
    }

    func test壊れたセーブでも起動する() {
        let store = MemorySaveStore("{ これは JSON ではない".data(using: .utf8)!)
        let st = GameState(seed: 7, now: 100, store: store)
        XCTAssertEqual(st.data.seed, 7, "壊れたセーブから復帰できていない")
        XCTAssertEqual(st.data.inventory.count, 2, "初期装備が配られていない")
    }

    func test時刻が巻き戻っても進まない() {
        let store = MemorySaveStore()
        let st = GameState(seed: 5, now: 10_000, store: store)
        st.tick(9_000)
        XCTAssertEqual(st.data.lastSeen, 10_000, "端末時計を戻すと進行が巻き戻る")
        st.tick(11_000)
        XCTAssertEqual(st.data.lastSeen, 11_000)
    }

    func test通知は初回の派遣でだけ許可を求める() {
        final class Counter: ReturnNotifier {
            var asked = 0
            var notified = 0
            func requestPermission() { asked += 1 }
            func notifyReturn(job: String, stage: String, outcome: String) { notified += 1 }
        }
        let n = Counter()
        let st = GameState(seed: 3, now: 0, store: MemorySaveStore(), notifier: n)
        st.dispatch(job: .swordsman, stage: 1, rule: .standard, now: 0)
        st.tick(60 * 60 * 1000)          // 帰還させる
        st.dispatch(job: .swordsman, stage: 1, rule: .standard, now: 60 * 60 * 1000)
        XCTAssertEqual(n.asked, 1, "許可を何度も求めている（起動のたびに聞かれると拒否される）")
        XCTAssertEqual(n.notified, 1, "帰還を知らせていない")
    }
}
