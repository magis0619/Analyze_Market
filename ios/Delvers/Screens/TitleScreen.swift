import DelversCore
import SwiftUI

struct TitleScreen: View {
    @EnvironmentObject var shell: Shell
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 0) {
            // **上に寄せる。** 真ん中に置くと遠景の小屋と木立に重なる。
            // 空の側に置けば、幕を敷いた上でさらに背景が暗い
            Spacer().frame(height: 84)
            VStack(spacing: DS.sp2) {
                Text("DELVERS")
                    .font(.system(size: 46, weight: .semibold, design: .serif))
                    .tracking(10)
                    .foregroundStyle(DS.goldHi)
                    .shadow(color: DS.gold.opacity(0.4), radius: 18)
                Text("送り出して、待つ")
                    .font(.delversLabel)
                    .tracking(4)
                    .foregroundStyle(DS.faint)
            }
            .legible(0.62, radius: 28)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
            Spacer()
            ActionBar(hint: hasSave ? "続きから始める" : "決めるのは3つだけ。装備・撤退ライン・行き先") {
                TierButton(label: hasSave ? "続きから" : "はじめる", tier: .primary) {
                    shell.go(.base)
                }
                .accessibilityIdentifier("cta")
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) { appeared = true }
        }
    }

    private var hasSave: Bool {
        shell.state.data.inventory.count > 2 || !shell.state.data.clearedStages.isEmpty
    }
}
