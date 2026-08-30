import Foundation

// 拠点の状態とセーブ（`src/game/state.ts` の写し）。サーバなし、ローカル永続化のみ。
//
// **時刻を自分で取りに行かない。** `now` は必ず引数で受ける。
// ここで `Date()` を呼んだ瞬間、「8時間放置したら何が起きるか」を確かめる方法が
// 実際に8時間待つことしかなくなる。
//
// 置き場所（`SaveStore`）と通知（`ReturnNotifier`）は外から差す。
// この層は「どこに保存するか」も「どう知らせるか」も知らない。

public let SAVE_VERSION = 3

public struct CompendiumEntry: Codable, Equatable, Sendable {
    /// 初めて入手したステージ（§7.4）
    public var firstStage: Int
    public var count: Int
}

public struct EquipSet: Codable, Equatable, Sendable {
    public var weapon: String?
    public var armor: String?
    public init(weapon: String? = nil, armor: String? = nil) {
        self.weapon = weapon
        self.armor = armor
    }
}

/// 畑1枠。nil なら空き
public struct Plot: Codable, Equatable, Sendable {
    public var herbId: String
    /// 植えた時刻（ミリ秒）
    public var plantedAt: Double
}

public struct GardenData: Codable, Equatable, Sendable {
    /// 金を払って開けた畑の数
    public var plots: Int
    /// 各枠の中身。長さは plots に合わせる
    public var beds: [Plot?]
    /// herbId -> 手持ちの種の数
    public var seeds: [String: Int]
    /// herbId -> 手持ちの収穫物の数
    public var herbs: [String: Int]
    /// potionId -> 手持ちの薬の数
    public var potions: [String: Int]

    public static func makeDefault() -> GardenData {
        GardenData(
            plots: PLOTS_INITIAL,
            beds: Array(repeating: nil, count: PLOTS_INITIAL),
            // 最初の種は配る。畑があるのに植えるものが無いと、
            // 開幕で「何もできない画面」を見せることになる
            seeds: ["ironleaf": 2, "embermoss": 1],
            herbs: [:],
            potions: [:]
        )
    }
}

public struct SaveData: Codable, Equatable, Sendable {
    public var version: Int
    public var seed: UInt32
    public var gold: Int
    /// 難易度ティア。ステージ10クリアで+1（§7.1）
    public var tier: Int
    public var clearedStages: [Int]
    public var unlockedStages: [Int]
    /// 金を払って解放済みの派遣枠数（§7.5）。初期は1
    public var unlockedSlots: Int
    public var inventory: [Item]
    /// 帰還済み・未開封の戦利品
    public var pending: [Item]
    /// JobId.rawValue -> 装備。**文字列で持つ**——列挙型を辞書の鍵にすると
    /// Codable が配列に落として、セーブが読みにくくなる
    public var equipped: [String: EquipSet]
    public var dispatches: [Dispatch]
    /// dispatchId -> 派遣時に確定した結果
    public var results: [String: RunResult]
    /// dispatchId -> 派遣の内容。完了後もレポート表示のために残す
    public var history: [String: Dispatch]
    /// 帰還済みで未確認のレポート
    public var inbox: [String]
    /// dispatchId -> 戦死で失った装備2点
    public var lost: [String: [Item]]
    /// 図鑑。キーは `baseId|rarity` と `unique:kind`
    public var compendium: [String: CompendiumEntry]
    public var garden: GardenData
    public var lastSeen: Double
    public var nextId: Int

    public static func makeDefault(seed: UInt32, now: Double) -> SaveData {
        var s = SaveData(
            version: SAVE_VERSION,
            seed: seed,
            gold: 0,
            tier: 1,
            clearedStages: [],
            unlockedStages: [1],
            unlockedSlots: 1,
            inventory: [],
            pending: [],
            equipped: [
                JobId.swordsman.rawValue: EquipSet(),
                JobId.guardian.rawValue: EquipSet(),
                JobId.skirmisher.rawValue: EquipSet()
            ],
            dispatches: [],
            results: [:],
            history: [:],
            inbox: [],
            lost: [:],
            compendium: [:],
            garden: .makeDefault(),
            lastSeen: now,
            nextId: 1
        )
        // 初期装備（§4.4 の最低性能を1組だけ渡して始める）
        let w = starterItem(slot: .weapon, id: "start-w")
        let a = starterItem(slot: .armor, id: "start-a")
        s.inventory.append(contentsOf: [w, a])
        s.equipped[JobId.swordsman.rawValue] = EquipSet(weapon: w.id, armor: a.id)
        return s
    }
}

