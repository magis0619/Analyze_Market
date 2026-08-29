import DelversCore
import SwiftUI

// MARK: - 開封
//
// 稀少以上はカットインで見せる。**開けるまで中身は分からない**——
// 一覧の色帯で先に分かってしまうと、開封の意味が消える。

struct OpeningScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var queue: [Item] = []
    @State private var opened: [Item] = []
    @State private var showing: Item?
    @State private var phase = 0.0

    static func moodFor(_ shell: Shell) -> Mood {
        Mood(accent: DS.rarity(shell.openingRarity), intensity: shell.openingPower)
    }

    var body: some View {
        Scaffold(
            title: "開封", meta: "\(opened.count) / \(opened.count + queue.count)",
            hero: true, anchorBottom: true
        ) {
            if let it = showing {
                cutIn(it)
            } else if !opened.isEmpty {
                Panel(label: "開けたもの") {
                    VStack(spacing: DS.sp2) {
                        ForEach(opened.reversed(), id: \.id) { it in
                            ItemRow(item: it, showSell: true)
                        }
                    }
                }
            }
        } action: {
            if !queue.isEmpty {
                TierButton(label: showing == nil ? "次を開ける" : "続ける", tier: .primary) {
                    step()
                }
                .accessibilityIdentifier("cta")
            } else {
                TierButton(label: "拠点へ戻る", tier: .primary) {
                    shell.go(.base)
                }
                .accessibilityIdentifier("cta")
            }
        }
        .onAppear {
            if queue.isEmpty && opened.isEmpty {
                queue = shell.state.openAll()
                shell.changed()
                step()
            }
        }
    }

    private func step() {
        if let s = showing {
            opened.append(s)
            showing = nil
        }
        guard !queue.isEmpty else {
            shell.openingPower = 0.2
            return
        }
        let next = queue.removeFirst()
        showing = next
        shell.openingRarity = next.rarity
        shell.openingPower = DispatchScreen.auraFor(next.rarity)
        phase = 0
        withAnimation(.easeOut(duration: 0.55)) { phase = 1 }
        // 稀少以上だけ手応えを返す。全部に返すと合図でなくなる
        if hasCutIn(next.rarity) { Haptic.reveal() }
    }

    private func cutIn(_ it: Item) -> some View {
        // **光の奔流の真上に出る文字。** 板が無いので幕を敷く。
        // 敷かないと「並」が 3.9:1 まで落ちた
        VStack(spacing: DS.sp3) {
            Text(rarityLabel(it.rarity))
                .font(.delversMicro).tracking(4)
                .foregroundStyle(DS.rarity(it.rarity))
            Text(itemName(it))
                .font(.delversTitle(26))
                .foregroundStyle(DS.text)
                .multilineTextAlignment(.center)
            Text("\(it.slot == .weapon ? "秒間" : "防御") \(itemScore(it))")
                .font(.delversDisplay)
                .foregroundStyle(DS.rarity(it.rarity))
                .contentTransition(.numericText())
            if let u = it.unique {
                Text(uniqueDef(u).text)
                    .font(.delversLabel).foregroundStyle(DS.gold)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(it.affixes.enumerated()), id: \.offset) { _, a in
                HStack {
                    Text(affixDef(a.kind).name).font(.delversLabel).foregroundStyle(DS.dim)
                    Spacer()
                    Text(String(repeating: "★", count: a.tier)
                         + String(repeating: "☆", count: 5 - a.tier))
                        .font(.delversLabel).foregroundStyle(DS.gold)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(DS.sp4)
        .background {
            Surface(radius: DS.rLg)
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rLg, style: .continuous)
                        .strokeBorder(DS.rarity(it.rarity).opacity(0.6), lineWidth: 1)
                }
        }
        .scaleEffect(0.94 + phase * 0.06)
        .opacity(phase)
        .accessibilityIdentifier("cutin")
    }
}

// MARK: - 所持品
//
// 装備は1点ずつ違う個体（並べ替え・ロック・売却がある）。種・収穫物・薬は
// 「何がいくつ」しかない。**同じ一覧に混ぜると効かない操作が並ぶ**ので面を分ける。

