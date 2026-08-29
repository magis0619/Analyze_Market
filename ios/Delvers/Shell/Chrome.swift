import DelversCore
import SwiftUI

// 全画面共通の骨格。**位置を固定する**——所持金が画面ごとに動くと、
// プレイヤーは毎回それを探すことになる。

struct TopBar: View {
    @EnvironmentObject var shell: Shell
    var title: String
    var back: (() -> Void)?
    var meta: String?

    var body: some View {
        HStack(spacing: DS.sp2) {
            if let back {
                Button(action: back) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: DS.tap, height: DS.tap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(DS.dim)
                .accessibilityLabel("戻る")
                .accessibilityIdentifier("back")
            } else {
                Spacer().frame(width: DS.sp2)
            }

            Text(title)
                .font(.delversTitle(18))
                .foregroundStyle(DS.text)
                .lineLimit(1)

            Spacer(minLength: DS.sp2)

            if let meta {
                Text(meta)
                    .font(.delversLabel)
                    .foregroundStyle(DS.dim)
                    .padding(.horizontal, DS.sp2).padding(.vertical, 4)
                    .background(Capsule().strokeBorder(DS.lineHi, lineWidth: 1))
            }

            HStack(spacing: 5) {
                Circle().fill(DS.gold).frame(width: 7, height: 7)
                Text(num(shell.state.data.gold))
                    .font(.delversBody).monospacedDigit()
            }
            .foregroundStyle(DS.gold)
            .accessibilityIdentifier("gold")
        }
        .padding(.horizontal, DS.sp3)
        .frame(height: 52)
        .background(
            LinearGradient(colors: [DS.ground.opacity(0.9), .clear],
                           startPoint: .top, endPoint: .bottom)
        )
    }
}

/// 画面下端の主要動線（親指到達域）。**1画面に1つだけ。**
struct ActionBar<Content: View>: View {
    var hint: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: DS.sp2) {
            if let hint {
                Text(hint)
                    .font(.delversLabel)
                    .foregroundStyle(DS.faint)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            content
        }
        .padding(.horizontal, DS.sp4)
        .padding(.top, DS.sp2)
        .padding(.bottom, DS.sp2)
        .background(
            LinearGradient(colors: [.clear, DS.ground.opacity(0.92)],
                           startPoint: .top, endPoint: .bottom)
        )
    }
}

/// 通知の帯。**本文の上に浮かせない**——文字を覆うと、覆われた側は読めない。
/// 本文と ActionBar の間に段を作って、出ている間だけ場所を取る。
struct Toasts: View {
    var items: [String]

    var body: some View {
        VStack(spacing: DS.sp1) {
            ForEach(items, id: \.self) { t in
                Text(t)
                    .font(.delversLabel)
                    .foregroundStyle(DS.dim)
                    .padding(.horizontal, DS.sp3).padding(.vertical, 6)
                    .background(Capsule().fill(DS.ground.opacity(0.70))
                        .background(Capsule().fill(.thinMaterial)))
                    .overlay(Capsule().strokeBorder(DS.lineHi, lineWidth: 1))
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: DS.dPop), value: items)
    }
}

/// 画面の型。上・中・下を固定して、画面ごとに組み替えない。
struct Scaffold<Body: View, Action: View>: View {
    @EnvironmentObject var shell: Shell
    var title: String
    var back: (() -> Void)?
    var meta: String?
    var hint: String?
    /// 上をシーンに明け渡す割合。0 なら本文が上まで来る。
    /// 拠点は 3D に置いた物とチップが上半分に来るので、多めに空ける
    var hero = true
    var heroFraction: CGFloat = 0.30
    /// 中身が短いとき、下に寄せる。上に貼り付けたままだと
    /// 板とボタンの間に意味の無い黒が広く空く
    var anchorBottom = false
    @ViewBuilder var content: Body
    @ViewBuilder var action: Action

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: title, back: back, meta: meta)

            ScrollView(showsIndicators: false) {
                VStack(spacing: DS.sp3) {
                    if hero { Spacer().frame(height: heroHeight) }
                    if anchorBottom { Spacer(minLength: 0) }
                    content
                }
                .padding(.horizontal, DS.sp4)
                .padding(.bottom, DS.sp3)
                .frame(maxWidth: .infinity, minHeight: anchorBottom ? scrollMin : 0,
                       alignment: .bottom)
            }
            .scrollBounceBehavior(.basedOnSize)
            // 入ってくる中身を上端で霞ませる。板が唐突に途切れないように
            .mask(
                LinearGradient(stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: hero ? 0.06 : 0.0),
                    .init(color: .black, location: 1)
                ], startPoint: .top, endPoint: .bottom)
            )

            Toasts(items: shell.notices)

            ActionBar(hint: hint) { action }
        }
    }

    private var heroHeight: CGFloat {
        UIScreen.main.bounds.height * heroFraction
    }
    private var scrollMin: CGFloat {
        UIScreen.main.bounds.height * 0.52
    }
}

/// 覆いかぶさるシート（装備選択・植え付け・確認）。
/// **本文と入れ替える**——重ねると両方が潰れる。
struct SheetLayer<Body: View, Action: View>: View {
    @EnvironmentObject var shell: Shell
    var title: String
    var close: () -> Void
    var hint: String?
    var hero = true
    @ViewBuilder var content: Body
    @ViewBuilder var action: Action

    var body: some View {
        Scaffold(title: title, back: close, meta: nil, hint: hint,
                 hero: hero, anchorBottom: true) {
            content
        } action: {
            action
        }
        .background(
            // 上は透かす。塗り潰すと、せっかく台座に載せたモデルを自分で隠すことになる
            LinearGradient(stops: [
                .init(color: DS.ground.opacity(0.10), location: 0),
                .init(color: DS.ground.opacity(0.22), location: 0.42),
                .init(color: DS.ground.opacity(0.80), location: 1)
            ], startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
        )
    }
}

/// 取り消せない操作の確認。
struct ConfirmSheet: View {
    var title: String
    var detail: String
    var accent: String
    var confirmLabel: String
    var danger: Bool
    var cancel: () -> Void
    var confirm: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture(perform: cancel)
            VStack(alignment: .leading, spacing: DS.sp3) {
                Text(title).font(.delversHeading).foregroundStyle(DS.text)
                Text(accent).font(.delversDisplay).foregroundStyle(DS.gold)
                Text(detail)
                    .font(.delversLabel).foregroundStyle(DS.dim)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: DS.sp2) {
                    TierButton(label: "やめる", tier: .quiet, action: cancel)
                    TierButton(label: confirmLabel, tier: danger ? .danger : .primary,
                               action: confirm)
                }
                .padding(.top, DS.sp2)
            }
            .padding(DS.sp5)
            .background {
                RoundedRectangle(cornerRadius: DS.rLg, style: .continuous)
                    .fill(.regularMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: DS.rLg, style: .continuous)
                            .strokeBorder(DS.lineHi, lineWidth: 1)
                    }
            }
            .padding(DS.sp5)
        }
        .transition(.opacity)
    }
}