public final class GameState {
    /// **書き換え可能にしてある。** web 版と同じで、画面側が直接触る場所がある
    /// （ロックの切り替えなど）。触ったら `save()` を呼ぶのは呼び出し側の責任。
    public var data: SaveData
    private let store: SaveStore
    private let notifier: ReturnNotifier
    /// 通知の許可を求めたか。**初めて派遣を出した瞬間**にだけ求める
    private var askedPermission = false

    public init(
        seed: UInt32,
        now: Double,
        store: SaveStore = FileSaveStore(),
        notifier: ReturnNotifier = SilentNotifier()
    ) {
        self.store = store
        self.notifier = notifier
        self.data = GameState.loadSave(from: store) ?? SaveData.makeDefault(seed: seed, now: now)
        self.data.lastSeen = Swift.max(self.data.lastSeen, 0)
        tick(now)
    }

    // MARK: - 時刻

    private var clock: ClockState { ClockState(lastSeen: data.lastSeen) }

    /// 時刻を進め、完了した派遣を回収する。巻き戻しは進行ゼロ（§7.2）。
    public func tick(_ now: Double) {
        let next = advanceClock(clock, now: now)
        data.lastSeen = next.lastSeen

        var stillRunning: [Dispatch] = []
        for d in data.dispatches {
            let p = dispatchProgress(d, next)
            if p.completed { collect(d) } else { stillRunning.append(d) }
        }
        if stillRunning.count != data.dispatches.count {
            data.dispatches = stillRunning
            save()
        }
    }

    /// 派遣の進捗（0〜1）と残り秒。
    public func progressOf(_ d: Dispatch) -> (ratio: Double, remainingSec: Double) {
        let p = dispatchProgress(d, clock)
        return (p.ratio, p.remainingSec)
    }

    // MARK: - 派遣

    public func isBusy(_ jobId: JobId) -> Bool {
        data.dispatches.contains { $0.jobId == jobId }
    }

    /// 解放済みの派遣枠数。金を払った分だけ増える（§7.5）。
    public func slotCount() -> Int {
        Swift.max(1, Swift.min(UNLOCK_STAGE_FOR_SLOT.count, data.unlockedSlots))
    }

    public struct SlotOffer: Equatable, Sendable {
        public var index: Int
        public var needStage: Int
        public var cost: Int
        public var stageDone: Bool
        public var affordable: Bool
    }

    /// 次の派遣枠の解放条件（§7.5「ステージクリアと併用」）。
    /// 踏破しただけでは増えず、そこから金を払って初めて増える。全枠解放済みなら nil。
    public func nextSlot() -> SlotOffer? {
        let i = slotCount()
        if i >= UNLOCK_STAGE_FOR_SLOT.count { return nil }
        let needStage = UNLOCK_STAGE_FOR_SLOT[i]
        let cost = i < SLOT_COST.count ? SLOT_COST[i] : 0
        let stageDone = data.clearedStages.contains(needStage)
        return SlotOffer(index: i, needStage: needStage, cost: cost,
                         stageDone: stageDone, affordable: data.gold >= cost)
    }

    @discardableResult
    public func unlockSlot() -> Bool {
        guard let n = nextSlot(), n.stageDone, n.affordable else { return false }
        data.gold -= n.cost
        data.unlockedSlots += 1
        save()
        return true
    }

    public func availableJobs() -> [JobId] {
        let order: [JobId] = [.swordsman, .guardian, .skirmisher]
        return Array(order.prefix(slotCount()))
    }

    /// 完了済みも含めて派遣の内容を引く（レポート表示用）。
    public func dispatchInfo(_ id: String) -> Dispatch? {
        data.history[id] ?? data.dispatches.first { $0.id == id }
    }

    public func itemById(_ id: String?) -> Item? {
        guard let id else { return nil }
        return data.inventory.first { $0.id == id }
    }

    public func equipped(_ jobId: JobId) -> EquipSet {
        data.equipped[jobId.rawValue] ?? EquipSet()
    }

    public func setEquipped(_ jobId: JobId, _ eq: EquipSet) {
        data.equipped[jobId.rawValue] = eq
        save()
    }