struct InventoryScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var cat = 0
    @State private var slotFilter = 0
    @State private var selected: Item?
    @State private var confirm: (ids: [String], gold: Int, label: String)?

    static func moodFor(_ shell: Shell) -> Mood {
        Mood(accent: DS.rarity(shell.inventoryRarity ?? .fine),
             intensity: shell.inventoryRarity.map { DispatchScreen.auraFor($0) } ?? 0.2)
    }

    private let cats = ["装備", "種", "収穫物", "薬"]
    private let slots = ["全部", "武器", "防具"]

    var body: some View {
        Group {
            if let it = selected {
                detailSheet(it)
            } else {
                main
            }
        }
        .overlay {
            if let c = confirm {
                ConfirmSheet(
                    title: c.label, detail: "ロック品と装備中の品は含まれていない。この操作は戻せない。",
                    accent: "+\(num(c.gold))G", confirmLabel: "売却する", danger: true,
                    cancel: { confirm = nil },
                    confirm: {
                        let got = shell.state.sell(c.ids)
                        Haptic.gain()
                        shell.changed()
                        shell.notify("+\(num(got))G")
                        confirm = nil
                        selected = nil
                    }
                )
            }
        }
        .onChange(of: selected?.id) { _, _ in
            shell.inventoryRarity = selected?.rarity
        }
    }

    private var main: some View {
        let list = view()
        return Scaffold(
            title: "所持品", back: { shell.go(.base) },
            meta: cat == 0 ? "\(list.count)点" : nil, hero: false
        ) {
            TabBar(items: cats, selection: $cat, identifier: "cat")

            if cat == 0 {
                TabBar(items: slots, selection: $slotFilter, identifier: "slot")
                if list.isEmpty {
                    empty("該当する品が無い")
                } else {
                    LazyVStack(spacing: DS.sp2) {
                        ForEach(list, id: \.id) { it in
                            ItemRow(item: it, showSell: true,
                                    equipped: equippedIds.contains(it.id)) { selected = it }
                        }
                    }
                }
            } else {
                stockList
            }
        } action: {
            if cat == 0 {
                let sellable = list.filter { !$0.locked && !equippedIds.contains($0.id) }
                let gold = sellable.reduce(0) { $0 + sellValue($1) }
                TierButton(label: "表示中の \(sellable.count)個を売る ・ \(num(gold))G",
                           tier: .danger, disabled: sellable.isEmpty) {
                    confirm = (sellable.map(\.id), gold, "表示中の \(sellable.count)個を売却する")
                }
                // **ここが所持品の主要動線。** `bulk` と名づけていたせいで
                // B1（主要動線が1つ、親指の届く場所にあるか）が
                // `cta` を見つけられず、この画面だけ黙って検査を素通りしていた
                .accessibilityIdentifier("cta")
            } else {
                // 面ごとに**次の行き先**を出す。数を眺めるだけの画面にしない
                let go: (String, Route) = cat == 1 ? ("薬草園で植える", .garden)
                    : cat == 2 ? ("錬金工房で薬にする", .alchemy) : ("派遣に持たせる", .dispatch)
                TierButton(label: go.0, tier: .primary) { shell.go(go.1) }
                    .accessibilityIdentifier("cta")
            }
        }
    }

    @ViewBuilder private var stockList: some View {
        let g = shell.state.data.garden
        if cat == 3 {
            let xs = POTIONS.filter { (g.potions[$0.id] ?? 0) > 0 }
            if xs.isEmpty { empty("錬金工房で作れる") }
            ForEach(xs, id: \.id) { p in
                stockRow(DS.element(p.element), "薬", p.name, p.text, g.potions[p.id] ?? 0)
            }
        } else {
            let bag = cat == 1 ? g.seeds : g.herbs
            let xs = HERBS.filter { (bag[$0.id] ?? 0) > 0 }
            if xs.isEmpty { empty(cat == 1 ? "薬草園で種を買える" : "薬草園で育てて収穫する") }
            ForEach(xs, id: \.id) { h in
                // 種は「植えたらどうなるか」、収穫物は「何になるか」。
                // 手持ちの数だけ出しても、次に何をすればよいか分からない
                let note = cat == 1
                    ? "\(h.growSec / 60)分で \(h.yieldCount)個"
                    : "\(POTIONS.first { $0.main == h.id }?.name ?? "薬")の主材料"
                stockRow(DS.element(h.element), h.glyph, h.name, note, bag[h.id] ?? 0)
            }
        }
    }

    private func stockRow(_ tone: Color, _ glyph: String, _ name: String,
                          _ note: String, _ n: Int) -> some View {
        HStack(spacing: DS.sp3) {
            ZStack {
                RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                    .strokeBorder(tone.opacity(0.5), lineWidth: 1)
                Text(glyph).font(.delversLabel).foregroundStyle(tone)
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.delversBody).foregroundStyle(DS.text)
                Text(note).font(.delversLabel).foregroundStyle(DS.dim)
            }
            Spacer(minLength: 0)
            Text("×\(n)").font(.delversBody).foregroundStyle(DS.dim)
        }
        .padding(.horizontal, DS.sp3)
        .frame(minHeight: 52)
        .background {
            Surface(radius: DS.rSm)
        }
    }

    private func empty(_ s: String) -> some View {
        Text(s).font(.delversLabel).foregroundStyle(DS.faint)
            .frame(maxWidth: .infinity, minHeight: 70)
    }

    private func detailSheet(_ it: Item) -> some View {
        SheetLayer(title: itemName(it), close: { selected = nil },
                   hint: "振直はアフィックスを引き直す（戻せない）") {
            Panel(label: rarityLabel(it.rarity)) {
                if it.slot == .weapon {
                    Row(label: "秒間火力", value: "\(itemScore(it))")
                    Row(label: "威力", value: "\(it.power)")
                    Row(label: "速度", value: String(format: "%.2f", it.speed))
                    Row(label: "会心", value: String(format: "%.1f%%", it.crit))
                } else {
                    Row(label: "防御", value: "\(it.power)")
                }
                ForEach(Array(it.affixes.enumerated()), id: \.offset) { _, a in
                    HStack {
                        Text(affixDef(a.kind).name).font(.delversLabel).foregroundStyle(DS.dim)
                        Spacer()
                        Text(String(repeating: "★", count: a.tier)
                             + String(repeating: "☆", count: 5 - a.tier))
                            .font(.delversLabel).foregroundStyle(DS.gold)
                    }
                }
                if let u = it.unique {
                    Text(uniqueDef(u).text).font(.delversLabel).foregroundStyle(DS.gold)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Row(label: "初出", value: it.fromStage > 0 ? stageDef(it.fromStage).name : "支給品")
            }
        } action: {
            HStack(spacing: DS.sp2) {
                TierButton(label: it.locked ? "解除" : "ロック", tier: .secondary) {
                    if let i = shell.state.data.inventory.firstIndex(where: { $0.id == it.id }) {
                        shell.state.data.inventory[i].locked.toggle()
                        selected = shell.state.data.inventory[i]
                        shell.changed()
                    }
                }
                let cost = shell.state.reidentifyCost(it)
                TierButton(label: "振直 \(num(cost))G", tier: .secondary,
                           disabled: it.affixes.isEmpty || shell.state.data.gold < cost) {
                    var rng = Prng(seed: UInt32.random(in: 1...UInt32.max))
                    if shell.state.reidentify(it.id, &rng) {
                        selected = shell.state.itemById(it.id)
                        shell.changed()
                        shell.notify("アフィックスを振り直した")
                    }
                }
                TierButton(label: equippedIds.contains(it.id) ? "装備中"
                           : it.locked ? "ロック中" : "売却 \(num(sellValue(it)))G",
                           tier: .danger,
                           disabled: equippedIds.contains(it.id) || it.locked) {
                    confirm = ([it.id], sellValue(it), "\(itemName(it)) を売却する")
                }
            }
        }
    }

    private var equippedIds: Set<String> {
        var s = Set<String>()
        for e in shell.state.data.equipped.values {
            if let w = e.weapon { s.insert(w) }
            if let a = e.armor { s.insert(a) }
        }
        return s
    }

    private func view() -> [Item] {
        var xs = shell.state.data.inventory
        if slotFilter == 1 { xs = xs.filter { $0.slot == .weapon } }
        if slotFilter == 2 { xs = xs.filter { $0.slot == .armor } }
        let stage = shell.stageContext.map { stageDef($0) }
        xs.sort { a, b in
            let sa = stage.map { effectiveScore(a, $0) } ?? itemScore(a)
            let sb = stage.map { effectiveScore(b, $0) } ?? itemScore(b)
            return sa > sb
        }
        return xs
    }
}

