import SwiftUI
import DelversCore

// 見た目の語彙（web 版 docs/UI-SPEC.md §4 の iOS 版）。
//
// **画面側で色と数字のリテラルを書かない。** 書いた瞬間に「同じ意味のものが
// 画面ごとに違う」状態へ戻る。web 版で一度そこを直したので、ここは最初から守る。
//
// web 版から変えた判断:
//   ・板は半透明の塗りではなく **material**。背後の 3D が本当に透けるので、
//     「世界の手前に情報が置いてある」という2層構成が絵として成立する
//   ・見出しと数字は **New York（serif）**。iOS に最初から入っていて、
//     SF だけで組むより「記録簿」の手触りが出る。本文は SF のまま読みやすさを取る

enum DS {
    // MARK: - 色

    /// 地。3D の背景と揃える——ここがずれると 3D の外周に別の黒が見える
    static let ground = Color(hex: 0x070910)
    static let text = Color(hex: 0xE9ECF6)
    static let dim = Color(hex: 0x98A2BD)
    /// **4.5:1 を切らない明度にしてある。** 元は 0x626C86 で、
    /// 一番暗い背景に置いてなお 3.80:1 しか無かった——
    /// つまり注記は全部、どこに置いても本文として読めていなかった
    static let faint = Color(hex: 0x7A849E)
    static let line = Color.white.opacity(0.14)
    static let lineHi = Color.white.opacity(0.30)

    static let gold = Color(hex: 0xE9BE74)
    static let goldHi = Color(hex: 0xFFDDA0)
    static let ember = Color(hex: 0xFF8348)

    static let up = Color(hex: 0x7DDC8A)
    static let down = Color(hex: 0xFF5F70)

    static let atk = Color(hex: 0xFF8348)
    static let def = Color(hex: 0x6FC7FF)
    static let spd = Color(hex: 0x7DDC8A)

    /// レアリティ。web 版と同じ対応（覚え直させない）
    static func rarity(_ r: Rarity) -> Color {
        switch r {
        case .common: return Color(hex: 0x8D97B0)
        case .fine: return Color(hex: 0x5AA9FF)
        case .rare: return Color(hex: 0xA77DFF)
        case .relic: return Color(hex: 0xFFC76B)
        }
    }

    /// 属性。派遣先・武器・薬草・薬で同じ色を使う
    static func element(_ e: Element) -> Color {
        switch e {
        case .physical: return Color(hex: 0x9FB0D0)
        case .fire: return ember
        case .ice: return def
        case .lightning: return gold
        case .poison: return spd
        }
    }

    static func elementName(_ e: Element) -> String {
        switch e {
        case .physical: return "物理"
        case .fire: return "炎"
        case .ice: return "氷"
        case .lightning: return "雷"
        case .poison: return "毒"
        }
    }

    // MARK: - 余白

    static let sp1: CGFloat = 4
    static let sp2: CGFloat = 8
    static let sp3: CGFloat = 12
    static let sp4: CGFloat = 16
    static let sp5: CGFloat = 24
    static let sp6: CGFloat = 40

    // MARK: - 形

    static let rSm: CGFloat = 8
    static let rMd: CGFloat = 14
    static let rLg: CGFloat = 20
    /// 触れるものの最小寸法。Apple の指針と web 版の U3 と同じ
    static let tap: CGFloat = 44

    // MARK: - 動き

    static let dPop: Double = 0.28
    static let dFlip: Double = 0.42
}

// MARK: - 文字

extension Font {
    /// 見出し。New York。**数字を等幅にする**——桁が変わるたびに幅が動くと一覧が落ち着かない
    static func delversTitle(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .serif).monospacedDigit()
    }
    static var delversDisplay: Font { delversTitle(30) }
    static var delversHeading: Font { delversTitle(20) }
    /// 本文。読みやすさを取って SF のまま
    static var delversBody: Font { .system(size: 15).monospacedDigit() }
    static var delversLabel: Font { .system(size: 12).monospacedDigit() }
    static var delversMicro: Font { .system(size: 10, weight: .semibold) }
}

// MARK: - 板
//
// 背後の 3D が透ける material にしてある。塗り潰すと「世界の手前に情報がある」
// という2層構成が絵として成立しなくなる——3D を置いた意味が消える。