    /// 派遣する。結果はこの時点で確定させ、実時間は「見せるタイミング」だけを決める。
    /// これによりオフライン計算が分割しても一括しても一致する。
    @discardableResult
    public func dispatch(
        job jobId: JobId, stage stageId: Int, rule: RetreatRule,
        now: Double, potionId: String? = nil
    ) -> Bool {
        if isBusy(jobId) { return false }
        let eq = equipped(jobId)
        guard let weapon = itemById(eq.weapon), let armor = itemById(eq.armor) else { return false }
        // 薬は**出発の瞬間に消費する**。持たせたのに手元にも残っていると、
        // 同じ1本を何人にも持たせられてしまう
        let usable: String? = {
            guard let pid = potionId, (data.garden.potions[pid] ?? 0) > 0 else { return nil }
            return pid
        }()

        // 通知の許可は、初めて派遣を出したこの瞬間にだけ求める（§7.2）
        if !askedPermission {
            askedPermission = true
            notifier.requestPermission()
        }

        let job = jobDef(jobId)
        let stage = stageDef(stageId)
        // JS: (seed ^ (nextId * 0x9e3779b1)) >>> 0
        // 積は 2^53 未満なので JS 側でも誤差は出ない。32bit に切って XOR する
        let mixed = UInt32(truncatingIfNeeded: UInt64(data.nextId) &* 0x9e37_79b1)
        let seed = data.seed ^ mixed
        let p = usable.map { potionDef($0) }
        var result = simulateRun(SimulateInput(
            seed: seed, job: job, weapon: weapon, armor: armor,
            rule: retreatRuleDef(rule), stage: stage, tier: data.tier,
            potion: p.map { PotionEffect(element: $0.element, resist: $0.resist, name: $0.name) }
        ))
        if let u = usable {
            data.garden.potions[u] = (data.garden.potions[u] ?? 0) - 1
        }

        let id = "d\(data.nextId)"
        data.nextId += 1
        // 戦利品のIDを一意にし直す（生成側は run 内での連番しか知らない）
        result.loot = result.loot.map { it in
            var copy = it
            copy.id = "\(id)-\(it.id)"
            return copy
        }
        data.results[id] = result
        let record = Dispatch(
            id: id, jobId: jobId, stageId: stageId,
            weaponId: weapon.id, armorId: armor.id,
            retreatRule: rule, seed: seed,
            startedAt: now,
            // オフライン進行は8時間で頭打ち（§7.2）。深淵(480分)を重装兵(+15%)で
            // 踏破すると 33,120秒となり、上限28,800秒を超えて「永久に完了しない派遣」に
            // なる。仕様の3つの数値は同時には満たせないので、
            // 「派遣は必ず上限内に終わる」を優先してクランプする。
            durationSec: Swift.min(result.durationSec, Int(OFFLINE_CAP_SEC)),
            potionId: usable
        )
        data.dispatches.append(record)
        data.history[id] = record

        // **帰りの通知は、出発したこの瞬間に予約する。**
        // 帰還の処理はアプリが動いている時にしか走らないので、
        // そちらで鳴らすと「閉じている間は鳴らない通知」になる。
        notifier.scheduleReturn(
            id: id,
            job: job.name,
            stage: stageDef(stageId).name,
            afterSeconds: Double(record.durationSec)
        )

        save()
        return true
    }

