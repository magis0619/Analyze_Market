import DelversCore
import SwiftUI

// MARK: - 薬草園
//
// **反復作業を作らない。** 水やりも間引きも無い。植えたら放っておけば育ち、
// 育ったものは腐らない。することは「植える」と「収穫する」だけ。
//
// **板を縦に積まない。** 種はアイコンの升目に、たくわえは1行に、
// 畑の拡張は 3D の「＋」に移す。

struct GardenScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var tab = 0
    @State private var planting: Int?
    @State private var picked: String?
    @State private var stockOpen = false
    @State private var expanding = false

    static func moodFor(_ shell: Shell) -> Mood {
        let st = shell.state
        let g = st.data.garden
        return Mood(
            accent: Color(hex: 0x9BE08A),
            intensity: g.beds.isEmpty ? 0 : min(1, Double(st.readyCount()) / Double(g.beds.count)),
            slots: g.beds.indices.map { i in
                if let p = st.plotProgress(i) {
                    return PlotMood(kind: moodElementIndex(p.herb.element), ratio: p.ratio)
                }
                return PlotMood(kind: -1, ratio: 0)
            },
            canExpand: st.nextPlotCost() != nil
        )
    }

    var body: some View {
        Group {
            if planting != nil { plantSheet } else { main }
        }
        .overlay { if stockOpen { stockDrawer } }
        .overlay { if expanding { expandModal } }
    }

    private var main: some View {
        let st = shell.state
        let ready = st.readyCount()
        let growing = st.data.garden.beds.compactMap { $0 }.count
        let canExpand = st.nextPlotCost() != nil
        return ZStack {
            Scaffold(
                title: "薬草園", back: { shell.go(.base) },
                meta: ready > 0 ? "収穫 \(ready)" : "育成 \(growing)/\(st.data.garden.plots)",
                hero: true, anchorBottom: true
            ) {
                TabBar(items: ["畑", "種と薬"], selection: $tab, identifier: "tab")

                if tab == 0 {
                    Panel {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.sp2),
                                                 count: 2), spacing: DS.sp2) {
                            ForEach(st.data.garden.beds.indices, id: \.self) { i in bed(i) }
                        }
                        if canExpand {
                            Text("温室の「＋」を押すと畑を広げられる")
                                .font(.delversLabel).foregroundStyle(DS.faint)
                                .frame(maxWidth: .infinity)
                                .padding(.top, DS.sp1)
                        }
                    }
                } else {
                    Panel(label: "種を買う") {
                        herbGrid(mode: .buy)
                        if let p = picked { herbDetail(p) }
                        if let p = picked {
                            let h = herbDef(p)
                            TierButton(label: "\(h.name)の種を買う ・ \(num(h.seedCost))G",
                                       tier: .secondary,
                                       disabled: st.data.gold < h.seedCost) {
                                if shell.state.buySeed(p) {
                                    shell.changed(); shell.notify("\(h.name)の種を買った")
                                }
                            }
                            .accessibilityIdentifier("buy")
                        }
                    }
                    stockLine
                }
            } action: {
                if tab == 1 {
                    TierButton(label: "錬金工房へ", tier: .primary) { shell.go(.alchemy) }
                        .accessibilityIdentifier("cta")
                } else if ready > 0 {
                    TierButton(label: "育った \(ready)枠を収穫する", tier: .primary) {
                        let n = shell.state.harvestAll()
                        if n > 0 { Haptic.gain(); shell.changed(); shell.notify("+収穫 \(n)") }
                    }
                    .accessibilityIdentifier("cta")
                } else if seedCount > 0 && st.data.garden.beds.contains(where: { $0 == nil }) {
                    TierButton(label: "空いた畑に植える", tier: .primary) {
                        planting = st.data.garden.beds.firstIndex { $0 == nil }
                        picked = nil
                    }
                    .accessibilityIdentifier("cta")
                } else {
                    TierButton(label: "種を買う", tier: .primary) { tab = 1 }
                        .accessibilityIdentifier("cta")
                }
            }

            // 温室の「＋」に重ねる当たり判定。**押されるのはこのボタン。**
            // **板より上に置く**——下に置くと ScrollView がタップを飲み、
            // 「押せるように見えて押せない」壊れ方になる
            if tab == 0, canExpand, let at = shell.hotspots["expand"] {
                GeometryReader { geo in
                    Button { expanding = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.clear)
                            .frame(width: 68, height: 68)
                            .contentShape(Circle())
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityIdentifier("expand")
                    .accessibilityLabel("畑を広げる")
                    .position(x: min(max(at.x * geo.size.width, 40), geo.size.width - 40),
                              y: min(max(at.y * geo.size.height, 100), geo.size.height * 0.40))
                }
            }
        }
    }

    private var seedCount: Int {
        shell.state.data.garden.seeds.values.reduce(0, +)
    }

    /// 畑1枠。空き・育成中・収穫可の3状態しかない。
    private func bed(_ i: Int) -> some View {
        let st = shell.state
        return Group {
            if let p = st.plotProgress(i) {
                let done = p.ratio >= 1
                VStack(spacing: DS.sp1) {
                    ProgressRing(value: p.ratio, max: 1,
                                 text: done ? "収穫" : coarseDuration(p.remainingSec),
                                 label: p.herb.name,
                                 tone: done ? DS.up : DS.element(p.herb.element))
                    if done {
                        TierButton(label: "収穫 +\(p.herb.yieldCount)", tier: .secondary) {
                            let n = shell.state.harvest(i)
                            if n > 0 { Haptic.gain(); shell.changed(); shell.notify("+収穫 \(n)") }
                        }
                    }
                }
                .padding(DS.sp2)
                .frame(maxWidth: .infinity, minHeight: 116)
                .background {
                    Surface(radius: DS.rMd)
                        .overlay {
                            RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                                .strokeBorder(done ? DS.up.opacity(0.55) : DS.line, lineWidth: 1)
                        }
                        .shadow(color: done ? DS.up.opacity(0.4) : .clear, radius: 12)
                }
            } else {
                Button { planting = i; picked = nil } label: {
                    VStack(spacing: DS.sp1) {
                        Text("空き").font(.delversMicro).foregroundStyle(DS.faint)
                        Text("植える").font(.delversBody).foregroundStyle(DS.dim)
                    }
                    .frame(maxWidth: .infinity, minHeight: 116)
                    .background {
                        RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                            .foregroundStyle(DS.line)
                    }
                }
                .contentShape(Rectangle())   // 枠の中ならどこでも押せる
                .buttonStyle(PressStyle())
                .accessibilityIdentifier("bed-\(i)")
            }
        }
    }

    private enum GridMode { case plant, buy }

    /// 薬草の升目。名前・育つ時間・手持ちの数だけを出す。
    /// **効果や材料は出さない**——5種ぶん並べると縦長の一覧に戻る。
    private func herbGrid(mode: GridMode) -> some View {
        let g = shell.state.data.garden
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.sp2),
                                        count: 3), spacing: DS.sp2) {
            ForEach(HERBS, id: \.id) { h in
                let seeds = g.seeds[h.id] ?? 0
                let off = mode == .plant && seeds == 0
                Button { picked = h.id } label: {
                    ZStack(alignment: .topTrailing) {
                        VStack(spacing: 2) {
                            Text(h.glyph)
                                .font(.delversBody)
                                .frame(width: 30, height: 30)
                                .background {
                                    RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                        .fill(DS.element(h.element).opacity(0.12))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                                .strokeBorder(DS.element(h.element).opacity(0.6),
                                                              lineWidth: 1)
                                        }
                                }
                            Text(h.name).font(.delversLabel).foregroundStyle(DS.text)
                            Text("\(h.growSec / 60)分").font(.delversMicro).foregroundStyle(DS.faint)
                        }
                        .frame(maxWidth: .infinity, minHeight: 84)
                        .foregroundStyle(DS.element(h.element))
                        if seeds > 0 {
                            Text("\(seeds)")
                                .font(.delversMicro).monospacedDigit()
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(Capsule().fill(DS.gold))
                                .foregroundStyle(Color(hex: 0x14100A))
                                .offset(x: 4, y: -4)
                        }
                    }
                    .background {
                        Surface(radius: DS.rMd)
                            .overlay {
                                RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                                    .strokeBorder(picked == h.id
                                                  ? DS.element(h.element) : DS.line, lineWidth: 1)
                            }
                    }
                    .opacity(off ? 0.45 : 1)
                }
                .contentShape(Rectangle())   // 枠の中ならどこでも押せる
                .buttonStyle(PressStyle())
                .accessibilityIdentifier("herb-\(h.id)")
            }
        }
    }

    /// 押した1種の説明。何の材料になるかまで言う（畑へ戻る理由になる）
    private func herbDetail(_ id: String) -> some View {
        let h = herbDef(id)
        let use = POTIONS.first { $0.main == h.id }
        return VStack(spacing: DS.sp1) {
            Divider().overlay(DS.line)
            Row(label: h.name, value: "\(duration(Double(h.growSec)))で \(h.yieldCount)個")
            Row(label: "手持ちの種", value: "\(shell.state.data.garden.seeds[id] ?? 0)")
            if let u = use { Row(label: "\(u.name)の主材料", value: u.text, tone: DS.dim) }
        }
    }

    private var plantSheet: some View {
        let h = picked.map { herbDef($0) }
        let canPlant = h.map { (shell.state.data.garden.seeds[$0.id] ?? 0) > 0 } ?? false
        return SheetLayer(
            title: "何を植えるか",
            close: { planting = nil; picked = nil },
            hint: h != nil && !canPlant ? "この種を持っていない。種は「種と薬」で買える" : nil
        ) {
            herbGrid(mode: .plant)
            if let p = picked { herbDetail(p) } else {
                Text("植えるものを選ぶ").font(.delversLabel).foregroundStyle(DS.faint)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        } action: {
            HStack(spacing: DS.sp2) {
                TierButton(label: "やめる", tier: .quiet) { planting = nil; picked = nil }
                TierButton(label: h.map { "\($0.name)を植える" } ?? "選んでいない",
                           tier: .primary, disabled: !canPlant) {
                    if let i = planting, let p = picked, shell.state.plant(i, p) {
                        Haptic.commit()
                        shell.changed()
                        shell.notify("\(herbDef(p).name)を植えた")
                    }
                    planting = nil
                    picked = nil
                }
                .accessibilityIdentifier("plant")
            }
        }
    }

    /// たくわえの1行。空の板を2枚並べる代わりに、押したときだけ中身を開く。
    private var stockLine: some View {
        let g = shell.state.data.garden
        let kinds = HERBS.filter { (g.herbs[$0.id] ?? 0) > 0 }.count
        let bottles = POTIONS.reduce(0) { $0 + (g.potions[$1.id] ?? 0) }
        return Button { stockOpen = true } label: {
            HStack(spacing: DS.sp2) {
                Text("たくわえ").font(.delversMicro).tracking(1.6).foregroundStyle(DS.faint)
                Text("収穫した薬草 \(kinds)種 ・ 薬 \(bottles)本")
                    .font(.delversLabel).foregroundStyle(DS.text)
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
        .contentShape(Rectangle())   // 枠の中ならどこでも押せる
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("stock-open")
    }

    private var stockDrawer: some View {
        let g = shell.state.data.garden
        return ZStack(alignment: .bottom) {
            Color.black.opacity(0.6).ignoresSafeArea()
                .onTapGesture { stockOpen = false }
            VStack(spacing: DS.sp3) {
                Capsule().fill(DS.lineHi).frame(width: 40, height: 4).padding(.top, DS.sp2)
                Panel(label: "収穫した薬草") {
                    let xs = HERBS.filter { (g.herbs[$0.id] ?? 0) > 0 }
                    if xs.isEmpty {
                        Text("まだ何も採れていない").font(.delversLabel).foregroundStyle(DS.faint)
                    } else {
                        chips(xs.map { ($0.glyph + " " + $0.name, g.herbs[$0.id] ?? 0,
                                        DS.element($0.element)) })
                    }
                }
                Panel(label: "持っている薬") {
                    let xs = POTIONS.filter { (g.potions[$0.id] ?? 0) > 0 }
                    if xs.isEmpty {
                        Text("錬金工房で作れる").font(.delversLabel).foregroundStyle(DS.faint)
                    } else {
                        chips(xs.map { ("薬 " + $0.name, g.potions[$0.id] ?? 0,
                                        DS.element($0.element)) })
                    }
                }
                TierButton(label: "閉じる", tier: .quiet) { stockOpen = false }
                    .accessibilityIdentifier("stock-close")
            }
            .padding(.horizontal, DS.sp4).padding(.bottom, DS.sp5)
            .background {
                UnevenRoundedRectangle(topLeadingRadius: DS.rLg, topTrailingRadius: DS.rLg,
                                       style: .continuous)
                    .fill(.regularMaterial).ignoresSafeArea(edges: .bottom)
            }
        }
    }

    private func chips(_ xs: [(String, Int, Color)]) -> some View {
        FlowLayout(spacing: DS.sp2) {
            ForEach(Array(xs.enumerated()), id: \.offset) { _, x in
                Text("\(x.0) \(x.1)")
                    .font(.delversLabel).foregroundStyle(x.2)
                    .padding(.horizontal, DS.sp2).padding(.vertical, 4)
                    .background(Capsule().strokeBorder(x.2.opacity(0.4), lineWidth: 1))
            }
        }
    }

    private var expandModal: some View {
        let cost = shell.state.nextPlotCost() ?? 0
        let g = shell.state.data.garden
        return ConfirmSheet(
            title: "畑を \(g.plots) → \(g.plots + 1) 枠にする",
            detail: "同時に育てられる薬草が1種類増える。広げた枠は戻せない。",
            accent: "\(num(cost))G", confirmLabel: "広げる", danger: false,
            cancel: { expanding = false },
            confirm: {
                if shell.state.expandGarden() {
                    Haptic.gain(); shell.changed(); shell.notify("+畑がひと枠 広がった")
                }
                expanding = false
            }
        )
    }
}

// MARK: - 錬金工房
//
// **工程を操作させない。** 参考にした作品はすり潰す・煮る・かき混ぜるを手で
// 行わせるが、この作品の芯は「決めるのは3つだけ」なので、借りるのは絵作りだけ。
//
// **レシピは伏せない。** 材料が5種しかない今の規模では総当たりで終わってしまい、
// 「発見」ではなく「作業」になる。

struct AlchemyScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var selected: String?
    @State private var brewing = false

    static func moodFor(_ shell: Shell) -> Mood {
        Mood(accent: shell.alchemyAccent, intensity: shell.alchemyPower)
    }

    var body: some View {
        let st = shell.state
        let sel = POTIONS.first { $0.id == selected }
        return ZStack {
            // 押した薬の内訳は**鍋の上に浮かせる**。板として下に積むと、
            // 選ぶたびに一覧が伸びて鍋が画面から押し出される
            if let p = sel {
                VStack {
                    Spacer().frame(height: UIScreen.main.bounds.height * 0.14)
                    cauldronPop(p)
                    Spacer()
                }
                .padding(.horizontal, DS.sp4)
                .allowsHitTesting(false)
            }

            Scaffold(title: "錬金工房", back: { shell.go(.garden) },
                     hero: true, anchorBottom: true) {
                Panel(label: "手持ちの薬草") {
                    let stock = HERBS.filter { (st.data.garden.herbs[$0.id] ?? 0) > 0 }
                    if stock.isEmpty {
                        Text("薬草園で育てて収穫する").font(.delversLabel).foregroundStyle(DS.faint)
                    } else {
                        FlowLayout(spacing: DS.sp2) {
                            ForEach(stock, id: \.id) { h in
                                Text("\(h.glyph) \(h.name) \(st.data.garden.herbs[h.id] ?? 0)")
                                    .font(.delversLabel).foregroundStyle(DS.element(h.element))
                                    .padding(.horizontal, DS.sp2).padding(.vertical, 4)
                                    .background(Capsule().strokeBorder(
                                        DS.element(h.element).opacity(0.4), lineWidth: 1))
                            }
                        }
                    }
                }

                Panel(label: "作れる薬") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.sp2),
                                             count: 3), spacing: DS.sp2) {
                        ForEach(POTIONS, id: \.id) { p in potionCell(p) }
                    }
                    if let p = sel, !st.canBrew(p.id) {
                        Text(missing(p)).font(.delversLabel).foregroundStyle(DS.down)
                            .frame(maxWidth: .infinity).padding(.top, DS.sp1)
                    }
                }
            } action: {
                TierButton(label: brewing ? "調合している…"
                           : sel.map { "\($0.name)を作る" } ?? "作る薬を選ぶ",
                           tier: .primary,
                           disabled: brewing || sel == nil || !(sel.map { st.canBrew($0.id) } ?? false)) {
                    guard let p = sel else { return }
                    brewing = true
                    Haptic.commit()
                    shell.alchemyPower = 1
                    if shell.state.brew(p.id) { shell.changed() }
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(1.4))
                        brewing = false
                        shell.alchemyPower = 0.55
                        shell.notify("+《\(p.name)》ができた")
                    }
                }
                .accessibilityIdentifier("cta")
            }
        }
        .onAppear {
            // **着いた時点で主要動線を生かす。** 何も選んでいないと下の主要動線が
            // 死んだままで、親指の届く場所に押せないボタンが1つあるだけの画面になる。
            // 作れる薬があるなら、それを選んだ状態で始める
            if selected == nil {
                selected = POTIONS.first { shell.state.canBrew($0.id) }?.id
                    ?? POTIONS.first?.id
            }
            syncMood()
        }
        .onChange(of: selected) { _, _ in syncMood() }
    }

    private func syncMood() {
        let p = POTIONS.first { $0.id == selected }
        shell.alchemyAccent = p.map { DS.element($0.element) } ?? Color(hex: 0x6F7F9E)
        if !brewing { shell.alchemyPower = selected == nil ? 0.15 : 0.55 }
    }

    private func potionCell(_ p: PotionDef) -> some View {
        let ok = shell.state.canBrew(p.id)
        let held = shell.state.data.garden.potions[p.id] ?? 0
        return Button { selected = p.id } label: {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 2) {
                    Text("薬")
                        .font(.delversBody)
                        .frame(width: 30, height: 30)
                        .background {
                            RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                .fill(DS.element(p.element).opacity(0.12))
                                .overlay {
                                    RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                        .strokeBorder(DS.element(p.element).opacity(0.6), lineWidth: 1)
                                }
                        }
                    Text(p.name).font(.delversLabel).foregroundStyle(DS.text)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    // **理由は薄くしない。** 作れない札で一番読ませたいのは
                    // 「なぜ作れないか」なのに、そこが一番読めなくなっていた（2.3:1）
                    Text(ok ? "作れる" : "材料不足")
                        .font(.delversMicro).foregroundStyle(ok ? DS.up : DS.down)
                }
                .frame(maxWidth: .infinity, minHeight: 84)
                .foregroundStyle(DS.element(p.element))
                if held > 0 {
                    Text("\(held)")
                        .font(.delversMicro).monospacedDigit()
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Capsule().fill(DS.gold))
                        .foregroundStyle(Color(hex: 0x14100A))
                        .offset(x: 4, y: -4)
                }
            }
            .background {
                Surface(radius: DS.rMd)
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                            .strokeBorder(selected == p.id ? DS.element(p.element) : DS.line,
                                          lineWidth: 1)
                    }
            }
            // 作れないことは**縁と理由**で言う。札ごと薄くすると文字まで薄くなる
            .opacity(ok ? 1 : 0.92)
        }
        .contentShape(Rectangle())   // 枠の中ならどこでも押せる
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("potion-\(p.id)")
    }

    private func cauldronPop(_ p: PotionDef) -> some View {
        let g = shell.state.data.garden
        let mainHave = g.herbs[p.main] ?? 0
        let others = HERBS.filter { $0.id != p.main }.reduce(0) { $0 + (g.herbs[$1.id] ?? 0) }
        return VStack(alignment: .leading, spacing: 3) {
            Text(p.name).font(.delversBody).foregroundStyle(DS.text)
            Row(label: herbDef(p.main).name, value: "\(mainHave) / 2",
                tone: mainHave >= 2 ? DS.text : DS.down)
            Row(label: "他の薬草（何でもよい）", value: "\(others) / \(p.other)",
                tone: others >= p.other ? DS.text : DS.down)
            Text(p.text).font(.delversLabel).foregroundStyle(DS.dim).padding(.top, DS.sp1)
        }
        .padding(DS.sp3)
        .background {
            RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                .fill(DS.ground.opacity(0.62))
                .background(RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                    .fill(.thinMaterial))
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                        .strokeBorder(DS.lineHi, lineWidth: 1)
                }
        }
        .accessibilityIdentifier("cauldron-pop")
    }

    private func missing(_ p: PotionDef) -> String {
        let g = shell.state.data.garden
        var parts: [String] = []
        let shortMain = max(0, 2 - (g.herbs[p.main] ?? 0))
        if shortMain > 0 { parts.append("\(herbDef(p.main).name) あと\(shortMain)") }
        let others = HERBS.filter { $0.id != p.main }.reduce(0) { $0 + (g.herbs[$1.id] ?? 0) }
        let shortOther = max(0, p.other - others)
        if shortOther > 0 { parts.append("他の薬草 あと\(shortOther)") }
        return parts.joined(separator: " ・ ")
    }
}

/// 札を折り返して並べる。SwiftUI に既製が無いので最小限だけ書く。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX; y += rowH + spacing; rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}