struct Panel<Content: View>: View {
    var label: String?
    var raised = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: DS.sp2) {
            if let label, !label.isEmpty {
                Text(label)
                    .font(.delversMicro)
                    .tracking(1.6)
                    .foregroundStyle(DS.faint)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DS.sp4)
        .background {
            Surface(radius: DS.rMd, raised: raised)
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                        .strokeBorder(raised ? DS.lineHi : DS.line, lineWidth: 1)
                }
        }
    }
}

// MARK: - ボタンの段（§3.3）
//
// 段は「重要度」で決まる。1画面に primary は1つだけ。
// 4段あるのは、押せるものを全部同じ顔にすると「どれを押せばいいか」を
// プレイヤーが毎回考えることになるため。

enum Tier {
    case primary    // その画面の主要動線。ActionBar の中に1つだけ
    case secondary  // 次に押しそうなもの
    case quiet      // 押せるが目立たせない
    case danger     // 取り消せない操作
}

struct TierButton: View {
    var label: String
    var tier: Tier = .secondary
    var badge: Int? = nil
    var disabled = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: DS.sp2) {
                Text(label)
                    .font(tier == .primary ? .delversTitle(17) : .delversBody)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let badge, badge > 0 {
                    Text("\(badge)")
                        .font(.delversMicro)
                        .monospacedDigit()
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(DS.gold))
                        .foregroundStyle(Color(hex: 0x14100A))
                }
            }
            .frame(maxWidth: .infinity, minHeight: DS.tap)
            .padding(.horizontal, DS.sp3)
            .background {
                RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                    .fill(fill)
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                            .strokeBorder(stroke, lineWidth: tier == .primary ? 1.5 : 1)
                    }
            }
            .foregroundStyle(tint)
            // **枠の中ならどこを押しても効く。**
            // `.background` は絵を敷くだけで**当たり判定を広げない**ので、
            // これが無いと「描かれた文字の形」だけが反応する。
            // 44pt の枠があっても、押せるのは文字の上だけ——
            // XCUITest は枠の寸法しか見ないので、この壊れ方は検査に出ない。
            .contentShape(RoundedRectangle(cornerRadius: DS.rMd, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.42 : 1)
    }

    private var fill: AnyShapeStyle {
        switch tier {
        case .primary: return AnyShapeStyle(
            LinearGradient(colors: [DS.gold.opacity(0.26), DS.gold.opacity(0.10)],
                           startPoint: .top, endPoint: .bottom))
        case .secondary: return AnyShapeStyle(.ultraThinMaterial)
        case .quiet: return AnyShapeStyle(Color.clear)
        case .danger: return AnyShapeStyle(DS.down.opacity(0.14))
        }
    }
    private var stroke: Color {
        switch tier {
        case .primary: return DS.gold.opacity(0.75)
        case .secondary: return DS.line
        case .quiet: return DS.line.opacity(0.5)
        case .danger: return DS.down.opacity(0.55)
        }
    }
    private var tint: Color {
        switch tier {
        case .primary: return DS.goldHi
        case .secondary: return DS.text
        case .quiet: return DS.dim
        case .danger: return DS.down
        }
    }
}

// MARK: - 部品

/// 値の行。左に名前、右に数字。
struct Row: View {
    var label: String
    var value: String
    var tone: Color = DS.text
    var sub: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.delversLabel).foregroundStyle(DS.dim)
            Spacer(minLength: DS.sp3)
            Text(value).font(.delversBody).foregroundStyle(tone)
            if let sub {
                Text(sub).font(.delversLabel).foregroundStyle(DS.faint)
            }
        }
    }
}

/// 進捗のリング（§2 円グラフ）。畑・図鑑・所持数で使い回す。
struct ProgressRing: View {
    var value: Double
    var max: Double?
    var text: String
    var label: String
    var tone: Color = DS.gold

    private var ratio: Double {
        guard let max, max > 0 else { return 1 }
        return Swift.max(0, Swift.min(1, value / max))
    }