    /// 完了した派遣を回収する。
    private func collect(_ d: Dispatch) {
        guard let result = data.results[d.id] else { return }

        if result.outcome == .death {
            // 死亡：戦利品は全ロスト、装備2点が消滅（冒険者本人は無事に帰る）。
            // 何を失ったのかはレポートで見せるので、消す前に控えておく——
            // 「気づいたら手持ちから消えていた」では喪失が伝わらない。
            data.lost[d.id] = data.inventory.filter { $0.id == d.weaponId || $0.id == d.armorId }
            data.inventory.removeAll { $0.id == d.weaponId || $0.id == d.armorId }
            var eq = equipped(d.jobId)
            if eq.weapon == d.weaponId { eq.weapon = nil }
            if eq.armor == d.armorId { eq.armor = nil }
            data.equipped[d.jobId.rawValue] = eq
            ensureStarterGear(d.jobId)
        } else {
            data.pending.append(contentsOf: result.loot)
            data.gold += result.gold
            if result.outcome == .clear {
                if !data.clearedStages.contains(d.stageId) {
                    data.clearedStages.append(d.stageId)
                }
                if d.stageId == 10 {
                    // 難易度+1。clearedStages を消すと slotCount() の根拠が消えて
                    // 冒険者がロスターから外れ、解放費用も払い直しになる——
                    // 踏破の報酬が罰に変わるので、消さずに全ステージを開放する。
                    data.tier += 1
                    data.unlockedStages = STAGES.map(\.id)
                }
            }
        }
        // 潜った先の属性の種を持ち帰る（薬草園）。
        // **乱数は引かない。** 結果はすでに確定しているので、そこから決まる数にすれば
        // 何度読み直しても同じになる。
        let stage = stageDef(d.stageId)
        let elem: Element
        switch stage.enemyElement {
        case .mixed: elem = .physical
        case .single(let e): elem = e
        }
        let herb = herbForElement(elem)
        let got = 1 + result.depth / 4
        data.garden.seeds[herb.id] = (data.garden.seeds[herb.id] ?? 0) + got

        data.inbox.append(d.id)

        // **ここで鳴らさない。予約を消す。**
        // この関数はアプリが動いている `tick()` の中でしか走らないので、
        // ここで鳴らす実装は「アプリを開いている時だけ鳴る通知」になる。
        // 鳴らす予約は出発の瞬間に済ませてあり、ここまで来たということは
        // もう画面で見せられる＝あとから鳴らす理由が無い。
        notifier.cancelReturn(id: d.id)
    }

    /// 装備を失ったら最低性能の初期装備を無限に支給する（§4.4）。
    public func ensureStarterGear(_ jobId: JobId) {
        var eq = equipped(jobId)
        if eq.weapon == nil {
            let w = starterItem(slot: .weapon, id: "sw\(data.nextId)")
            data.nextId += 1
            data.inventory.append(w)
            eq.weapon = w.id
        }
        if eq.armor == nil {
            let a = starterItem(slot: .armor, id: "sa\(data.nextId)")
            data.nextId += 1
            data.inventory.append(a)
            eq.armor = a.id
        }
        data.equipped[jobId.rawValue] = eq
    }

    // MARK: - 開封

    /// 未鑑定品を全て開封してインベントリに入れる（§7.4 一括開封）。
    @discardableResult
    public func openAll() -> [Item] {
        var opened: [Item] = []
        for var it in data.pending {
            it.identified = true
            opened.append(it)
            let key = "\(it.baseId)|\(it.rarity.rawValue)"
            if var e = data.compendium[key] {
                e.count += 1
                data.compendium[key] = e
            } else {
                data.compendium[key] = CompendiumEntry(firstStage: it.fromStage, count: 1)
            }
            if let u = it.unique {
                let uk = "unique:\(u.rawValue)"
                if var ue = data.compendium[uk] {
                    ue.count += 1
                    data.compendium[uk] = ue
                } else {
                    data.compendium[uk] = CompendiumEntry(firstStage: it.fromStage, count: 1)
                }
            }
        }
        data.inventory.append(contentsOf: opened)
        data.pending = []
        save()
        return opened
    }

    // MARK: - 薬草園

    public struct PlotProgress: Equatable, Sendable {
        public var herb: HerbDef
        public var ratio: Double
        public var remainingSec: Double

        public static func == (a: PlotProgress, b: PlotProgress) -> Bool {
            a.herb.id == b.herb.id && a.ratio == b.ratio && a.remainingSec == b.remainingSec
        }
    }

    /// 畑1枠の育ち具合（0〜1）。
    ///
    /// **オフラインに上限を置かない。** 派遣は8時間で頭打ちにしているが、
    /// 畑は逆に「放っておいて構わない」ことが売りなので、寝ている間も育つ。腐りもしない。
    public func plotProgress(_ index: Int) -> PlotProgress? {
        guard index >= 0, index < data.garden.beds.count, let bed = data.garden.beds[index] else {
            return nil
        }
        let herb = herbDef(bed.herbId)
        let elapsed = Swift.max(0, (data.lastSeen - bed.plantedAt) / 1000)
        let ratio = Swift.max(0, Swift.min(1, elapsed / Double(herb.growSec)))
        return PlotProgress(herb: herb, ratio: ratio,
                            remainingSec: Swift.max(0, Double(herb.growSec) - elapsed))
    }

