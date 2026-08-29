import XCTest
@testable import DelversCore

/// TypeScript 版の実測値と1つ残らず突き合わせる。
///
/// **この移植には「動かして確かめた」という後ろ盾が無い。** 書いた環境に Swift の
/// ツールチェーンが無く、一度もコンパイルしていない。代わりに、元実装から
/// 実測値を丸ごと吐き出して（`tools/golden.ts`）、それを正解表として持ち込んである。
///
/// 落ちたときは**どの種のどの項目か**まで言うこと。「結果が違う」だけでは、
/// 787 通りのどこがずれたのか分からず、探すのに一日かかる。
///
/// 落ちる順番にも意味がある。乱数 → 表 → 装備 → 派遣、の順に並べてあり、
/// 上が落ちているときに下を読んでも意味がない（全部が道連れで落ちる）。
final class GoldenTests: XCTestCase {

    // MARK: - 読み込み
    //
    // **`JSONSerialization` を使わない。**
    //
    // あれは `0.015739798778668046` を `NSDecimalNumber` として読み、
    // `.doubleValue` で 2ulp 落とす（bits `…04000000` → `…03fffffe`）。
    // 落ちるのは正解表のほうなので、**実装が正しいのにテストが落ちる**——
    // しかも「1ulp ずれている」という、いかにも移植をしくじったように見える
    // 落ち方をする。実際この罠に一度かかって、FP の contraction を疑った。
    //
    // `JSONDecoder`（と `Double(String)`）は正確に読む。数値を1つも落とさない
    // 経路で読み込む。

