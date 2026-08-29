import DelversCore
import SwiftUI

// 装備の見せ方。**同じ品はどの画面でも同じ顔にする**——
// 一覧・升目・台座・レポートで別の見え方をすると、同じ物だと分からない。

/// 武器なら主属性の1文字、防具なら「盾」。
///
/// **絵文字は使わない。** ⚔ や 🛡 は環境によって細い線に潰れ、
/// どの行も同じ見た目になる（web 版で一度踏んだ）。漢字1文字は必ず出る。
func itemGlyph(_ it: Item) -> String {
    guard it.slot == .weapon else { return "盾" }
    return DS.elementName(dominantElement(it.element))
}

func itemGlyphColor(_ it: Item) -> Color {
    it.slot == .weapon ? DS.element(dominantElement(it.element)) : DS.def
}

/// その品の強さ。武器は秒間火力、防具は防御。
func itemScore(_ it: Item) -> Int {
    if it.slot == .weapon {
        let speed = it.speed != 0 ? it.speed : baseDef(it.baseId).speed
        return jsRoundInt(Double(it.power) * speed)
    }
    return it.power
}

/// **その派遣先での**実効値。素の数字だけ出していると
/// 「一番大きい数字を装備する」以外の選択が生まれない（web 版 §2 の判断）。
func effectiveScore(_ it: Item, _ stage: StageDef) -> Int {
    guard it.slot == .weapon else { return it.power }
    let speed = it.speed != 0 ? it.speed : baseDef(it.baseId).speed
    var total = 0.0
    for s in it.element.shares {
        var mul = 1.0
        if stage.resists.contains(s.element) { mul = 0.5 }
        else if stage.weakTo == s.element { mul = 1.5 }
        total += Double(it.power) * s.value * mul
    }
    if it.element.shares.isEmpty { total = Double(it.power) }
    return jsRoundInt(total * speed)
}

func itemName(_ it: Item) -> String {
    let base = baseDef(it.baseId).name
    guard let u = it.unique else { return base }
    return "《\(uniqueDef(u).name)》\(base)"
}

func rarityLabel(_ r: Rarity) -> String {
    switch r {
    case .common: return "並"
    case .fine: return "上質"
    case .rare: return "稀少"
    case .relic: return "遺物"
    }
}

/// 装備の升目。
///
/// **文字を置かない。** 行の一覧は1件につき4つの語を並べていて、
/// 24件で96語になり、読む前に諦める画面だった。
/// 置くのは記号と、装備中との**差**だけ。それ以上は押したときに台座で見せる。
/// レアリティは**縁の発光**で言う。
struct ItemTile: View {
    var item: Item
    var compareTo: Item?
    var stage: StageDef?
    var selected: Bool
    var action: () -> Void

    private var score: Int {
        stage.map { effectiveScore(item, $0) } ?? itemScore(item)
    }
    private var delta: Int? {
        guard let c = compareTo, c.id != item.id else { return nil }
        let base = stage.map { effectiveScore(c, $0) } ?? itemScore(c)
        let d = score - base
        return d == 0 ? nil : d
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                Surface(radius: DS.rMd)
                RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                    .strokeBorder(selected ? DS.gold : DS.rarity(item.rarity).opacity(0.55),
                                  lineWidth: selected ? 2 : 1)
                VStack(spacing: 2) {
                    Text(itemGlyph(item))
                        .font(.delversTitle(19))
                        .foregroundStyle(itemGlyphColor(item))
                    Text(baseDef(item.baseId).name)
                        .font(.delversMicro)
                        .foregroundStyle(DS.dim)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                if item.locked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 8)).foregroundStyle(DS.gold)
                        .frame(maxWidth: .infinity, maxHeight: .infinity,
                               alignment: .topLeading)
                        .padding(5)
                }
                if let d = delta {
                    Text("\(d > 0 ? "▲" : "▼")\(abs(d))")
                        .font(.delversMicro).monospacedDigit()
                        .foregroundStyle(d > 0 ? DS.up : DS.down)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Capsule().fill(DS.ground.opacity(0.85)))
                        .frame(maxWidth: .infinity, maxHeight: .infinity,
                               alignment: .bottomTrailing)
                        .padding(3)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .shadow(color: DS.rarity(item.rarity).opacity(glowStrength), radius: glowRadius)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tile-\(item.id)")
        .accessibilityLabel("\(itemName(item)) \(rarityLabel(item.rarity))")
    }

    private var glowStrength: Double {
        switch item.rarity {
        case .common: return 0
        case .fine: return 0.35
        case .rare: return 0.5
        case .relic: return 0.7
        }
    }
    private var glowRadius: CGFloat {
        switch item.rarity {
        case .common: return 0
        case .fine: return 6
        case .rare: return 10
        case .relic: return 14
        }
    }
}