    /// 収穫できる枠の数。拠点のバッジに出す
    public func readyCount() -> Int {
        var n = 0
        for i in 0..<data.garden.beds.count where (plotProgress(i)?.ratio ?? 0) >= 1 { n += 1 }
        return n
    }

    @discardableResult
    public func plant(_ index: Int, _ herbId: String) -> Bool {
        if index < 0 || index >= data.garden.beds.count { return false }
        if data.garden.beds[index] != nil { return false }
        if (data.garden.seeds[herbId] ?? 0) <= 0 { return false }
        data.garden.seeds[herbId] = (data.garden.seeds[herbId] ?? 0) - 1
        data.garden.beds[index] = Plot(herbId: herbId, plantedAt: data.lastSeen)
        save()
        return true
    }

    /// 育ちきった枠を収穫する。育っていなければ何もしない（早取りはさせない）。
    @discardableResult
    public func harvest(_ index: Int) -> Int {
        guard let p = plotProgress(index), p.ratio >= 1 else { return 0 }
        data.garden.herbs[p.herb.id] = (data.garden.herbs[p.herb.id] ?? 0) + p.herb.yieldCount
        data.garden.beds[index] = nil
        save()
        return p.herb.yieldCount
    }

    @discardableResult
    public func harvestAll() -> Int {
        var n = 0
        for i in 0..<data.garden.beds.count { n += harvest(i) }
        return n
    }

    @discardableResult
    public func buySeed(_ herbId: String) -> Bool {
        let herb = herbDef(herbId)
        if data.gold < herb.seedCost { return false }
        data.gold -= herb.seedCost
        data.garden.seeds[herbId] = (data.garden.seeds[herbId] ?? 0) + 1
        save()
        return true
    }

    public func nextPlotCost() -> Int? {
        if data.garden.plots >= PLOTS_MAX { return nil }
        return plotCost(data.garden.plots)
    }

    @discardableResult
    public func expandGarden() -> Bool {
        guard let cost = nextPlotCost(), data.gold >= cost else { return false }
        data.gold -= cost
        data.garden.plots += 1
        data.garden.beds.append(nil)
        save()
        return true
    }

    /// その薬を今すぐ作れるか。主材料2つ＋別の薬草1つ。
    public func canBrew(_ potionId: String) -> Bool {
        let p = potionDef(potionId)
        if (data.garden.herbs[p.main] ?? 0) < 2 { return false }
        var others = 0
        for h in HERBS where h.id != p.main { others += data.garden.herbs[h.id] ?? 0 }
        return others >= p.other
    }

    /// 調合する。主材料以外は**数の多いものから減らす**。
    ///
    /// 少ないほうから使うと、あと1つで別の薬が作れた材料を潰してしまう。
    /// どれを使うか毎回選ばせるのは「決めるのは3つだけ」に反する。
    @discardableResult
    public func brew(_ potionId: String) -> Bool {
        if !canBrew(potionId) { return false }
        let p = potionDef(potionId)
        data.garden.herbs[p.main] = (data.garden.herbs[p.main] ?? 0) - 2
        var need = p.other
        // **同数のときの順を HERBS の並びに固定する。**
        // JS の sort は安定なので同数なら元の並びが残るが、Swift の sorted は
        // 安定性を保証しない。添字を第2キーにして、同じ材料が減るようにする。
        let pool = HERBS.enumerated()
            .filter { $0.element.id != p.main }
            .sorted { a, b in
                let ca = data.garden.herbs[a.element.id] ?? 0
                let cb = data.garden.herbs[b.element.id] ?? 0
                if ca != cb { return ca > cb }
                return a.offset < b.offset
            }
            .map(\.element)
        for h in pool {
            while need > 0 && (data.garden.herbs[h.id] ?? 0) > 0 {
                data.garden.herbs[h.id] = (data.garden.herbs[h.id] ?? 0) - 1
                need -= 1
            }
            if need == 0 { break }
        }
        data.garden.potions[potionId] = (data.garden.potions[potionId] ?? 0) + 1
        save()
        return true
    }

    // MARK: - 金

    /// ステージ解放（§7.5）。
    @discardableResult
    public func unlockStage(_ stageId: Int) -> Bool {
        let stage = stageDef(stageId)
        if data.unlockedStages.contains(stageId) { return false }
        if data.gold < stage.unlockCost { return false }
        // 直前のステージをクリアしていること
        if stageId > 1 && !data.clearedStages.contains(stageId - 1) { return false }
        data.gold -= stage.unlockCost
        data.unlockedStages.append(stageId)
        save()
        return true
    }

