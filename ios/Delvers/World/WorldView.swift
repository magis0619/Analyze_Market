import SceneKit
import SwiftUI

// World 層（web 版 docs/UI-SPEC.md §0.5 / §6 の iOS 版）。
//
// 役割はひとつ:「情報を読ませる板の、後ろに奥行きと光を置く」こと。
// **文字を描かない。当たり判定を持たない。**
//
// 当たり判定を 3D に持たせない理由は web 版と同じで、そうすると
// 「押せるものが押せるか」を外から測れなくなり、44pt の検査も
// 到達可能性の検査もその操作をまるごと素通りするため。
// 3D の物を押させたいときは、位置だけ返して SwiftUI 側にボタンを置く。

enum SceneName: String, Equatable {
    case base, vista, gate, map, pedestal, descent, reveal, vault, archive, garden, alchemy
}

/// SceneKit を SwiftUI に載せる。
///
/// **シーンは捨てずに取っておく。** 画面を移るたびに作り直すと、
/// 拠点へ戻るたびに星も焚き火も塵も最初からやり直しになる。
/// 「裏で常駐している世界」に見せたいなら、作り直してはいけない。
struct WorldView: UIViewRepresentable {
    var scene: SceneName
    var mood: Mood
    /// 3D の目印が今どこに映っているか（0〜1 の画面座標）を返す。
    /// **押されるのはここではなく SwiftUI 側のボタン。**
    var onHotspots: ([String: CGPoint]) -> Void = { _ in }

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.backgroundColor = UIColor(DS.ground)
        v.isUserInteractionEnabled = false      // 当たり判定は持たない（§6.2）
        v.antialiasingMode = .multisampling2X
        v.preferredFramesPerSecond = 60
        v.rendersContinuously = true
        v.isJitteringEnabled = false
        // **滑らかさは体感で決めない。** `-fps` を付けた起動でだけ統計を出す
        v.showsStatistics = ProcessInfo.processInfo.arguments.contains("-fps")
        context.coordinator.onHotspots = onHotspots
        context.coordinator.attach(to: v, name: scene, mood: mood)
        return v
    }

    func updateUIView(_ v: SCNView, context: Context) {
        context.coordinator.onHotspots = onHotspots
        context.coordinator.attach(to: v, name: scene, mood: mood)
    }

    func makeCoordinator() -> WorldCoordinator { WorldCoordinator() }
}

final class WorldCoordinator: NSObject, SCNSceneRendererDelegate {
    private var cache: [SceneName: WorldScene] = [:]
    private var current: WorldScene?
    private var currentName: SceneName?
    private weak var view: SCNView?
    private var t: TimeInterval = 0
    private var last: TimeInterval = 0
    var onHotspots: ([String: CGPoint]) -> Void = { _ in }
    private var published: [String: CGPoint] = [:]

    func attach(to v: SCNView, name: SceneName, mood: Mood) {
        view = v
        if currentName != name {
            currentName = name
            let s = cache[name] ?? WorldScene.make(name)
            cache[name] = s
            current = s
            v.scene = s.scene
            v.pointOfView = s.camera
            v.delegate = self
        }
        current?.apply(mood)
    }

    func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        if last == 0 { last = time }
        t += min(0.1, time - last)
        last = time
        current?.update(t)
        pushHotspots()
    }

    /// **1pt 未満の揺れは流さない。** カメラが常にゆっくり首を振っているので、
    /// そのまま流すと名札が毎フレーム動き続ける。見た目は変わらないのに
    /// 「動いている要素」になり、自動操作が掴めなくなる（web 版で踏んだ）。
    private func pushHotspots() {
        let now = hotspots()
        var changed = now.count != published.count
        if !changed {
            for (k, v) in now {
                guard let old = published[k] else { changed = true; break }
                if abs(v.x - old.x) > 0.004 || abs(v.y - old.y) > 0.004 { changed = true; break }
            }
        }
        guard changed else { return }
        published = now
        DispatchQueue.main.async { [onHotspots] in onHotspots(now) }
    }

    /// 3D の目印が今どこに映っているか（0〜1 の画面座標）。
    /// **位置だけを返す。** 押されるのは SwiftUI 側のボタン。
    func hotspots() -> [String: CGPoint] {
        guard let v = view, let s = current, let cam = s.camera else { return [:] }
        var out: [String: CGPoint] = [:]
        let size = v.bounds.size
        guard size.width > 1, size.height > 1 else { return [:] }
        for (id, node) in s.hotspots where node.isHiddenInHierarchy == false {
            let p = v.projectPoint(node.presentation.worldPosition)
            // z が [0,1] の外はカメラの後ろ
            guard p.z > 0, p.z < 1 else { continue }
            let x = CGFloat(p.x) / size.width
            let y = CGFloat(p.y) / size.height
            guard x >= 0, x <= 1, y >= 0, y <= 1 else { continue }
            out[id] = CGPoint(x: x, y: y)
        }
        return out
    }
}

extension SCNNode {
    /// 祖先まで辿って隠れていないか。親が隠れていれば自分も映らない。
    var isHiddenInHierarchy: Bool {
        var n: SCNNode? = self
        while let cur = n {
            if cur.isHidden { return true }
            n = cur.parent
        }
        return false
    }
}
