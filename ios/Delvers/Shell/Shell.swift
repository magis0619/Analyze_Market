import DelversCore
import SwiftUI

// アプリの器（web 版 §0.5 の2層構成の iOS 版）。
//
//   World層 …… SceneKit。奥行き・光・霧・粒子だけを持つ
//   Interface層 … SwiftUI。文字・数値・操作のすべてを持つ
//
// 画面は「何を出すか」「どのシーンを背負うか」「3D へどんな数値を渡すか」の
// 3つだけを持つ。描画順の管理も当たり判定も SwiftUI がやる。

enum Route: Equatable {
    case title
    case base
    case dispatch
    case report(String)
    case opening
    case inventory
    case compendium
    case garden
    case alchemy
}

@MainActor
final class Shell: ObservableObject {
    @Published var route: Route = .title
    @Published var state: GameState
    /// 再描画のきっかけ。GameState は class なので、変更を SwiftUI に伝える鍵が要る
    @Published private(set) var revision = 0
    /// 通知の帯。積み上げない（2件で押し出す）
    @Published var notices: [String] = []
    /// 所持品の相性順が「どこへ送るつもりか」を知るための文脈
    @Published var stageContext: Int?
    /// 3D の目印が今どこに映っているか（0〜1 の画面座標）。
    /// **押されるのは SwiftUI 側のボタン**——ここには位置しか来ない。
    @Published var hotspots: [String: CGPoint] = [:]

    // 派遣準備の内側の状態。RootView が「どのシーンを背負うか」を決めるのに要る。
    // **通るのは真偽と数値だけ**——画面の中身は 3D に渡さない
    @Published var dispatchStageId = 1
    @Published var dispatchMapOpen = false
    @Published var dispatchPicking = false
    @Published var dispatchCandidateRarity: Rarity?
    @Published var openingRarity: Rarity = .common
    @Published var openingPower: Double = 0.4
    @Published var inventoryRarity: Rarity?
    @Published var gardenReady: Double = 0
    @Published var gardenCanExpand = false
    @Published var gardenSlots: [PlotMood] = []
    @Published var alchemyAccent: Color = DS.gold
    @Published var alchemyPower: Double = 0.15

    private var noticeTask: Task<Void, Never>?
    private var timer: Timer?

    init() {
        let opts = LaunchOptions.fromProcess()
        let store = FileSaveStore()
        if opts.reset { store.save(Data()) }   // 版違いとして読み捨てられ、作り直される
        let now = Date().timeIntervalSince1970 * 1000
        let seed = opts.reset ? opts.seed : UInt32.random(in: 1...UInt32.max)
        // 撮影・検査のときは許可を求めない。アラートが画面を覆って、
        // 何を撮ったのか分からなくなる
        let notifier: ReturnNotifier = opts.reset ? SilentNotifier() : LocalNotifier()
        state = GameState(seed: seed, now: now, store: store, notifier: notifier)
        if opts.reset { opts.seedState(state, now: now) }
        if let r = opts.route {
            if case .report = r {
                route = state.data.inbox.first.map { Route.report($0) } ?? .base
            } else {
                route = r
            }
        }
        // 1秒ごとに時計を進める。派遣の完了と畑の育ちは実時間で動く
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func tick() {
        let before = (state.data.inbox.count, state.data.gold, state.data.dispatches.count)
        state.tick(Date().timeIntervalSince1970 * 1000)
        let after = (state.data.inbox.count, state.data.gold, state.data.dispatches.count)
        if before != after { notify("冒険者が帰還した") }
        revision += 1
    }

    /// 変更を画面に伝える。GameState を触ったら必ず呼ぶ。
    func changed() {
        state.save()
        revision += 1
    }

    func notify(_ text: String) {
        notices.append(text)
        while notices.count > 2 { notices.removeFirst() }
        noticeTask?.cancel()
        noticeTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.6))
            if !Task.isCancelled { notices.removeAll() }
        }
    }

    func go(_ r: Route) {
        // **画面の移動もひとつの操作。** ここは全部の遷移が通る唯一の口なので、
        // ここで鳴らせば「押したのに何も起きない」が構造的に無くなる。
        // 画面ごとに書くと、いつか書き忘れた画面だけ無反応になる
        if r != route { Haptic.tap() }
        withAnimation(.easeOut(duration: DS.dPop)) { route = r }
    }

    /// 一段戻る先。**画面ごとの「戻る」と同じ場所へ返す。**
    /// 端からのスワイプを受けるために、器の側でも行き先を知っておく必要がある
    /// （画面が持つ `back:` の closure は器からは覗けない）。
    var backTarget: Route? {
        switch route {
        case .title, .base: return nil
        case .alchemy: return .garden
        default: return .base
        }
    }

    // MARK: - 拠点の「次にやること」
    //
    // 拠点の主要動線は状況で変わる。固定の1つを置くと、未開封が7個あるのに
    // 「所持品を開く」が主役、という嘘になる。**理由も一緒に返す**——
    // 指示だけ出すと、プレイヤーは言われた通りに押すだけの人になる。

    struct NextAction {
        var label: String
        var why: String
        var route: Route
        var prop: String?
    }

    func nextAction() -> NextAction {
        let d = state.data
        if !d.inbox.isEmpty, let id = d.inbox.first {
            return NextAction(label: "帰還レポートを読む",
                              why: "冒険者が帰ってきた。何が起きたかを見る",
                              route: .report(id), prop: "mail")
        }
        if !d.pending.isEmpty {
            return NextAction(label: "未鑑定品 \(d.pending.count)個を開封する",
                              why: "持ち帰った戦利品がまだ開けられていない",
                              route: .opening, prop: "chest")
        }
        if state.availableJobs().contains(where: { !state.isBusy($0) }) {
            return NextAction(label: "冒険者を送り出す",
                              why: "冒険者が手を空けている。送り出すまで時間は進まない",
                              route: .dispatch, prop: "sign")
        }
        if state.readyCount() > 0 {
            return NextAction(label: "薬草を収穫する",
                              why: "畑が育ちきっている。放っておいても腐らない",
                              route: .garden, prop: "garden")
        }
        return NextAction(label: "薬草園を見る",
                          why: "全員が潜っている。帰りを待つあいだにできることがある",
                          route: .garden, prop: "garden")
    }
}

/// 帰還のローカル通知。**コア層はこの型を知らない**——protocol 越しに差す。
final class LocalNotifier: ReturnNotifier {
    private var granted = false

    func requestPermission() {
        // 許可は「初めて派遣を出した瞬間」にだけ求める。
        // 起動直後に求めても何のための許可か分からず、まず拒否される。
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        }
    }

    func notifyReturn(job: String, stage: String, outcome: String) {
        guard granted else { return }
        let content = UNMutableNotificationContent()
        content.title = "DELVERS"
        content.body = "\(job)が\(stage)から帰還した（\(outcome)）"
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}

import UserNotifications