// MARK: - 図鑑
//
// **本にする。** ページは2枚しかないので、めくりは 3D 変形で足りる。
// 前のページを裏に残すのが肝——消してから入れるとフェードになる。

struct CompendiumScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var page = 0
    @State private var flipping = false
    @State private var prevPage = 0
    @State private var dir = 1.0

    var body: some View {
        let found = foundCount
        return Scaffold(
            title: "図鑑", back: { shell.go(.base) },
            meta: "\(found.0) / \(found.1)", hero: false
        ) {
            TabBar(items: ["装備", "ユニーク効果"],
                   selection: Binding(get: { page }, set: { turnTo($0) }), identifier: "page")

            Panel(label: page == 0 ? "基礎装備" : "ユニーク効果") {
                ZStack {
                    if flipping {
                        grid(prevPage).opacity(0.5)
                    }
                    grid(page)
                        .rotation3DEffect(.degrees(flipping ? dir * 96 : 0),
                                          axis: (x: 0, y: 1, z: 0),
                                          anchor: dir > 0 ? .leading : .trailing,
                                          perspective: 0.7)
                        .opacity(flipping ? 0.2 : 1)
                }
            }

            // ページ送りと注記は板の外＝3D の直上に出る。幕を敷かないと読めない
            VStack(spacing: DS.sp1) {
                HStack {
                    TierButton(label: "‹ 前", tier: .quiet, disabled: page == 0) { turnTo(0) }
                    Text("\(page + 1) / 2").font(.delversLabel).foregroundStyle(DS.dim)
                        .frame(minWidth: 50)
                    TierButton(label: "次 ›", tier: .quiet, disabled: page == 1) { turnTo(1) }
                }
                Text(found.0 == found.1 ? "すべて記録した"
                     : "残り\(found.1 - found.0)種。深いステージほど出やすい")
                    .font(.delversLabel).foregroundStyle(DS.dim)
                    .frame(maxWidth: .infinity)
            }
            .legible()
        } action: {
            TierButton(label: "拠点へ戻る", tier: .quiet) { shell.go(.base) }
                .accessibilityIdentifier("cta")
        }
    }

    private func turnTo(_ n: Int) {
        guard n != page else { return }
        prevPage = page
        dir = n > page ? 1 : -1
        page = n
        flipping = true
        withAnimation(.easeOut(duration: DS.dFlip)) { flipping = false }
    }

    @ViewBuilder private func grid(_ p: Int) -> some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: DS.sp2), count: 3)
        LazyVGrid(columns: cols, spacing: DS.sp2) {
            if p == 0 {
                ForEach(BASE_TYPES, id: \.id) { b in
                    let top = topRarity(b.id)
                    cell(top == nil ? "？" : b.name, tone: top.map { DS.rarity($0) } ?? DS.faint,
                         found: top != nil)
                }
            } else {
                ForEach(UNIQUES, id: \.kind) { u in
                    let e = shell.state.data.compendium["unique:\(u.kind.rawValue)"]
                    cell(e == nil ? "？" : u.name,
                         tone: e == nil ? DS.faint : DS.rarity(.relic), found: e != nil)
                }
            }
        }
    }

    private func cell(_ text: String, tone: Color, found: Bool) -> some View {
        Text(text)
            .font(.delversLabel).foregroundStyle(tone)
            .lineLimit(1).minimumScaleFactor(0.6)
            .frame(maxWidth: .infinity, minHeight: DS.tap)
            .background {
                Surface(radius: DS.rSm)
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                            .strokeBorder(found ? tone.opacity(0.5) : DS.line, lineWidth: 1)
                    }
            }
            .opacity(found ? 1 : 0.5)
    }

    private func topRarity(_ baseId: String) -> Rarity? {
        for r in [Rarity.relic, .rare, .fine, .common] {
            if shell.state.data.compendium["\(baseId)|\(r.rawValue)"] != nil { return r }
        }
        return nil
    }

    private var foundCount: (Int, Int) {
        if page == 0 {
            let n = BASE_TYPES.filter { topRarity($0.id) != nil }.count
            return (n, BASE_TYPES.count)
        }
        let n = UNIQUES.filter { shell.state.data.compendium["unique:\($0.kind.rawValue)"] != nil }.count
        return (n, UNIQUES.count)
    }
}
