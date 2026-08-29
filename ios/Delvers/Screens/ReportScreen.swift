import DelversCore
import SwiftUI

/// 帰還レポート（web 版 §2.5）。
///
/// **見どころ3行がこの画面で最も重要。** なぜその結果になったかが分からないと、
/// 完全な運ゲーに感じられる。
///
/// **板を8枚積むのをやめ、1枚の巻物にする。** 見出し・見どころ・道中・数字・
/// 次の一手・戦利品——どれも「1回の報告」の一部なのに、同じ角丸の板に切り分けて
/// 縦に積んでいた。境目の数だけ「別の話が始まった」と読めてしまう。
struct ReportScreen: View {
    @EnvironmentObject var shell: Shell
    var dispatchId: String
    @State private var unrolled = false

    private var result: RunResult? { shell.state.data.results[dispatchId] }
    private var info: Dispatch? { shell.state.dispatchInfo(dispatchId) }
    private var stage: StageDef { stageDef(info?.stageId ?? 1) }
    private var died: Bool { result?.outcome == .death }

    var body: some View {
        Scaffold(
            title: "帰還レポート", back: { done() }, meta: stage.name,
            hero: true, anchorBottom: false
        ) {
            if let r = result {
                if died { deathBanner }
                scroll(r)
            } else {
                Panel { Text("レポートが見つからない").foregroundStyle(DS.dim) }
            }
        } action: {
            let hasLoot = !died && !(result?.loot.isEmpty ?? true)
            TierButton(label: hasLoot ? "未鑑定品 \(result?.loot.count ?? 0)個を開封する" : "拠点へ戻る",
                       tier: hasLoot ? .primary : .quiet) { done() }
                .accessibilityIdentifier("cta")
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.62)) { unrolled = true }
            announce()
        }
    }

    private func done() {
        shell.state.data.inbox.removeAll { $0 == dispatchId }
        shell.changed()
        if !died && !shell.state.data.pending.isEmpty {
            shell.go(.opening)
        } else {
            shell.go(.base)
        }
    }

    private func announce() {
        guard let r = result else { return }
        if died {
            shell.notify("装備2点を失った")
        } else {
            if r.gold > 0 { shell.notify("+\(num(r.gold))G") }
            if !r.loot.isEmpty { shell.notify("未鑑定品 \(r.loot.count)個") }
        }
    }

    private var deathBanner: some View {
        Text("戦　死")
            .font(.delversTitle(26)).tracking(8)
            .foregroundStyle(DS.down)
            .frame(maxWidth: .infinity)
            .padding(.vertical, DS.sp3)
            .background {
                RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                    .fill(DS.down.opacity(0.12))
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                            .strokeBorder(DS.down.opacity(0.5), lineWidth: 1)
                    }
            }
    }

    // MARK: - 巻物
    //
    // 紙は重ねた勾配だけで作る。**外部画像は読まない**——資産規約はここにも効かせる。
    // 巻物の中では役割色ごと入れ替える。地だけ変えて墨を変え忘れると、
    // 白い字が薄茶の紙に消える（web 版で実際にやった）。

    private func scroll(_ r: RunResult) -> some View {
        VStack(alignment: .leading, spacing: DS.sp2) {
            headline(r)
            seal("見どころ")
            ForEach(Array(r.highlights.enumerated()), id: \.offset) { i, h in
                bullet(h, key: i == 0)
            }

            seal("この回の数字")
            figures([("与えた", num(r.stats.dealt)), ("受けた", num(r.stats.taken)),
                     ("撃破", "\(r.stats.kills)")])
            figures([("会心", "\(r.stats.crits)/\(r.stats.hits)"),
                     ("最大の一撃", num(r.stats.biggestHit)),
                     ("回避", "\(r.stats.evaded)")])

            if let pid = info?.potionId {
                let p = potionDef(pid)
                seal("持たせた薬")
                HStack {
                    Text(p.name).font(.delversBody).foregroundStyle(Ink.text)
                    Spacer()
                    Text(r.stats.potionSaved > 0 ? "-\(num(r.stats.potionSaved))" : "出番なし")
                        .font(.delversLabel)
                        .foregroundStyle(r.stats.potionSaved > 0 ? Ink.up : Ink.faint)
                }
            }

            if died {
                seal("失ったもの")
                let lost = shell.state.data.lost[dispatchId] ?? []
                if lost.isEmpty {
                    Text("装備していた2点").font(.delversLabel).foregroundStyle(Ink.faint)
                } else {
                    ForEach(lost, id: \.id) { it in
                        HStack {
                            Text(itemName(it)).font(.delversLabel).foregroundStyle(Ink.text)
                            Spacer()
                            Text(rarityLabel(it.rarity)).font(.delversMicro).foregroundStyle(Ink.dim)
                        }
                    }
                }
                Text("冒険者本人は無事に帰還した。最低限の装備は支給される。")
                    .font(.delversLabel).foregroundStyle(Ink.dim)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DS.sp1)
            } else {
                seal("戦利品")
                ForEach(0..<min(4, r.loot.count), id: \.self) { _ in
                    HStack {
                        Text("未鑑定品").font(.delversLabel).foregroundStyle(Ink.text)
                        Spacer()
                        Text("開封すると分かる").font(.delversMicro).foregroundStyle(Ink.faint)
                    }
                }
                if r.loot.count > 4 {
                    Text("ほか \(r.loot.count - 4)個").font(.delversMicro).foregroundStyle(Ink.faint)
                }
                HStack {
                    Text("持ち帰った金").font(.delversLabel).foregroundStyle(Ink.dim)
                    Spacer()
                    Text("\(num(r.gold))G").font(.delversBody).foregroundStyle(Ink.gold)
                }
                .padding(.top, DS.sp1)
            }

            Divider().overlay(Ink.line).padding(.top, DS.sp2)
            Text(signature(r))
                .font(.delversMicro).foregroundStyle(Ink.faint)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, DS.sp4)
        .padding(.vertical, DS.sp5)
        .background(paper)
        .scaleEffect(y: unrolled ? 1 : 0.02, anchor: .top)
        .opacity(unrolled ? 1 : 0.2)
        .accessibilityIdentifier("scroll")
    }

    private var paper: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0xF3EBD8), Color(hex: 0xDFCEA9)],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(hex: 0xFFF8EC).opacity(0.9), .clear],
                           center: .top, startRadius: 20, endRadius: 320)
        }
        .clipShape(TornEdges())
    }

    private func headline(_ r: RunResult) -> some View {
        let parts = r.headline.split(separator: "／", maxSplits: 1).map(String.init)
        let tone: Color = died ? Ink.down : r.bossDefeated ? Ink.up : Ink.gold
        return VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: DS.sp2) {
                Text(parts.first ?? "")
                    .font(.delversTitle(24)).foregroundStyle(tone)
                Text("\(r.depth) / \(r.encountersTotal)")
                    .font(.delversLabel).foregroundStyle(Ink.faint)
            }
            if parts.count > 1 {
                Text(parts[1]).font(.delversLabel).foregroundStyle(Ink.dim)
            }
        }
        .accessibilityIdentifier("headline")
    }

    /// 章の区切り。**線だけにしない**——同じ太さの罫が並ぶと、それは表の行になる。
    private func seal(_ label: String) -> some View {
        HStack(spacing: DS.sp2) {
            Rectangle().fill(Ink.line).frame(height: 1)
            Text(label)
                .font(.delversMicro).tracking(1.4)
                .foregroundStyle(Ink.seal)
                .padding(.horizontal, DS.sp3).padding(.vertical, 3)
                .background(Capsule().fill(Ink.seal.opacity(0.14)))
                .overlay(Capsule().strokeBorder(Ink.seal.opacity(0.4), lineWidth: 1))
            Rectangle().fill(Ink.line).frame(height: 1)
        }
        .padding(.top, DS.sp3)
    }

    private func bullet(_ text: String, key: Bool) -> some View {
        HStack(alignment: .top, spacing: DS.sp2) {
            Circle().fill(key ? Ink.gold : Ink.dim)
                .frame(width: 5, height: 5).padding(.top, 6)
            Text(text)
                .font(.delversBody).foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func figures(_ cells: [(String, String)]) -> some View {
        HStack(spacing: 1) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, c in
                VStack(spacing: 2) {
                    Text(c.0).font(.delversMicro).foregroundStyle(Ink.dim)
                    Text(c.1).font(.delversTitle(17)).foregroundStyle(Ink.text)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, DS.sp2)
                .background(Ink.surface)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.rSm, style: .continuous))
    }

    private func signature(_ r: RunResult) -> String {
        let job = info.map { jobDef($0.jobId).name } ?? ""
        let rule = info.map { retreatRuleDef($0.retreatRule).name } ?? ""
        return "\(job) ・ \(rule) ・ \(bossName(stage.id))\(r.bossDefeated ? " 撃破" : " 未到達")"
    }
}