    indirect enum JSONValue: Decodable {
        case null
        case bool(Bool)
        case number(Double)
        case string(String)
        case array([JSONValue])
        case object([String: JSONValue])

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if c.decodeNil() { self = .null; return }
            // Bool を Double より先に試す。順番を逆にすると true/false が拾えない
            if let v = try? c.decode(Bool.self) { self = .bool(v); return }
            if let v = try? c.decode(Double.self) { self = .number(v); return }
            if let v = try? c.decode(String.self) { self = .string(v); return }
            if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
            if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "unknown JSON node")
        }
    }

    private static var golden: [String: JSONValue] = {
        guard let url = Bundle.module.url(forResource: "golden", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONDecoder().decode(JSONValue.self, from: data),
              case .object(let obj) = root
        else {
            fatalError("golden.json を読めない。Package.swift の resources を確認する")
        }
        return obj
    }()

    private func node(_ key: String) -> [JSONValue] { a(Self.golden[key]) }
    private func obj(_ key: String) -> [String: JSONValue] { d(Self.golden[key]) }

    // JSON の取り出し。テストなので、形が違えば落ちてよい。
    private func d(_ v: JSONValue?) -> [String: JSONValue] {
        guard case .object(let o)? = v else { fatalError("object を期待した: \(String(describing: v))") }
        return o
    }
    private func a(_ v: JSONValue?) -> [JSONValue] {
        guard case .array(let x)? = v else { fatalError("array を期待した: \(String(describing: v))") }
        return x
    }
    private func f(_ v: JSONValue?) -> Double {
        guard case .number(let n)? = v else { fatalError("number を期待した: \(String(describing: v))") }
        return n
    }
    private func i(_ v: JSONValue?) -> Int { Int(f(v)) }
    private func s(_ v: JSONValue?) -> String {
        guard case .string(let x)? = v else { fatalError("string を期待した: \(String(describing: v))") }
        return x
    }
    private func b(_ v: JSONValue?) -> Bool {
        guard case .bool(let x)? = v else { fatalError("bool を期待した: \(String(describing: v))") }
        return x
    }
    /// null かもしれない文字列（unique / weakTo / affix の element）
    private func optS(_ v: JSONValue?) -> String? {
        if case .string(let x)? = v { return x }
        return nil
    }
    /// null かもしれないオブジェクト（potion）
    private func optD(_ v: JSONValue?) -> [String: JSONValue]? {
        if case .object(let o)? = v { return o }
        return nil
    }

    // MARK: - 1. 乱数
    //
    // ここが落ちていたら、以降は全部道連れで落ちる。まずこれだけ直す。
    // 落ちる原因はほぼ1つ——JS の `x >> 17` は**符号付き**右シフトで、
    // 教科書どおりの xorshift32（論理シフト）を書くと種によって数列が別物になる。

    func test1_Prng生の数列が一致する() {
        for v in node("prng") {
            let vec = d(v)
            let seed = UInt32(f(vec["seed"]))
            var rng = Prng(seed: seed)
            for (k, want) in a(vec["next"]).enumerated() {
                let got = rng.next()
                XCTAssertEqual(UInt32(f(want)), got,
                    "seed \(seed) の \(k) 個目。JS の `x >> 17` が符号拡張することを写せているか")
                if UInt32(f(want)) != got { return }   // 1つずれたら以降は無意味
            }
        }
    }

    func test1_Prng派生の値が一致する() {
        for v in node("prng") {
            let vec = d(v)
            let seed = UInt32(f(vec["seed"]))

            var r2 = Prng(seed: seed)
            for (k, want) in a(vec["floats"]).enumerated() {
                XCTAssertEqual(f(want), r2.float(), "seed \(seed) float[\(k)]")
            }
            var r3 = Prng(seed: seed)
            for (k, want) in zip([1, 2, 3, 4, 5, 7, 10, 16, 100], a(vec["ints"])) {
                XCTAssertEqual(i(want), r3.int(k), "seed \(seed) int(\(k))")
            }
            var r4 = Prng(seed: seed)
            let ranges: [(Int, Int)] = [(0, 0), (0, 1), (3, 5), (-2, 2), (1, 100)]
            for (pair, want) in zip(ranges, a(vec["ranges"])) {
                XCTAssertEqual(i(want), r4.range(pair.0, pair.1),
                    "seed \(seed) range(\(pair.0),\(pair.1))")
            }
        }
    }

    // MARK: - 2. 表と関数

    func test2_難易度倍率が一致する() {
        for v in a(obj("tables")["difficultyMul"]) {
            let row = d(v)
            // ここが 1ulp でもずれると敵の攻撃力に乗り、`hp <= 0` の判定を
            // 一度ひっくり返すだけで以降の乱数の使われ方が全部ずれる。
            // pow ではなく繰り返し乗算にしてある理由がこれ。
            XCTAssertEqual(f(row["value"]), difficultyMul(i(row["tier"])),
                "difficultyMul(tier \(i(row["tier"])))。pow を使っていないか確認する")
        }
    }

    func test2_itemPowerが一致する() {
        for v in a(obj("tables")["itemPowerFor"]) {
            let row = d(v)
            XCTAssertEqual(i(row["value"]),
                itemPowerFor(stageId: i(row["stageId"]), tier: i(row["tier"])),
                "itemPowerFor(stage \(i(row["stageId"])), tier \(i(row["tier"])))")
        }
    }

    func test2_ボス名と敵の出現帯が一致する() {
        for v in a(obj("tables")["bossName"]) {
            let row = d(v)
            XCTAssertEqual(s(row["name"]), bossName(i(row["stageId"])),
                "bossName(\(i(row["stageId"])))")
        }
        for v in a(obj("tables")["enemiesForStage"]) {
            let row = d(v)
            let want = a(row["names"]).map { s($0) }
            let got = enemiesForStage(i(row["stageId"])).map { $0.name }
            XCTAssertEqual(want, got, "enemiesForStage(\(i(row["stageId"])))")
        }
    }

    func test2_アフィックス池とユニーク池が一致する() {
        // **並び順まで見る。** `rng.int(remaining.count)` が指す先が変わるので、
        // 中身が同じでも順番が違えば別の効果が付く
        for v in a(obj("tables")["affixPoolFor"]) {
            let row = d(v)
            let base = baseDef(s(row["baseId"]))
            let want = a(row["kinds"]).map { s($0) }
            let got = affixPoolFor(slot: base.slot, baseTags: base.tags).map { $0.kind.rawValue }
            XCTAssertEqual(want, got, "affixPoolFor(\(base.id)) は並び順まで一致すること")
        }
        for v in a(obj("tables")["uniquesForSlot"]) {
            let row = d(v)
            let slot = Slot(rawValue: s(row["slot"]))!
            let want = a(row["kinds"]).map { s($0) }
            let got = uniquesForSlot(slot).map { $0.kind.rawValue }
            XCTAssertEqual(want, got, "uniquesForSlot(\(slot.rawValue))")
        }
    }

    func test2_ティアと畑の費用が一致する() {
        for v in a(obj("tables")["tierOf"]) {
            let row = d(v)
            XCTAssertEqual(i(row["tier"]),
                tierOf(f(row["value"]), f(row["min"]), f(row["max"])),
                "tierOf(\(f(row["value"])), \(f(row["min"])), \(f(row["max"])))")
        }
        for v in a(obj("tables")["plotCost"]) {
            let row = d(v)
            XCTAssertEqual(i(row["cost"]), plotCost(i(row["nth"])), "plotCost(\(i(row["nth"])))")
        }
        let consts = d(obj("tables")["constants"])
        XCTAssertEqual(i(consts["POWER_CAP"]), POWER_CAP)
        XCTAssertEqual(f(consts["OFFLINE_CAP_SEC"]), OFFLINE_CAP_SEC)
    }

    func testデータ表が一致する() {
        let data = obj("data")
        let stages = a(data["stages"])
        XCTAssertEqual(stages.count, STAGES.count, "ステージ数")
        for (k, v) in stages.enumerated() {
            let row = d(v)
            let got = STAGES[k]
            // 一度ここを手で写して、7〜9 の名前・弱点・耐性・レア補正を丸ごと
            // 取り違えた。表は生成する（tools/gen-swift-tables.ts）。
            XCTAssertEqual(s(row["name"]), got.name, "stage[\(k)] の名前")
            XCTAssertEqual(i(row["encounters"]), got.encounters, "stage \(got.id) の遭遇数")
            XCTAssertEqual(f(row["rarityBonus"]), got.rarityBonus, "stage \(got.id) のレア補正")
            XCTAssertEqual(i(row["unlockCost"]), got.unlockCost, "stage \(got.id) の解放費用")
            let wantResists = a(row["resists"]).map { s($0) }
            XCTAssertEqual(wantResists, got.resists.map { $0.rawValue }, "stage \(got.id) の耐性")
            let wantWeak = optS(row["weakTo"])
            XCTAssertEqual(wantWeak, got.weakTo?.rawValue, "stage \(got.id) の弱点")
        }

        let bases = a(data["bases"])
        XCTAssertEqual(bases.count, BASE_TYPES.count, "ベース数")
        for (k, v) in bases.enumerated() {
            let row = d(v)
            XCTAssertEqual(s(row["id"]), BASE_TYPES[k].id, "base[\(k)] の並び")
            XCTAssertEqual(f(row["mul"]), BASE_TYPES[k].mul, "base \(BASE_TYPES[k].id) の倍率")
            XCTAssertEqual(f(row["speed"]), BASE_TYPES[k].speed, "base \(BASE_TYPES[k].id) の速度")
        }

        let jobs = a(data["jobs"])
        for (k, v) in jobs.enumerated() {
            let row = d(v)
            XCTAssertEqual(f(row["hp"]), JOBS[k].hp, "job \(JOBS[k].id.rawValue) の HP")
            XCTAssertEqual(f(row["evasion"]), JOBS[k].evasion, "job \(JOBS[k].id.rawValue) の回避")
        }
    }

    // MARK: - 3. 装備生成
    //
    // 乱数を**引く順番**が仕様。順番が1つずれると品がまるごと変わる。

    /// 生成された品を1件ずつ突き合わせる。
    private func assertItem(_ want: [String: JSONValue], _ got: Item, _ where_: String) {
        XCTAssertEqual(s(want["id"]), got.id, "\(where_) の id")
        XCTAssertEqual(s(want["baseId"]), got.baseId, "\(where_) のベース")
        XCTAssertEqual(s(want["rarity"]), got.rarity.rawValue, "\(where_) のレアリティ")
        XCTAssertEqual(i(want["power"]), got.power, "\(where_) の攻撃/防御")
        XCTAssertEqual(f(want["speed"]), got.speed, "\(where_) の速度")
        XCTAssertEqual(f(want["crit"]), got.crit, "\(where_) の会心")
        XCTAssertEqual(i(want["fromStage"]), got.fromStage, "\(where_) の出所")
        XCTAssertEqual(i(want["sellValue"]), sellValue(got), "\(where_) の売値")

        let wantUnique = optS(want["unique"])
        XCTAssertEqual(wantUnique, got.unique?.rawValue, "\(where_) のユニーク")

        // 属性配分は**入った順**まで見る。順が変わると主属性（＝サムネの色・
        // 台座の光・相性計算）が同率のときに入れ替わる
        let wantSplit = a(want["element"]).map { pair -> (String, Double) in
            let p = a(pair)
            return (s(p[0]), f(p[1]))
        }
        XCTAssertEqual(wantSplit.count, got.element.shares.count, "\(where_) の属性配分の数")
        for (k, ws) in wantSplit.enumerated() where k < got.element.shares.count {
            XCTAssertEqual(ws.0, got.element.shares[k].element.rawValue, "\(where_) の属性[\(k)]（並び順）")
            XCTAssertEqual(ws.1, got.element.shares[k].value, "\(where_) の属性[\(k)] の比率")
        }

        let wantAffixes = a(want["affixes"]).map { d($0) }
        XCTAssertEqual(wantAffixes.count, got.affixes.count, "\(where_) のアフィックス数")
        for (k, wa) in wantAffixes.enumerated() where k < got.affixes.count {
            let ga = got.affixes[k]
            XCTAssertEqual(s(wa["kind"]), ga.kind.rawValue, "\(where_) のアフィックス[\(k)] の種類")
            XCTAssertEqual(f(wa["value"]), ga.value, "\(where_) のアフィックス[\(k)] の値")
            XCTAssertEqual(i(wa["tier"]), ga.tier, "\(where_) のアフィックス[\(k)] のティア")
            XCTAssertEqual(optS(wa["element"]), ga.element?.rawValue,
                           "\(where_) のアフィックス[\(k)] の属性")
        }
    }

    func test3_装備生成が一致する() {
        for v in node("items") {
            let vec = d(v)
            let seed = UInt32(f(vec["seed"]))
            let slot = Slot(rawValue: s(vec["slot"]))!
            let stageId = i(vec["stageId"])
            let stage = stageDef(stageId)
            var rng = Prng(seed: seed)
            let items = a(vec["items"]).map { d($0) }

            for k in 0..<5 {
                let got = generateItem(&rng, GenerateOptions(
                    itemPower: itemPowerFor(stageId: stageId, tier: 1),
                    slot: slot, stageId: stageId, rarityBonus: stage.rarityBonus,
                    id: "\(base36(seed))-\(k)"
                ))
                assertItem(items[k], got, "seed \(seed)/\(slot.rawValue)/stage \(stageId) の \(k) 個目")
            }
            // 救済枠と同じ道。forceRarity のときは**抽選を引かない**ので、
            // ここで無条件に引く実装だと以降の乱数が1つぶんずれる
            let forced = generateItem(&rng, GenerateOptions(
                itemPower: itemPowerFor(stageId: stageId, tier: 1),
                slot: slot, stageId: stageId, rarityBonus: stage.rarityBonus,
                id: "\(base36(seed))-forced", forceRarity: .rare
            ))
            assertItem(items[5], forced, "seed \(seed)/\(slot.rawValue)/stage \(stageId) の救済枠")

            // 引いた**回数**まで合っているか。品が偶然一致しても、
            // 引いた数が違えば次の派遣からずれる
            XCTAssertEqual(UInt32(f(vec["stateAfter"])), rng.next(),
                "seed \(seed)/\(slot.rawValue)/stage \(stageId): 乱数を引いた回数が違う")
        }
    }

    // MARK: - 4. 派遣（通し）

    func test4_派遣の結果が一致する() {
        for v in node("runs") {
            let vec = d(v)
            let input = d(vec["input"])
            let seed = UInt32(f(input["seed"]))
            let stageId = i(input["stageId"])
            let stage = stageDef(stageId)
            let label = "seed \(seed) / \(s(input["job"])) / \(s(input["rule"])) / stage \(stageId)"

            // 装備は同じ種から作り直す。ここがずれていたら派遣もずれるので、
            // まず装備を突き合わせてから結果を見る
            var wrng = Prng(seed: seed ^ 0x11)
            let weapon = generateItem(&wrng, GenerateOptions(
                itemPower: itemPowerFor(stageId: stageId, tier: 1), slot: .weapon,
                stageId: stageId, rarityBonus: stage.rarityBonus,
                id: "fix-\(seed ^ 0x11)-weapon"
            ))
            var arng = Prng(seed: seed ^ 0x22)
            let armor = generateItem(&arng, GenerateOptions(
                itemPower: itemPowerFor(stageId: stageId, tier: 1), slot: .armor,
                stageId: stageId, rarityBonus: stage.rarityBonus,
                id: "fix-\(seed ^ 0x22)-armor"
            ))
            assertItem(d(vec["weapon"]), weapon, "\(label) の武器")
            assertItem(d(vec["armor"]), armor, "\(label) の防具")

            var potion: PotionEffect?
            if let p = optD(input["potion"]) {
                potion = PotionEffect(
                    element: Element(rawValue: s(p["element"]))!,
                    resist: f(p["resist"]), name: s(p["name"])
                )
            }

            let got = simulateRun(SimulateInput(
                seed: seed,
                job: jobDef(JobId(rawValue: s(input["job"]))!),
                weapon: weapon, armor: armor,
                rule: retreatRuleDef(RetreatRule(rawValue: s(input["rule"]))!),
                stage: stage, tier: i(input["tier"]), potion: potion
            ))
            let want = d(vec["result"])

            XCTAssertEqual(s(want["outcome"]), got.outcome.rawValue, "\(label) の結末")
            XCTAssertEqual(i(want["depth"]), got.depth, "\(label) の到達深度")
            XCTAssertEqual(b(want["bossDefeated"]), got.bossDefeated, "\(label) のボス撃破")
            XCTAssertEqual(i(want["gold"]), got.gold, "\(label) の金")
            XCTAssertEqual(i(want["durationSec"]), got.durationSec, "\(label) の所要時間")
            XCTAssertEqual(s(want["headline"]), got.headline, "\(label) の見出し")
            XCTAssertEqual(a(want["highlights"]).map { s($0) }, got.highlights,
                           "\(label) の見どころ（文言まで一致すること）")

            // HP 推移は 1 つずれた時点で「どこで別の道に入ったか」が分かる
            let wantCurve = a(want["hpCurve"]).map { f($0) }
            XCTAssertEqual(wantCurve.count, got.hpCurve.count, "\(label) の HP 推移の長さ")
            for (k, wc) in wantCurve.enumerated() where k < got.hpCurve.count {
                XCTAssertEqual(wc, got.hpCurve[k], accuracy: 0,
                    "\(label) の HP 推移[\(k)]：ここで別の道に入っている")
            }

            let ws = d(want["stats"])
            XCTAssertEqual(i(ws["dealt"]), got.stats.dealt, "\(label) の与ダメ")
            XCTAssertEqual(i(ws["taken"]), got.stats.taken, "\(label) の被ダメ")
            XCTAssertEqual(i(ws["kills"]), got.stats.kills, "\(label) の撃破数")
            XCTAssertEqual(i(ws["hits"]), got.stats.hits, "\(label) の命中数")
            XCTAssertEqual(i(ws["crits"]), got.stats.crits, "\(label) の会心数")
            XCTAssertEqual(i(ws["biggestHit"]), got.stats.biggestHit, "\(label) の最大の一撃")
            XCTAssertEqual(i(ws["evaded"]), got.stats.evaded, "\(label) の回避数")
            XCTAssertEqual(i(ws["potionSaved"]), got.stats.potionSaved, "\(label) の薬の肩代わり")

            let wantLoot = a(want["loot"]).map { d($0) }
            XCTAssertEqual(wantLoot.count, got.loot.count, "\(label) の戦利品の数")
            for (k, wl) in wantLoot.enumerated() where k < got.loot.count {
                assertItem(wl, got.loot[k], "\(label) の戦利品[\(k)]")
            }
        }
    }

    // MARK: - 5. オフライン進行

    func test5_オフライン進行が一致する() {
        for v in node("offline") {
            let row = d(v)
            let dispatch = Dispatch(
                id: "d", jobId: .swordsman, stageId: 1, weaponId: "w", armorId: "a",
                retreatRule: .standard, seed: 1,
                startedAt: f(row["startedAt"]), durationSec: i(row["durationSec"])
            )
            let p = dispatchProgress(dispatch, ClockState(lastSeen: f(row["lastSeen"])))
            let label = "startedAt \(f(row["startedAt"])) / \(i(row["durationSec"]))秒 / 観測 \(f(row["lastSeen"]))"
            XCTAssertEqual(f(row["elapsedSec"]), p.elapsedSec, "\(label) の経過")
            XCTAssertEqual(f(row["remainingSec"]), p.remainingSec, "\(label) の残り")
            XCTAssertEqual(b(row["completed"]), p.completed, "\(label) の完了判定")
            XCTAssertEqual(f(row["ratio"]), p.ratio, "\(label) の進捗率")
        }
        for v in node("clock") {
            let row = d(v)
            let got = advanceClock(ClockState(lastSeen: f(row["lastSeen"])), now: f(row["now"]))
            XCTAssertEqual(f(row["next"]), got.lastSeen,
                "巻き戻し検知：lastSeen \(f(row["lastSeen"])) に now \(f(row["now"]))")
        }
    }

    // MARK: - 6. 移植それ自体の性質
    //
    // ゴールデンベクタは「TS と同じか」しか見ない。
    // 同じ種なら同じ結果、という性質そのものは Swift 側でも直接確かめる。

    func test6_同じ種なら何度回しても同じ結果() {
        let stage = stageDef(5)
        var rng = Prng(seed: 4242)
        let weapon = generateItem(&rng, GenerateOptions(
            itemPower: 200, slot: .weapon, stageId: 5, rarityBonus: stage.rarityBonus, id: "w"))
        let armor = generateItem(&rng, GenerateOptions(
            itemPower: 200, slot: .armor, stageId: 5, rarityBonus: stage.rarityBonus, id: "a"))
        let make = { () -> RunResult in
            simulateRun(SimulateInput(
                seed: 99, job: jobDef(.swordsman), weapon: weapon, armor: armor,
                rule: retreatRuleDef(.standard), stage: stage, tier: 1))
        }
        let a1 = make(), a2 = make()
        XCTAssertEqual(a1.depth, a2.depth, "同じ種で深度が変わる")
        XCTAssertEqual(a1.gold, a2.gold, "同じ種で金が変わる")
        XCTAssertEqual(a1.headline, a2.headline, "同じ種で見出しが変わる")
        XCTAssertEqual(a1.loot.map(\.id), a2.loot.map(\.id), "同じ種で戦利品が変わる")
        XCTAssertEqual(a1.highlights, a2.highlights, "同じ種で見どころが変わる")
    }

    func test6_同率配分の主属性がぶれない() {
        // 0.5/0.5 の武器で `dominantElement` が実行ごとに変わると、
        // サムネの色も台座の光も揺れる。辞書ではなく順序付きで持っている理由。
        var split = ElementSplit()
        split.set(.physical, 0.5)
        split.set(.fire, 0.5)
        for _ in 0..<200 {
            XCTAssertEqual(dominantElement(split), .physical,
                "同率なら先に入れたほう（物理）が主属性であること")
        }
    }

    func test6_JSと同じ丸め方をしている() {
        // Swift の rounded() は .5 を絶対値の大きいほうへ送るが、
        // JS の Math.round は常に +∞ 方向。負の .5 で 1 ずれる。
        XCTAssertEqual(jsRound(0.5), 1)
        XCTAssertEqual(jsRound(1.5), 2)
        XCTAssertEqual(jsRound(-0.5), 0)
        XCTAssertEqual(jsRound(-1.5), -1)
        XCTAssertEqual(jsRound(2.4999999999), 2)
    }
}