    /// 再鑑定の費用。
    ///
    /// **ここは `pow` を使う。** `difficultyMul` では繰り返し乗算にしたが、
    /// それは V8 の `Math.pow(2.2, n)` が繰り返し乗算と一致したから。
    /// `Math.pow(2.4, 3)` は逆で、繰り返し乗算とは 1ulp ずれ、
    /// Apple の `pow(2.4, 3.0)` とは bit 単位で一致する（実測）。
    /// 一般則は無い。**片方ずつ実測して、ゴールデンで固定する**しかない。
    public func reidentifyCost(_ item: Item) -> Int {
        let rank = Double(rarityRank(item.rarity))
        return jsRoundInt(60 * pow(2.4, rank) * (1 + Double(item.power) / 200))
    }

    /// 再鑑定：アフィックス1つをランダムに振り直す（§7.5）。
    @discardableResult
    public func reidentify(_ itemId: String, _ rng: inout Prng) -> Bool {
        guard let idx0 = data.inventory.firstIndex(where: { $0.id == itemId }) else { return false }
        if data.inventory[idx0].affixes.isEmpty { return false }
        let cost = reidentifyCost(data.inventory[idx0])
        if data.gold < cost { return false }
        data.gold -= cost
        let idx = rng.int(data.inventory[idx0].affixes.count)
        let target = data.inventory[idx0].affixes[idx]
        guard let def = AFFIXES.first(where: { $0.kind == target.kind }) else { return false }
        let value = def.min + rng.float() * (def.max - def.min)
        let t = (value - def.min) / Swift.max(0.0001, def.max - def.min)
        data.inventory[idx0].affixes[idx] = Affix(
            kind: target.kind,
            value: value,
            tier: Swift.max(1, Swift.min(5, Int((t * 5).rounded(.down)) + 1)),
            element: target.element
        )
        save()
        return true
    }

    /// 売却。ゴミ装備が金に変わらないと純粋なストレスになる（§7.5）。
    @discardableResult
    public func sell(_ ids: [String], valueOf: (Item) -> Int = sellValue) -> Int {
        var total = 0
        var equippedIds = Set<String>()
        for e in data.equipped.values {
            if let w = e.weapon { equippedIds.insert(w) }
            if let a = e.armor { equippedIds.insert(a) }
        }
        let idSet = Set(ids)
        var keep: [Item] = []
        for it in data.inventory {
            if idSet.contains(it.id) && !it.locked && !equippedIds.contains(it.id) {
                total += valueOf(it)
            } else {
                keep.append(it)
            }
        }
        data.inventory = keep
        data.gold += total
        save()
        return total
    }

    // MARK: - 保存

    public func save() {
        guard let encoded = try? JSONEncoder().encode(data) else { return }
        store.save(encoded)
    }

    public func reset(seed: UInt32, now: Double) {
        data = SaveData.makeDefault(seed: seed, now: now)
        save()
    }

    /// 読み込み。
    ///
    /// **web 版の v1→v2→v3 の移行は移していない。** iOS には v1 も v2 の
    /// セーブも存在しえない（この移植が最初の版）ので、移行の分岐は
    /// 「一度も通らないのに壊れうるコード」にしかならない。
    /// 版が違えば作り直す、だけにする。
    private static func loadSave(from store: SaveStore) -> SaveData? {
        guard let raw = store.load(),
              let parsed = try? JSONDecoder().decode(SaveData.self, from: raw),
              parsed.version == SAVE_VERSION
        else { return nil }
        return parsed
    }
}

/// デバッグ用：任意のステージのドロップを直接生成する（開封演出の確認に使う）。
public func debugLoot(seed: UInt32, stageId: Int, count: Int) -> [Item] {
    var rng = Prng(seed: seed)
    let stage = stageDef(stageId)
    return (0..<count).map { i in
        generateItem(&rng, GenerateOptions(
            itemPower: itemPowerFor(stageId: stage.id, tier: 1),
            slot: i % 2 == 0 ? .weapon : .armor,
            stageId: stage.id,
            rarityBonus: stage.rarityBonus,
            id: "dbg-\(i)"
        ))
    }
}