    var body: some View {
        VStack(spacing: DS.sp1) {
            ZStack {
                Circle().strokeBorder(DS.line, lineWidth: 3)
                Circle()
                    .trim(from: 0, to: ratio)
                    .stroke(tone, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(text)
                    .font(.delversLabel)
                    .foregroundStyle(tone)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(4)
            }
            .frame(width: 54, height: 54)
            Text(label).font(.delversMicro).foregroundStyle(DS.faint)
        }
    }
}

/// 手応え。
///
/// **合図になる場面にだけ返す。** 全部の操作に返すと合図でなくなり、
/// 稀少が出た瞬間の重い一撃が埋もれる。
enum Haptic {
    // **生成器を使い回して温めておく。** 押された瞬間に作ると、
    // 最初の一回だけ数十ミリ秒遅れて返ってくる——手応えが遅れて届くと、
    // 押したことへの応答ではなく、別の出来事に感じる。
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let notice = UINotificationFeedbackGenerator()
    private static let light = UIImpactFeedbackGenerator(style: .light)

    // **触覚と音は同じ入口で鳴らす。** 別々に呼び分けると、
    // 片方だけ鳴る場面がいつか必ず生まれる。同じ出来事は同じ語彙で言う。

    /// 決めた（派遣する・装備する・調合する）
    static func commit() {
        medium.impactOccurred()
        medium.prepare()
        Sfx.commit.play()
    }
    /// 手に入った（収穫・売却・解放）
    static func gain() {
        notice.notificationOccurred(.success)
        notice.prepare()
        Sfx.gain.play()
    }
    /// 稀少以上が出た
    static func reveal() {
        heavy.impactOccurred()
        heavy.prepare()
        Sfx.reveal.play()
    }
    /// 触れた。**軽い操作にも応えを返す**——
    /// 主要な操作だけ鳴ると、それ以外が「効いていない」ように感じる
    static func tap() {
        light.impactOccurred()
        light.prepare()
        Sfx.tap.play()
    }
    // 「押せないものを押した」の合図は**置かない。**
    // 押せないものは `disabled` にしてあり、そもそも指を受け取らない。
    // 受け取らないものに手応えだけ返すと、押せたのか押せなかったのか
    // かえって分からなくなる。
}

/// 面の切り替え。
///
/// **iOS の segmented control を使わない。** あれは 32pt で、
/// 自分で決めた「触れるものは 44pt 以上」を満たさない。
/// 基準を曲げるより部品を作るほうが筋が通るし、
/// 借り物のシステム部品が1つ混ざるより、画面の語彙が揃う。
struct TabBar: View {
    var items: [String]
    @Binding var selection: Int
    var identifier: String?

    var body: some View {
        HStack(spacing: DS.sp1) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, label in
                Button {
                    Haptic.tap()
                    withAnimation(.easeOut(duration: 0.18)) { selection = i }
                } label: {
                    Text(label)
                        .font(.delversLabel)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: DS.tap)
                        .foregroundStyle(selection == i ? DS.gold : DS.dim)
                        .background {
                            RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                .fill(selection == i ? DS.gold.opacity(0.12) : .clear)
                                .overlay {
                                    RoundedRectangle(cornerRadius: DS.rSm, style: .continuous)
                                        .strokeBorder(selection == i ? DS.gold.opacity(0.55) : .clear,
                                                      lineWidth: 1)
                                }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityIdentifier(identifier.map { "\($0)-\(i)" } ?? "tab-\(i)")
            }
        }
        .padding(3)
        .background {
            RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: DS.rMd, style: .continuous)
                        .strokeBorder(DS.line, lineWidth: 1)
                }
        }
    }
}

/// 属性や状態の小さな札。
struct Tag: View {
    var text: String
    var tone: Color