/// 紙の墨。
///
/// **値は勘で置かない。** 紙の代表色に対して本文の基準 4.5:1 を満たすところまで
/// 暗くしてある。web 版では暗い画面の色をそのまま持ち込んで、
/// `faint` が 2.8:1、`spd` が 3.5:1 しか出ていなかった。
enum Ink {
    static let text = Color(hex: 0x2B2116)
    static let dim = Color(hex: 0x5D4A35)
    static let faint = Color(hex: 0x655140)
    static let line = Color(red: 84/255, green: 62/255, blue: 40/255).opacity(0.30)
    static let surface = Color(red: 1, green: 0.97, blue: 0.91).opacity(0.34)
    static let up = Color(hex: 0x2D6038)
    static let down = Color(hex: 0x7A2F22)
    static let gold = Color(hex: 0x7A5510)
    static let seal = Color(hex: 0x7D3A2A)
}

/// 端を不揃いに切る。**決め打ちの座標**にして、毎フレーム形が変わらないようにする。
struct TornEdges: Shape {
    func path(in rect: CGRect) -> Path {
        let top: [CGFloat] = [0.012, 0.002, 0.014, 0.003, 0.015, 0.004, 0.013, 0.002, 0.014, 0.004, 0.012, 0.003]
        let bot: [CGFloat] = [0.988, 0.998, 0.985, 0.997, 0.986, 0.998, 0.987, 0.996, 0.985, 0.997, 0.986, 0.998]
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.height * top[0]))
        for (i, v) in top.enumerated() {
            p.addLine(to: CGPoint(x: rect.width * CGFloat(i) / CGFloat(top.count - 1),
                                  y: rect.height * v))
        }
        for (i, v) in bot.enumerated().reversed() {
            p.addLine(to: CGPoint(x: rect.width * CGFloat(i) / CGFloat(bot.count - 1),
                                  y: rect.height * v))
        }
        p.closeSubpath()
        return p
    }
}
