import DelversCore
import SwiftUI

/// 拠点（web 版 §2.2）。
///
/// **タイルをやめて物にする。** 同じ大きさ・同じ角丸のタイルが4枚並んでいると、
/// 押す先が4つあることは分かっても、そこに何があるかは文字を読むまで分からない。
/// 看板・郵便受け・宝箱・棚・温室なら、絵を見た時点で
/// 「送り出す／読む／開ける／しまう／育てる」が分かる。
///
/// 名札は 3D の**足元**にぶら下げる。中心に置くと名札が物の胴を隠す。
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
                hero: true, heroFraction: 0.46, anchorBottom: true
            ) {
                nextBanner(next)
                ForEach(shell.state.availableJobs(), id: \.self) { job in
                    slotRow(job)
                }
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
                    .frame(maxWidth: .infinity, minHeight: DS.tap)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("detail")
            } action: {
                TierButton(label: next.label, tier: .primary) { shell.go(next.route) }
                    .accessibilityIdentifier("cta")
            }


            GeometryReader { geo in
                let placed = layout(in: geo.size)
                ForEach(props, id: \.id) { p in
                    if let at = placed[p.id] {
                        propTag(p, isNext: next.prop == p.id).position(x: at.x, y: at.y)
                    }
                }
            }
            // **板より上に置く。** 下に置くと ScrollView がタップを飲み、
            // 「押せるように見えて押せない」——スクショにも出ない壊れ方になる。
            // 空いている場所は GeometryReader が素通しするので、本文は塞がない
            .allowsHitTesting(true)

            if showDrawer { drawer }
        }
    }

    /// チップの置き場所を決める。
    ///
    /// 3D 由来の座標をそのまま使うと2つのことが起きる:
    ///   ・板の上や画面の外へ落ちる（カメラを動かすたびに変わる）
    ///   ・**チップ同士が重なる**（物が近づくと投影も近づく）
    /// 留めてから、近すぎるものを縦にずらす。押せなくなるほうが困る。
    private func layout(in size: CGSize) -> [String: CGPoint] {
        let minGapX: CGFloat = 52
        let minGapY: CGFloat = 46
        var out: [String: CGPoint] = [:]
        var taken: [CGPoint] = []
        // 左から順に置く。順番を固定しないと、フレームごとに入れ替わって落ち着かない
        let ordered = props.compactMap { p -> (String, CGPoint)? in
            guard let at = shell.hotspots[p.id] else { return nil }
            return (p.id, CGPoint(x: at.x * size.width, y: at.y * size.height + 26))
        }.sorted { $0.1.x < $1.1.x }

        for (id, raw) in ordered {
            var x = min(max(raw.x, 34), size.width - 34)
            var y = min(max(raw.y, 96), size.height * 0.40)
            // ぶつかっていたら、空くまで上へ逃がす
            var guardCount = 0
            while taken.contains(where: { abs($0.x - x) < minGapX && abs($0.y - y) < minGapY }),
                  guardCount < 8 {
                y -= minGapY
                if y < 96 { y = size.height * 0.40; x = min(x + minGapX, size.width - 34) }
                guardCount += 1
            }
            taken.append(CGPoint(x: x, y: y))
            out[id] = CGPoint(x: x, y: y)
        }
        return out
    }

    // MARK: - 部品

    /// 3D の物に付けるチップ。**押されるのはこれ。**
    /// 3D 側に当たり判定を持たせると、この動線が「44pt あるか」
    /// 「本当に押せるか」の検査からまるごと消える。
    private func propTag(_ p: Prop, isNext: Bool) -> some View {
        let n = p.count(shell.state)
        return Button {
            if p.id == "mail" {
                if let id = shell.state.data.inbox.first { shell.go(.report(id)) }
            } else {
                shell.go(p.route)
            }
        } label: {
            HStack(spacing: DS.sp1) {
                Image(systemName: p.icon).font(.system(size: 15, weight: .medium))
                if isNext {
                    Text(p.label).font(.delversLabel).lineLimit(1).fixedSize()
                }
                if n > 0 {
                    Text("\(n)")
                        .font(.delversMicro).monospacedDigit()
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Capsule().fill(DS.gold))
                        .foregroundStyle(Color(hex: 0x14100A))
                }
            }
            .padding(.horizontal, isNext || n > 0 ? DS.sp3 : 0)
            .frame(minWidth: DS.tap, minHeight: DS.tap)
            // 焚き火の真上に来ることがある。**地の色を敷かないと 1.9:1 まで落ちる**
            .background(Capsule().fill(DS.ground.opacity(0.70))
                .background(Capsule().fill(.ultraThinMaterial)))
            .overlay(Capsule().strokeBorder(isNext ? DS.gold.opacity(0.75) : DS.line, lineWidth: 1))
            .foregroundStyle(isNext ? DS.gold : DS.dim)
            .shadow(color: isNext ? DS.gold.opacity(0.5) : .clear, radius: 8)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("prop-\(p.id)")
        .accessibilityLabel(p.label)
    }

    /// 「次にやること」。**理由を1行だけ言う。**
    /// 理由が無いまま指示だけ出すと、言われた通りに押すだけの人になる。
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
                    .buttonStyle(.plain)
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
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("compendium")
                        Button { shell.go(.inventory) } label: {
                            ProgressRing(value: Double(st.data.inventory.count), max: nil,
                                         text: "\(st.data.inventory.count)", label: "所持",
                                         tone: st.data.inventory.count >= 150 ? DS.down : DS.def)
                        }
                        .buttonStyle(.plain)
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