    var body: some View {
        Text(text)
            .font(.delversMicro)
            .foregroundStyle(tone)
            .padding(.horizontal, DS.sp2).padding(.vertical, 3)
            .background(Capsule().fill(tone.opacity(0.14)))
            .overlay(Capsule().strokeBorder(tone.opacity(0.4), lineWidth: 1))
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// 3桁区切り。web 版の `num()` と同じ見え方にする
func num(_ n: Int) -> String {
    n.formatted(.number.grouping(.automatic))
}

/// 秒を読める長さに。web 版の `duration()` と同じ刻み
func duration(_ sec: Double) -> String {
    let s = Int(sec.rounded())
    if s < 60 { return "\(s)秒" }
    if s < 3600 { return "\(s / 60)分" }
    let h = s / 3600, m = (s % 3600) / 60
    return m == 0 ? "\(h)時間" : "\(h)時間\(m)分"
}

/// 残り時間は粗く出す。1秒ごとに描き直す必要をなくすため（web 版で踏んだ）
func coarseDuration(_ sec: Double) -> String {
    let s = Int(sec.rounded())
    if s <= 0 { return "まもなく" }
    if s < 60 { return "1分未満" }
    return duration(Double(s))
}

// MARK: - 3D の上に置く文字

extension View {
    /// **3D の上に直に文字を置くときは必ずこれを敷く。**
    ///
    /// 板の上の文字はトークンの組み合わせで 4.5:1 を保証できるが、
    /// 3D の上は背景が毎フレーム変わるので保証のしようがない。
    /// 実際、タイトルの副題は明るい小屋の壁に重なって 1.6:1 まで落ちていた。
    /// 背景を選べない以上、背景の方を沈める。
    func legible(_ strength: Double = 0.80, radius: CGFloat = 16) -> some View {
        self.padding(.horizontal, DS.sp2)
            .padding(.vertical, DS.sp1)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(DS.ground.opacity(strength))
                    .blur(radius: 14)
                    .allowsHitTesting(false)
            )
    }
}

/// **読ませる面。素材の下に必ず地の色を敷く。**
///
/// 素材（`.ultraThinMaterial` など）は背後を透かすので、明るい 3D の前では
/// 面ごと明るくなる。すると面の上の文字の比が**背景まかせ**になり、
/// トークンの組み合わせでは何も保証できなくなる。
/// 実際、所持品の一覧は展示台の紫の光を透かして青く光り、
/// 副文が 2.3:1 まで落ちていた（画素で測るまで気づかなかった）。
///
/// 素材そのものは残す——iOS らしい奥行きはここから来るので、
/// 消すのではなく「明るさだけ渡さない」ようにする。
struct Surface: View {
    var radius: CGFloat = DS.rMd
    var raised = false
    /// 薬草園は画面全体の平均輝度が 109 と、他の画面の倍以上ある。
    /// 0.62 では温室の光を透かして板が明るくなり、注記が 4.1:1 まで落ちた
    var tint: Double = 0.74

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(DS.ground.opacity(tint))
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(raised ? AnyShapeStyle(.thinMaterial)
                                 : AnyShapeStyle(.ultraThinMaterial))
            )
    }
}

// MARK: - 押した手応え

/// **押した瞬間に見た目が応える。**
///
/// 既定の `.plain` は押しても何も起きない。指を置いてから画面が変わるまでの
/// あいだ、プレイヤーは「効いたのか」を確かめる手がかりを持たない。
/// game feel の資料が最初に挙げるのがこれ——押されたものは沈み、少し明るくなる。
/// <https://egmatic.com/blog/how-to-make-your-game-feel-good>
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    var lift: Double = 0.10

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .brightness(configuration.isPressed ? lift : 0)
            .animation(.easeOut(duration: 0.10), value: configuration.isPressed)
    }
}

/// 手に入った時の粒。**祝わないと、増えた数字はただの数字**。
struct Burst: View {
    var tint: Color
    @State private var go = false

    var body: some View {
        ZStack {
            ForEach(0..<10, id: \.self) { i in
                let a = Double(i) / 10 * .pi * 2
                Circle()
                    .fill(tint)
                    .frame(width: 5, height: 5)
                    .offset(x: go ? cos(a) * 46 : 0, y: go ? sin(a) * 46 : 0)
                    .opacity(go ? 0 : 0.95)
            }
        }
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeOut(duration: 0.55)) { go = true } }
    }
}

extension View {
    /// **枠いっぱいを押せる行にする。**
    ///
    /// `.frame(minHeight: 44)` と `.contentShape(Rectangle())` だけでは足りない。
    /// 背景を持たないボタン（文字と記号しか描かれていないもの）は、
    /// 当たり判定も**読み上げ用の枠も**描かれた文字の大きさのままになる——
    /// 実測で 54.7 × 14.3pt しかなかった。44pt を指定してあるのに、である。
    ///
    /// しかもその状態の要素は `isHittable` が false を返すので、
    /// 「44pt 以上か」の検査が**その要素を読み飛ばして通っていた**。
    ///
    /// ほぼ透明な塗りを敷くと、描かれた中身が枠いっぱいに広がるので、
    /// 当たり判定と読み上げ枠の両方が 44pt になる。
    func tappableRow(minHeight: CGFloat = DS.tap) -> some View {
        self.frame(maxWidth: .infinity, minHeight: minHeight)
            .background(Rectangle().fill(Color.white.opacity(0.001)))
            .contentShape(Rectangle())
    }
}
