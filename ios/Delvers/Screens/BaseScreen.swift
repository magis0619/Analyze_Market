import DelversCore
import SwiftUI

/// 拠点（web 版 §2.2）。
///
/// **3D の上に重ねたチップをやめ、カードに戻した。**
///
/// チップは 3D の物の足元に浮いていて、「押せる物」なのか「絵の一部」なのかが
/// 見た目で決まらなかった。導線を絵に溶かすのは、ハンバーガーメニューや
/// ジェスチャ操作と同じ取引をしている——省スペースと引き換えに、
/// **見つけやすさを失う**。
/// <https://www.uxpin.com/studio/blog/mobile-navigation-patterns-pros-and-cons/>
/// 「hidden navigation reduces discoverability」
///
/// 一度は「同じ大きさのタイルが4枚並んでいても、そこに何があるかは
/// 文字を読むまで分からない」と考えてチップにした。その観察自体は正しかったが、
/// 出した答えが行きすぎていた。**絵は背景に残したまま、押す物は枠を持たせる**——
/// 3D は雰囲気を担い、導線はカードが担う。Apple HIG の deference
/// （UI は内容に譲る）も、導線まで消せとは言っていない。
struct BaseScreen: View {

    @EnvironmentObject var shell: Shell
    @State private var showDrawer = false

    private struct Prop {
        let id: String
        let label: String
        let icon: String
        let route: Route
        let count: (GameState) -> Int
    }

    /// 拠点の行き先。**名前は 3D の物が言う**ので、チップは記号と件数だけ。
    ///
    /// 幅の広い名札を5つ横に並べると、画面幅に収まらず必ず重なる
    /// （実際、4つが本文の上で重なった）。44pt の丸なら5つ並べても余る。
    /// 「次にやること」に当たる1つだけ名前を開く。
    private let props: [Prop] = [
        Prop(id: "sign", label: "派遣", icon: "signpost.right.fill",
             route: .dispatch, count: { _ in 0 }),
        Prop(id: "mail", label: "レポート", icon: "envelope.fill",
             route: .base, count: { $0.data.inbox.count }),
        Prop(id: "chest", label: "開封", icon: "shippingbox.fill",
             route: .opening, count: { $0.data.pending.count }),
        Prop(id: "shelf", label: "所持品", icon: "archivebox.fill",
             route: .inventory, count: { _ in 0 }),
        Prop(id: "garden", label: "薬草園", icon: "leaf.fill",
             route: .garden, count: { $0.readyCount() })
    ]

    var body: some View {
        let next = shell.nextAction()
        ZStack {
            Scaffold(
                title: "拠点",
                meta: shell.state.data.tier > 1 ? "難易度 \(shell.state.data.tier)" : nil,
                hero: true, heroFraction: 0.34, anchorBottom: true
            ) {
                nextBanner(next)
                ForEach(shell.state.availableJobs(), id: \.self) { job in
                    slotRow(job)
                }
                destinations(next)
                Button {
                    withAnimation(.easeOut(duration: DS.dPop)) { showDrawer = true }
                } label: {
                    HStack(spacing: DS.sp2) {
                        Image(systemName: "chevron.down").font(.system(size: 10))
                        Text("詳細").font(.delversLabel)
                        if shell.state.nextSlot()?.affordable == true {
                            Circle().fill(DS.gold).frame(width: 6, height: 6)
                        }
                    }
                    .foregroundStyle(DS.faint)
                    .tappableRow()
                }
                .buttonStyle(PressStyle())
                .accessibilityIdentifier("detail")
            } action: {
                TierButton(label: next.label, tier: .primary) { shell.go(next.route) }
                    .accessibilityIdentifier("cta")
            }


            if showDrawer { drawer }
        }
    }