/// 台座に載せた候補と、今の装備を並べる。
/// **差を数字で言う**——「良さそう」では判断できない。
struct CompareCard: View {
    var current: Item?
    var candidate: Item
    var stage: StageDef

    var body: some View {
        VStack(spacing: DS.sp2) {
            HStack(alignment: .top, spacing: DS.sp2) {
                column("現在", current)
                column("候補", candidate)
            }
            let d = effectiveScore(candidate, stage) - (current.map { effectiveScore($0, stage) } ?? 0)
            Text(d == 0 ? "\(stage.name)では互角"
                 : d > 0 ? "\(stage.name)ではこの候補のほうが \(d) 強い"
                         : "\(stage.name)では今の装備のほうが \(-d) 強い")
                .font(.delversLabel)
                .foregroundStyle(d > 0 ? DS.up : d < 0 ? DS.down : DS.dim)
                .frame(maxWidth: .infinity)
                .padding(.vertical, DS.sp2)
                .background {
                    RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                        .fill((d > 0 ? DS.up : d < 0 ? DS.down : DS.dim).opacity(0.10))
                }
        }
    }

    private func column(_ title: String, _ it: Item?) -> some View {
        VStack(alignment: .leading, spacing: DS.sp1) {
            Text(title).font(.delversMicro).tracking(1.4).foregroundStyle(DS.faint)
            if let it {
                Text(rarityLabel(it.rarity))
                    .font(.delversMicro).foregroundStyle(DS.rarity(it.rarity))
                Text(itemName(it)).font(.delversBody).foregroundStyle(DS.text)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                if it.slot == .weapon {
                    Row(label: "秒間", value: "\(effectiveScore(it, stage))")
                    Row(label: "威力", value: "\(it.power)")
                    Row(label: "速度", value: String(format: "%.2f", it.speed))
                    Row(label: "会心", value: String(format: "%.1f%%", it.crit))
                } else {
                    Row(label: "防御", value: "\(it.power)")
                }
                ForEach(Array(it.affixes.enumerated()), id: \.offset) { _, a in
                    HStack {
                        Text(affixDef(a.kind).name).font(.delversMicro).foregroundStyle(DS.dim)
                        Spacer()
                        Text(String(repeating: "★", count: a.tier)
                             + String(repeating: "☆", count: 5 - a.tier))
                            .font(.delversMicro).foregroundStyle(DS.gold)
                    }
                }
            } else {
                Text("なし").font(.delversLabel).foregroundStyle(DS.faint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DS.sp3)
        .background {
            Surface(radius: DS.rMd)
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                        .strokeBorder(DS.line, lineWidth: 1)
                }
        }
    }
}

/// 一覧の1行。所持品のように「名前と効果で選り分ける」画面はこちら。
struct ItemRow: View {
    var item: Item
    var stage: StageDef?
    var showSell = false
    var equipped = false
    var action: (() -> Void)?

    var body: some View {
        let content = HStack(spacing: DS.sp3) {
            ZStack {
                RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                    .strokeBorder(DS.rarity(item.rarity).opacity(0.6), lineWidth: 1)
                Text(itemGlyph(item)).font(.delversLabel)
                    .foregroundStyle(itemGlyphColor(item))
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(itemName(item)).font(.delversBody).foregroundStyle(DS.text)
                        .lineLimit(1)
                    if item.locked {
                        Image(systemName: "lock.fill").font(.system(size: 9))
                            .foregroundStyle(DS.gold)
                    }
                }
                Text(meta).font(.delversLabel).foregroundStyle(DS.dim).lineLimit(1)
            }
            Spacer(minLength: 0)
            if equipped {
                Text("装備中").font(.delversMicro).foregroundStyle(DS.gold)
            } else if showSell {
                Text("\(num(sellValue(item)))G").font(.delversLabel).foregroundStyle(DS.dim)
            }
        }
        .padding(.horizontal, DS.sp3)
        .frame(minHeight: 52)
        .background { Surface(radius: DS.rSm) }

        if let action {
            Button(action: action) { content }
                .buttonStyle(.plain)
                .accessibilityIdentifier("row-\(item.id)")
        } else {
            content
        }
    }

    private var meta: String {
        var parts = [rarityLabel(item.rarity)]
        let score = stage.map { effectiveScore(item, $0) } ?? itemScore(item)
        parts.append(item.slot == .weapon ? "秒間\(score)" : "防御\(score)")
        if !item.affixes.isEmpty { parts.append("効果\(item.affixes.count)") }
        return parts.joined(separator: " ・ ")
    }
}
