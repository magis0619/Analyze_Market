import DelversCore
import SwiftUI

/// 派遣準備（web 版 §2.3 / §2.4）。
///
/// プレイヤーが行う3つの判断——装備・撤退ルール・派遣先——を1画面に収める。
/// 派遣先は**地図**で選び、装備は**升目**から選んで台座で比べる。
struct DispatchScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var jobIdx = 0
    @State private var rule: RetreatRule = .standard
    @State private var stageId = 1
    @State private var picking: Slot?
    @State private var candidate: Item?
    @State private var mapOpen = false
    @State private var potionId: String?
    @State private var sortByRaw = false
    @State private var started = false

    // MARK: - 背負うシーンと 3D への数値

    static func sceneFor(_ shell: Shell) -> SceneName {
        shell.dispatchPicking ? .pedestal : (shell.dispatchMapOpen ? .map : .gate)
    }

    static func moodFor(_ shell: Shell) -> Mood {
        let st = shell.state
        if shell.dispatchPicking {
            let r = shell.dispatchCandidateRarity ?? .common
            return Mood(accent: DS.rarity(r), intensity: auraFor(r))
        }
        if shell.dispatchMapOpen {
            return Mood(
                nodes: STAGES.map { s in
                    NodeMood(
                        state: st.data.clearedStages.contains(s.id) ? 2
                             : st.data.unlockedStages.contains(s.id) ? 1 : 0,
                        element: {
                            switch s.enemyElement {
                            case .mixed: return -1
                            case .single(let e): return moodElementIndex(e)
                            }
                        }()
                    )
                },
                selected: STAGES.firstIndex { $0.id == shell.dispatchStageId } ?? -1
            )
        }
        let stage = stageDef(shell.dispatchStageId)
        return Mood(accent: stageAccent(stage),
                    intensity: min(1, Double(stage.id - 1) / Double(STAGES.count - 1)))
    }

    static func auraFor(_ r: Rarity) -> Double {
        switch r {
        case .common: return 0.16
        case .fine: return 0.4
        case .rare: return 0.68
        case .relic: return 1
        }
    }

    private var job: JobId { shell.state.availableJobs()[safe: jobIdx] ?? .swordsman }
    private var weapon: Item? { shell.state.itemById(shell.state.equipped(job).weapon) }
    private var armor: Item? { shell.state.itemById(shell.state.equipped(job).armor) }
    private var stage: StageDef { stageDef(stageId) }
    private var unlocked: Bool { shell.state.data.unlockedStages.contains(stageId) }

    var body: some View {
        Group {
            if picking != nil {
                pickerSheet
            } else if mapOpen {
                mapSheet
            } else {
                main
            }
        }
        .onAppear {
            stageId = shell.stageContext ?? shell.state.data.unlockedStages.max() ?? 1
            syncToShell()
        }
        .onChange(of: stageId) { _, _ in syncToShell() }
        .onChange(of: mapOpen) { _, _ in syncToShell() }
        .onChange(of: picking) { _, _ in syncToShell() }
        .onChange(of: candidate?.id) { _, _ in syncToShell() }
    }

    /// 画面の状態を Shell 経由で 3D へ渡す。**数値だけ**が通る。
    private func syncToShell() {
        shell.dispatchStageId = stageId
        shell.dispatchMapOpen = mapOpen
        shell.dispatchPicking = picking != nil
        shell.dispatchCandidateRarity = candidate?.rarity
        shell.stageContext = stageId
    }

    // MARK: - 本体

    private var main: some View {
        let busy = shell.state.isBusy(job)
        let jobs = shell.state.availableJobs()
        return Scaffold(
            title: "派遣準備", back: { shell.go(.base) },
            hint: hintText, hero: true, anchorBottom: true
        ) {
            if jobs.count > 1 {
                TabBar(items: jobs.map { jobDef($0).name }, selection: $jobIdx, identifier: "job")
            }

            Panel(label: "装備") {
                HStack(spacing: DS.sp2) {
                    equipSlot(.weapon, weapon)
                    equipSlot(.armor, armor)
                }
                if let hint = matchupHint {
                    Text(hint).font(.delversLabel).foregroundStyle(DS.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            potionPanel

            Panel(label: "撤退ルール") {
                HStack(spacing: DS.sp2) {
                    ForEach(RETREAT_RULES, id: \.id) { r in
                        ruleCell(r)
                    }
                }
            }

            Button { mapOpen = true } label: {
                HStack(spacing: DS.sp2) {
                    Text("派遣先").font(.delversMicro).tracking(1.6).foregroundStyle(DS.faint)
                    Text(stage.name).font(.delversBody).foregroundStyle(DS.text)
                    if shell.state.data.clearedStages.contains(stage.id) {
                        Image(systemName: "checkmark").font(.system(size: 10)).foregroundStyle(DS.up)
                    }
                    Text(unlocked ? duration(Double(stage.minutes * 60))
                                  : "未解放 \(num(stage.unlockCost))G")
                        .font(.delversLabel).foregroundStyle(DS.dim)
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(DS.faint)
                }
                .padding(.horizontal, DS.sp3)
                .frame(minHeight: DS.tap)
                .background {
                    Surface(radius: DS.rMd)
                        .overlay {
                            RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                                .strokeBorder(DS.line, lineWidth: 1)
                        }
                }
            }
            .buttonStyle(PressStyle())
            .accessibilityIdentifier("map-open")
        } action: {
            TierButton(
                label: busy ? "この職は派遣中"
                    : weapon == nil || armor == nil ? "装備を選ぶ"
                    : !unlocked ? "このステージは未解放" : "派遣する",
                tier: .primary,
                disabled: busy || weapon == nil || armor == nil || !unlocked
            ) {
                guard !started else { return }
                started = true
                if shell.state.dispatch(job: job, stage: stageId, rule: rule,
                                        now: Date().timeIntervalSince1970 * 1000,
                                        potionId: potionId) {
                    Haptic.commit()
                    shell.changed()
                    shell.go(.base)
                }
                started = false
            }
            .accessibilityIdentifier("cta")
        }
    }

    private var hintText: String {
        "\(stage.name) ・ \(retreatRuleDef(rule).name)"
    }

    private func equipSlot(_ slot: Slot, _ it: Item?) -> some View {
        Button {
            candidate = nil
            picking = slot
        } label: {
            HStack(spacing: DS.sp2) {
                ZStack {
                    RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                        .strokeBorder(it.map { DS.rarity($0.rarity) } ?? DS.down, lineWidth: 1)
                    Text(it.map { itemGlyph($0) } ?? (slot == .weapon ? "剣" : "盾"))
                        .font(.delversBody)
                        .foregroundStyle(it.map { DS.rarity($0.rarity) } ?? DS.down)
                }
                .frame(width: 38, height: 38)
                VStack(alignment: .leading, spacing: 1) {
                    if let it {
                        Text("\(it.power)").font(.delversTitle(16)).foregroundStyle(DS.text)
                        Text(baseDef(it.baseId).name).font(.delversLabel).foregroundStyle(DS.dim)
                    } else {
                        Text(slot == .weapon ? "武器を選ぶ" : "防具を選ぶ")
                            .font(.delversLabel).foregroundStyle(DS.down)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(DS.sp2)
            .frame(maxWidth: .infinity, minHeight: DS.tap + 8)
            .background {
                RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                    .strokeBorder(DS.line, lineWidth: 1)
            }
        }
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("pick-\(slot.rawValue)")
    }

    /// 属性の噛み合いを1行で言う。素の数字だけ出していると
    /// 「一番大きい数字を装備する」以外の選択が生まれない。
    private var matchupHint: String? {
        guard let w = weapon else { return nil }
        let dom = dominantElement(w.element)
        var parts: [String] = []
        if stage.resists.contains(dom) {
            parts.append("\(DS.elementName(dom))は半減される")
        } else if stage.weakTo == dom {
            parts.append("\(DS.elementName(dom))が弱点を突く（1.5倍）")
        } else {
            parts.append("属性は等倍")
        }
        if case .single(let e) = stage.enemyElement {
            parts.append("敵は\(DS.elementName(e))で攻めてくる")
        } else {
            parts.append("敵の属性は複合")
        }
        return parts.joined(separator: " ・ ")
    }

    /// 薬を持たせる段。**派遣先に効くものを推す。**
    /// 持たせないのも選べる——貴重なので「毎回持つ」を強制すると、
    /// 育てる楽しみが義務に変わる。
    @ViewBuilder private var potionPanel: some View {
        let owned = POTIONS.filter { (shell.state.data.garden.potions[$0.id] ?? 0) > 0 }
        if !owned.isEmpty {
            let best: PotionDef? = {
                if case .single(let e) = stage.enemyElement { return potionForElement(e) }
                return nil
            }()
            Panel(label: "薬を持たせる") {
                VStack(spacing: DS.sp2) {
                    potionRow(nil, recommended: false)
                    ForEach(owned, id: \.id) { p in
                        potionRow(p, recommended: best?.id == p.id)
                    }
                }
            }
        }
    }

    private func potionRow(_ p: PotionDef?, recommended: Bool) -> some View {
        let on = potionId == p?.id
        return Button { potionId = p?.id } label: {
            HStack(spacing: DS.sp2) {
                ZStack {
                    Circle().strokeBorder(on ? DS.gold : DS.line, lineWidth: 1)
                    if on { Circle().fill(DS.gold).frame(width: 10, height: 10) }
                }
                .frame(width: 20, height: 20)
                VStack(alignment: .leading, spacing: 1) {
                    Text(p?.name ?? "持たせない").font(.delversBody).foregroundStyle(DS.text)
                    if let p {
                        Text(p.text).font(.delversLabel).foregroundStyle(DS.dim)
                    }
                }
                Spacer(minLength: 0)
                if recommended { Tag(text: "効く", tone: DS.up) }
                if let p {
                    Text("×\(shell.state.data.garden.potions[p.id] ?? 0)")
                        .font(.delversLabel).foregroundStyle(DS.faint)
                }
            }
            .padding(.horizontal, DS.sp2)
            .frame(maxWidth: .infinity, minHeight: DS.tap, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }

    private func ruleCell(_ r: RetreatRuleDef) -> some View {
        let on = rule == r.id
        let tone: Color = r.id == .reckless ? DS.down : r.id == .standard ? DS.gold : DS.up
        return Button { rule = r.id } label: {
            VStack(spacing: DS.sp1) {
                Text(r.name).font(.delversBody).foregroundStyle(on ? tone : DS.dim)
                // 撤退ラインを帯で見せる。数字だけだと3つの違いが読み取れない
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(DS.line).frame(height: 4)
                        Capsule().fill(tone)
                            .frame(width: g.size.width * (1 - r.threshold), height: 4)
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                }
                .frame(height: 8)
                Text(r.threshold == 0 ? "HPが0まで" : "HP\(Int(r.threshold * 100))%で帰還")
                    .font(.delversMicro).foregroundStyle(DS.faint)
                    .lineLimit(2).multilineTextAlignment(.center)
            }
            .padding(DS.sp2)
            .frame(maxWidth: .infinity, minHeight: 74)
            .background {
                RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                    .strokeBorder(on ? tone.opacity(0.7) : DS.line, lineWidth: 1)
            }
        }
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("rule-\(r.id.rawValue)")
    }

    // MARK: - 派遣先の地図
    //
    // 10行の一覧では「浅いか深いか」が文字を読むまで分からない。
    // 3D が経路とノードを描き、番号と名前はここが出す。
    // **押されるのは 3D ではなくこのボタン。**

    private var mapSheet: some View {
        let prevCleared = stage.id == 1 || shell.state.data.clearedStages.contains(stage.id - 1)
        return ZStack {
            GeometryReader { geo in
                ForEach(Array(STAGES.enumerated()), id: \.element.id) { i, s in
                    if let at = shell.hotspots["node\(i)"] {
                        mapNode(s, selected: s.id == stageId)
                            .position(x: at.x * geo.size.width, y: at.y * geo.size.height)
                    }
                }
            }
            Scaffold(
                title: "派遣先を選ぶ", back: { mapOpen = false },
                hint: "暗いノードはまだ行けない場所", hero: false, anchorBottom: true
            ) {
                Panel(label: stage.name) {
                    if unlocked {
                        Row(label: "敵の属性", value: stageElementName(stage))
                        Row(label: "弱点", value: stage.weakTo.map { DS.elementName($0) } ?? "なし",
                            tone: stage.weakTo == nil ? DS.faint : DS.up)
                        Row(label: "効きにくい",
                            value: stage.resists.isEmpty ? "なし"
                                : stage.resists.map { DS.elementName($0) }.joined(separator: "・"),
                            tone: stage.resists.isEmpty ? DS.faint : DS.ember)
                        Row(label: "満踏破で ／ ドロップ",
                            value: "\(duration(Double(stage.minutes * 60))) ・ \(dropBiasName(stage.dropBias))")
                        Row(label: "主", value: bossName(stage.id), tone: DS.down)
                    } else {
                        Row(label: "解放費用", value: "\(num(stage.unlockCost))G", tone: DS.gold)
                        Text(!prevCleared ? "ステージ\(stage.id - 1)の踏破が必要"
                             : shell.state.data.gold >= stage.unlockCost ? "解放できる" : "金が足りない")
                            .font(.delversLabel).foregroundStyle(DS.dim)
                    }
                }
                .padding(.top, mapPanelTop)
            } action: {
                if unlocked {
                    TierButton(label: "ここへ送る", tier: .primary) { mapOpen = false }
                        .accessibilityIdentifier("cta")
                } else {
                    TierButton(label: "解放する ・ \(num(stage.unlockCost))G", tier: .primary,
                               disabled: shell.state.data.gold < stage.unlockCost || !prevCleared) {
                        if shell.state.unlockStage(stageId) {
                            Haptic.gain()
                            shell.changed()
                            shell.notify("\(stage.name)を解放した")
                        }
                    }
                    .accessibilityIdentifier("cta")
                }
            }
        }
    }

    /// ノードが下まで降りてくるので、明細はその下に置く
    private var mapPanelTop: CGFloat { UIScreen.main.bounds.height * 0.60 }

    private func mapNode(_ s: StageDef, selected: Bool) -> some View {
        let st = shell.state
        let ok = st.data.unlockedStages.contains(s.id)
        let done = st.data.clearedStages.contains(s.id)
        return Button { stageId = s.id } label: {
            VStack(spacing: 2) {
                Text(ok ? "\(s.id)" : "鍵")
                    .font(ok ? .delversBody : .delversLabel)
                    .monospacedDigit()
                    .frame(width: DS.tap, height: DS.tap)
                    .background(Circle().fill(DS.ground.opacity(0.72)))
                    .overlay(Circle().strokeBorder(
                        selected ? DS.gold : done ? DS.up.opacity(0.55)
                                 : ok ? DS.lineHi : DS.line, lineWidth: 1))
                    .foregroundStyle(selected ? DS.gold : done ? DS.up : ok ? DS.dim : DS.faint)
                    .shadow(color: selected ? DS.gold.opacity(0.6) : .clear, radius: 10)
                // 選んでいるノードだけ名前を出す。10個ぶん常時出すと隣同士が重なる
                if selected {
                    Text(s.name)
                        .font(.delversLabel).foregroundStyle(DS.text)
                        .padding(.horizontal, DS.sp2).padding(.vertical, 2)
                        .background(Capsule().fill(DS.ground.opacity(0.86)))
                        .overlay(Capsule().strokeBorder(DS.line, lineWidth: 1))
                        .fixedSize()
                }
            }
        }
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("node-\(s.id)")
    }

    // MARK: - 装備選択（升目 → 台座）
    //
    // 行の一覧は1件につき名前・レアリティ・秒間・効果数と4つの語を並べていた。
    // 24件で96語——読む前に諦める画面になる。
    // 升目に置くのは**焼いたモデルの絵の代わりの記号と、装備中との差だけ**。

    private var pickerSheet: some View {
        let slot = picking ?? .weapon
        let current = slot == .weapon ? weapon : armor
        let list = candidates(slot)
        let idx = list.firstIndex { $0.id == candidate?.id } ?? -1
        return SheetLayer(
            title: slot == .weapon ? "武器を選ぶ" : "防具を選ぶ",
            close: { picking = nil; candidate = nil },
            hint: candidate == nil ? "タップで比較" : "‹ › で隣の品と比べ直せる",
            hero: candidate != nil
        ) {
            if let c = candidate {
                carousel(idx: idx, count: list.count) { d in
                    let n = max(0, min(list.count - 1, idx + d))
                    if let it = list[safe: n] { candidate = it }
                }
                CompareCard(current: current, candidate: c, stage: stage)
            }
            TabBar(items: ["\(stage.name)での強さ", "素の強さ"],
                   selection: Binding(get: { sortByRaw ? 1 : 0 }, set: { sortByRaw = $0 == 1 }),
                   identifier: "sort")

            if list.isEmpty {
                Text("装備できる品がない").font(.delversLabel).foregroundStyle(DS.faint)
                    .frame(maxWidth: .infinity, minHeight: 60)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.sp2),
                                         count: 4), spacing: DS.sp2) {
                    ForEach(list, id: \.id) { it in
                        ItemTile(item: it, compareTo: current, stage: sortByRaw ? nil : stage,
                                 selected: candidate?.id == it.id) {
                            candidate = it
                        }
                    }
                }
            }
        } action: {
            if let c = candidate {
                HStack(spacing: DS.sp2) {
                    TierButton(label: "戻る", tier: .quiet) { candidate = nil }
                    TierButton(label: current?.id == c.id ? "装備中" : "装備する",
                               tier: .primary, disabled: current?.id == c.id) {
                        var eq = shell.state.equipped(job)
                        if slot == .weapon { eq.weapon = c.id } else { eq.armor = c.id }
                        shell.state.data.equipped[job.rawValue] = eq
                        Haptic.commit()
                        shell.changed()
                        picking = nil
                        candidate = nil
                    }
                    .accessibilityIdentifier("equip")
                }
            } else {
                TierButton(label: "閉じる", tier: .quiet) { picking = nil }
                    .accessibilityIdentifier("cta")
            }
        }
    }

    /// 台座の送り。一覧に戻らず隣の品と比べ続けられる。
    /// **番号は状態として持たない**——並べ替えを切り替えると順番が変わるので、
    /// 覚えた番号は次の瞬間には別の品を指している。
    private func carousel(idx: Int, count: Int, move: @escaping (Int) -> Void) -> some View {
        HStack {
            Button { move(-1) } label: {
                Image(systemName: "chevron.left")
                    .frame(width: DS.tap, height: DS.tap).contentShape(Rectangle())
            }
            .buttonStyle(PressStyle()).disabled(idx <= 0)
            .foregroundStyle(idx <= 0 ? DS.faint : DS.dim)
            .accessibilityIdentifier("pick-prev")
            Spacer()
            Text("\(idx + 1) / \(count)").font(.delversLabel).monospacedDigit()
                .foregroundStyle(DS.dim)
            Spacer()
            Button { move(1) } label: {
                Image(systemName: "chevron.right")
                    .frame(width: DS.tap, height: DS.tap).contentShape(Rectangle())
            }
            .buttonStyle(PressStyle()).disabled(idx >= count - 1)
            .foregroundStyle(idx >= count - 1 ? DS.faint : DS.dim)
            .accessibilityIdentifier("pick-next")
        }
    }

    private func candidates(_ slot: Slot) -> [Item] {
        let st = shell.state
        let jd = jobDef(job)
        var xs = st.data.inventory.filter { it in
            guard it.slot == slot else { return false }
            if slot == .armor { return canEquipArmor(jd, armorTags: baseDef(it.baseId).tags) }
            return true
        }
        if sortByRaw {
            xs.sort { itemScore($0) > itemScore($1) }
        } else {
            xs.sort { effectiveScore($0, stage) > effectiveScore($1, stage) }
        }
        return xs
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { i >= 0 && i < count ? self[i] : nil }
}

func stageElementName(_ s: StageDef) -> String {
    switch s.enemyElement {
    case .mixed: return "複合"
    case .single(let e): return DS.elementName(e)
    }
}

func dropBiasName(_ b: StageDef.DropBias) -> String {
    switch b {
    case .weapon: return "武器寄り"
    case .armor: return "防具寄り"
    case .even: return "均等"
    }
}