    /// 行き先のカード。
    ///
    /// **枠を持たせ、名前を出す。** チップ方式では記号だけを出して
    /// 「名前は 3D の物が言う」としていたが、それは
    /// 「絵を見れば分かる」という作り手の思い込みに寄りかかっていた。
    /// 出典が言うとおり、常に見えている要素のほうが wayfinding は明快になる。
    private func destinations(_ next: Shell.NextAction) -> some View {
        // **5つとも折り返しの上に収める。** 2列だと3行になり、
        // 下2つがスクロールしないと見えなかった——
        // 「常に見えている」ために戻したのに、それでは元の木阿弥になる
        let cols = Array(repeating: GridItem(.flexible(), spacing: DS.sp2), count: 3)
        return LazyVGrid(columns: cols, spacing: DS.sp2) {
            ForEach(props, id: \.id) { p in
                destinationCard(p, isNext: next.prop == p.id)
            }
        }
    }

    private func destinationCard(_ p: Prop, isNext: Bool) -> some View {
        let n = p.count(shell.state)
        return Button {
            if p.id == "mail", let first = shell.state.data.inbox.first {
                shell.go(.report(first))
            } else {
                shell.go(p.route)
            }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: p.icon)
                    .font(.system(size: 18))
                    .foregroundStyle(isNext ? DS.gold : DS.dim)
                Text(p.label).font(.delversLabel).foregroundStyle(DS.text)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if n > 0 {
                    Text("\(n)件").font(.delversMicro).foregroundStyle(DS.gold)
                } else if isNext {
                    Text("ここから").font(.delversMicro).foregroundStyle(DS.gold)
                } else {
                    Text(" ").font(.delversMicro)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, DS.sp1)
            .frame(minHeight: 74)
            .background {
                Surface(radius: DS.rMd)
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                            .strokeBorder(isNext ? DS.gold.opacity(0.75) : DS.line,
                                          lineWidth: 1)
                    }
            }
            .shadow(color: isNext ? DS.gold.opacity(0.35) : .clear, radius: 8)
        }
        .contentShape(Rectangle())   // 枠の中ならどこでも押せる
        .buttonStyle(PressStyle())
        .accessibilityIdentifier("prop-\(p.id)")
    }

    private func nextBanner(_ next: Shell.NextAction) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("次にやること").font(.delversMicro).tracking(1.6).foregroundStyle(DS.gold)
            Text(next.why)
                .font(.delversBody).foregroundStyle(DS.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DS.sp3)
        .background {
            RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                .fill(LinearGradient(colors: [DS.gold.opacity(0.12), DS.gold.opacity(0.02)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                        .strokeBorder(DS.gold.opacity(0.3), lineWidth: 1)
                }
        }
        .accessibilityIdentifier("next-why")
    }

    /// 冒険者1人ぶん。派遣中は進み具合と、そこまでの出来事を出す。
    private func slotRow(_ job: JobId) -> some View {
        let st = shell.state
        let def = jobDef(job)
        let running = st.data.dispatches.first { $0.jobId == job }
        // **潜行中の枠は押せる。** 一覧に出せるのは「行き先と残り時間」までで、
        // それ以上は場所を取る。出典の言う「一覧で全部言わず、押せば詳しく」に沿う
        return Panel(label: running == nil ? "待機中" : "潜行中") {
            HStack(spacing: DS.sp3) {
                Text(String(def.name.prefix(1)))
                    .font(.delversTitle(20))
                    .frame(width: 46, height: 46)
                    .background {
                        RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                            .strokeBorder(running == nil ? DS.line : DS.gold.opacity(0.5), lineWidth: 1)
                    }
                    .foregroundStyle(running == nil ? DS.dim : DS.gold)

                VStack(alignment: .leading, spacing: 3) {
                    Text(def.name).font(.delversBody).foregroundStyle(DS.text)
                    if let d = running {
                        let p = st.progressOf(d)
                        Text("\(stageDef(d.stageId).name) ・ 残り \(coarseDuration(p.remainingSec))")
                            .font(.delversLabel).foregroundStyle(DS.dim)
                        ProgressView(value: p.ratio)
                            .tint(DS.gold)
                            .scaleEffect(y: 0.6, anchor: .center)
                    } else {
                        let eq = st.equipped(job)
                        let w = st.itemById(eq.weapon), a = st.itemById(eq.armor)
                        Text("物 \(w?.power ?? 0) ・ 盾 \(a?.power ?? 0) ・ いつでも出せる")
                            .font(.delversLabel).foregroundStyle(DS.dim)
                    }
                }
                Spacer(minLength: 0)
                if let d = running {
                    Button { shell.go(.status(d.id)) } label: {
                        HStack(spacing: 3) {
                            Text("状況").font(.delversLabel)
                            Image(systemName: "chevron.right").font(.system(size: 9))
                        }
                        .foregroundStyle(DS.gold)
                        .frame(minWidth: 56, minHeight: DS.tap)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityIdentifier("status-\(d.jobId.rawValue)")
                }
                if running == nil {
                    Button {
                        shell.stageContext = nil
                        shell.go(.dispatch)
                    } label: {
                        HStack(spacing: 3) {
                            Text("出発").font(.delversLabel)
                            Image(systemName: "chevron.right").font(.system(size: 9))
                        }
                        .foregroundStyle(DS.gold)
                        .frame(minWidth: 56, minHeight: DS.tap)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                }
            }
        }
    }

    /// 詳細。今すぐ押さないものを1箇所にまとめる。
    /// 拠点の本文と入れ替えず、**上に重ねる**——ここを見るのは
    /// 「ついでに確認する」動作であって、画面を移る動作ではない。
    private var drawer: some View {
        let st = shell.state
        let kinds = BASE_TYPES.count + UNIQUES.count
        var found = Set<String>()
        for k in st.data.compendium.keys {
            found.insert(k.hasPrefix("unique:") ? k : String(k.split(separator: "|")[0]))
        }
        let hire = st.nextSlot()
        return ZStack(alignment: .bottom) {
            Color.black.opacity(0.6).ignoresSafeArea()
                .onTapGesture { withAnimation { showDrawer = false } }
            VStack(spacing: DS.sp3) {
                Capsule().fill(DS.lineHi).frame(width: 40, height: 4).padding(.top, DS.sp2)
                Panel(label: "進み具合") {
                    HStack(spacing: DS.sp3) {
                        ProgressRing(value: Double(st.data.clearedStages.count),
                                     max: Double(STAGES.count),
                                     text: "\(st.data.clearedStages.count)/\(STAGES.count)",
                                     label: "踏破", tone: DS.up)
                        Button { shell.go(.compendium) } label: {
                            ProgressRing(value: Double(found.count), max: Double(kinds),
                                         text: "\(found.count)", label: "図鑑",
                                         tone: DS.rarity(.rare))
                        }
                        .contentShape(Rectangle())   // 枠の中ならどこでも押せる
                        .buttonStyle(PressStyle())
                        .accessibilityIdentifier("compendium")
                        Button { shell.go(.inventory) } label: {
                            ProgressRing(value: Double(st.data.inventory.count), max: nil,
                                         text: "\(st.data.inventory.count)", label: "所持",
                                         tone: st.data.inventory.count >= 150 ? DS.down : DS.def)
                        }
                        .contentShape(Rectangle())   // 枠の中ならどこでも押せる
                        .buttonStyle(PressStyle())
                        .accessibilityIdentifier("inventory")
                    }
                    .frame(maxWidth: .infinity)
                }
                if let hire {
                    Panel(label: "次の冒険者") {
                        Row(label: "\(hire.index + 1)人目",
                            value: hire.stageDone ? "\(num(hire.cost))G"
                                                  : "ステージ\(hire.needStage)の踏破が必要",
                            tone: hire.stageDone ? DS.gold : DS.dim)
                        if hire.stageDone {
                            TierButton(label: "雇う", tier: .secondary,
                                       disabled: !hire.affordable) {
                                if shell.state.unlockSlot() {
                                    shell.changed()
                                    shell.notify("冒険者を雇った")
                                }
                            }
                        }
                    }
                }
                TierButton(label: "閉じる", tier: .quiet) {
                    withAnimation { showDrawer = false }
                }
            }
            .padding(.horizontal, DS.sp4)
            .padding(.bottom, DS.sp5)
            .background {
                UnevenRoundedRectangle(topLeadingRadius: DS.rLg, topTrailingRadius: DS.rLg,
                                       style: .continuous)
                    .fill(.regularMaterial)
                    .ignoresSafeArea(edges: .bottom)
            }
            .transition(.move(edge: .bottom))
        }
    }
}
