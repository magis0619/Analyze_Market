import DelversCore
import SwiftUI

/// 画面の骨格（web 版 §2.0）。
///
///   TopBar    L1 …… 常に同じ位置に金と難易度
///   World     L0 …… 背後の 3D
///   本文      L2 …… 画面ごとの中身
///   ActionBar     …… 主要動線1つ。親指の届く下端に固定
///
/// **上から3〜4割はシーンに明け渡す。** 3D を作り込んでも、板が上から下まで
/// 埋めていたら見えない。
struct RootView: View {
    @StateObject private var shell = Shell()

    var body: some View {
        ZStack {
            DS.ground.ignoresSafeArea()

            WorldView(scene: sceneName, mood: mood) { spots in
                shell.hotspots = spots
            }
            .ignoresSafeArea()

            // 周辺減光。**暗さは霧ではなくここで作る**——霧で暗くすると
            // 遠くの山や星ごと消えるが、周辺減光なら中央の主役は残る
            vignette.ignoresSafeArea().allowsHitTesting(false)

            content
        }
        // **端からのスワイプで戻れるようにする。**
        // 遷移を Route の入れ替えで作っているので、iOS が標準でくれる
        // 「左端から引いて戻る」が付いてこない。戻る印は画面の左上にあるが、
        // 片手で持ったとき親指はそこまで届かない——iOS の作法として、
        // 戻り方は指の届くところにも要る。
        .gesture(
            DragGesture(minimumDistance: 18, coordinateSpace: .global)
                .onEnded { g in
                    guard g.startLocation.x < 28,
                          g.translation.width > 70,
                          abs(g.translation.height) < 60,
                          let target = shell.backTarget else { return }
                    shell.go(target)
                }
        )
        .environmentObject(shell)
        .preferredColorScheme(.dark)
        .tint(DS.gold)
    }

    @ViewBuilder private var content: some View {
        switch shell.route {
        case .title: TitleScreen()
        case .base: BaseScreen()
        case .dispatch: DispatchScreen()
        case .report(let id): ReportScreen(dispatchId: id)
        case .status(let id): StatusScreen(dispatchId: id)
        case .opening: OpeningScreen()
        case .inventory: InventoryScreen()
        case .compendium: CompendiumScreen()
        case .garden: GardenScreen()
        case .alchemy: AlchemyScreen()
        }
    }

    private var vignette: some View {
        ZStack {
            RadialGradient(colors: [.clear, DS.ground.opacity(0.46)],
                           center: UnitPoint(x: 0.5, y: 0.32),
                           startRadius: 120, endRadius: 520)
            LinearGradient(stops: [
                .init(color: DS.ground.opacity(0.34), location: 0),
                .init(color: .clear, location: 0.13),
                .init(color: .clear, location: 0.58),
                .init(color: DS.ground.opacity(0.86), location: 1)
            ], startPoint: .top, endPoint: .bottom)
        }
        .blendMode(.multiply)
    }

    private var sceneName: SceneName {
        switch shell.route {
        case .title: return .vista
        case .base: return .base
        case .dispatch: return DispatchScreen.sceneFor(shell)
        case .report: return .descent
        case .status: return .travel
        case .opening: return .reveal
        case .inventory: return .vault
        case .compendium: return .archive
        case .garden: return .garden
        case .alchemy: return .alchemy
        }
    }

    /// 3D へ渡す状態。**数値だけ。**
    private var mood: Mood {
        let st = shell.state
        switch shell.route {
        case .title, .base:
            let g = st.data.garden
            let total = max(1, st.availableJobs().count)
            return Mood(
                accent: DS.gold,
                intensity: g.beds.isEmpty ? 0 : min(1, Double(st.readyCount()) / Double(g.beds.count)),
                presence: 1 - Double(st.data.dispatches.count) / Double(total),
                props: PropMood(
                    chest: st.data.pending.isEmpty ? 0 : 1,
                    mail: st.data.inbox.isEmpty ? 0 : 1,
                    sign: st.availableJobs().contains { !st.isBusy($0) } ? 1 : 0,
                    shelf: st.data.inventory.count >= 150 ? 1 : 0
                )
            )
        case .dispatch:
            return DispatchScreen.moodFor(shell)
        case .status(let id):
            // **深さや被害は渡さない。** 渡した時点で、まだ見せていない結果が
            // 3D の明るさとして漏れる。渡すのは「どこへ行ったか」の色だけ
            let stage = stageDef(st.dispatchInfo(id)?.stageId ?? 1)
            // **経過だけを渡す。** 深さも被害も渡さない——
            // 渡した瞬間に、まだ見せていない結果が光として漏れる
            let ratio = st.data.dispatches.first { $0.id == id }
                .map { st.progressOf($0).ratio } ?? 0
            return Mood(accent: stageAccent(stage), intensity: 0.3, presence: ratio)
        case .report(let id):
            let stage = stageDef(st.dispatchInfo(id)?.stageId ?? 1)
            let worst = st.data.results[id].map { $0.hpCurve.min() ?? 1 } ?? 1
            return Mood(accent: stageAccent(stage),
                        intensity: max(0, min(1, 1 - worst)))
        case .opening:
            return OpeningScreen.moodFor(shell)
        case .inventory:
            return InventoryScreen.moodFor(shell)
        case .compendium:
            return Mood(accent: DS.gold, intensity: 0.3)
        case .garden:
            return GardenScreen.moodFor(shell)
        case .alchemy:
            return AlchemyScreen.moodFor(shell)
        }
    }
}

/// 派遣先の光の色。ダンジョンの「敵の属性」をそのまま使う——
/// 灼熱坑なら赤橙、氷結層なら青白。奥から漏れる光でどこへ行くのかが分かる。
func stageAccent(_ s: StageDef) -> Color {
    switch s.enemyElement {
    case .mixed: return DS.rarity(.rare)
    case .single(let e): return DS.element(e)
    }
}
