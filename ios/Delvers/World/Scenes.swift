import Foundation
import SceneKit
import UIKit

// 画面ごとの世界。
//
// **外部のモデルもテクスチャも読まない。** 形は基本形状の組み合わせ、
// 質感はライティングと霧と発光で作る。読み込みの失敗という壊れ方を持たない。
//
// 縦画面は水平画角が極端に狭い（垂直FOV×アスペクト0.46）。寄りすぎると
// 被写体だけで横幅が埋まるので、どのシーンも引き気味に組んである。

/// 一様なスケール。`SCNVector3` には `repeating:` の初期化子が無い
/// （simd の `SIMD3` と混同しやすい）。
@inline(__always)
func v3(_ s: Float) -> SCNVector3 { SCNVector3(s, s, s) }

/// 決定的な擬似乱数。撮るたびに違う絵にならないように。
struct SeededRandom {
    private var s: UInt32
    init(_ seed: UInt32) { s = seed == 0 ? 0x9E3779B9 : seed }
    mutating func next() -> Double {
        s ^= s << 13
        s ^= UInt32(bitPattern: Int32(bitPattern: s) >> 17)
        s ^= s << 5
        return Double(s) / 4_294_967_296.0
    }
    mutating func range(_ a: Double, _ b: Double) -> Double { a + next() * (b - a) }
}

/// そのカメラで、その距離に、**横幅いくつまで映るか**。
///
/// 縦画面の水平画角は極端に狭い（縦 FOV × アスペクト 0.46）。
/// これを確かめずに物を置くと、物のほうが画面より大きくなる——
/// 大鍋（半径 3.8 対 半幅 3.0）と入口の岩の輪（半径 5.4 対 半幅 2.6）で
/// 実際に起きた。どちらも「作ったのに映っていない」という壊れ方で、
/// スクショを見ても**何が足りないのか分からない**。
func visibleHalfWidth(fov: Double, distance: Double, aspect: Double = 0.46) -> Double {
    distance * tan(fov / 2 * .pi / 180) * aspect
}

/// 主役が画角に収まっているか、組み立てのときに確かめる。
///
/// **掛ける相手を選ぶこと。** 壁や棚のように「画面の外まで続いていてよい」物に
/// 掛けると、正しい絵なのに `assert` で落ちる。実際、書庫の棚に掛けて
/// デバッグ実行の図鑑画面を落とし、検査が「主要動線が現れない」と報告した——
/// 検査は正しく、掛けたこちらが間違っていた。
///
/// **コメントに書くだけでは守られない。** 一度そう書いたのに、
/// 次にカメラを動かしたときにまた画角から溢れさせた。
/// `assert` なら、寄せすぎた瞬間にデバッグ実行が止まる。
@inline(__always)
func requireFits(_ name: String, radius: Double, fov: Double, distance: Double) {
    let half = visibleHalfWidth(fov: fov, distance: distance)
    assert(radius <= half,
           "\(name) は半径 \(radius) だが、画角に入るのは半幅 \(String(format: "%.1f", half)) まで。"
           + "このままだと画面から溢れて、周りに作った物が一切映らない")
}

class WorldScene {
    let scene = SCNScene()
    var camera: SCNNode?
    /// SwiftUI 側に当たり判定を置いてほしい物体。id → ノード
    var hotspots: [String: SCNNode] = [:]

    func apply(_ mood: Mood) {}
    func update(_ t: TimeInterval) {}

    static func make(_ name: SceneName) -> WorldScene {
        switch name {
        case .base: return BaseScene()
        case .vista: return BaseScene(vista: true)
        case .gate: return GateScene()
        case .map: return MapScene()
        case .pedestal: return PedestalScene()
        case .descent: return DescentScene()
        case .travel: return TravelScene()
        case .reveal: return RevealScene()
        case .vault: return PedestalScene(dim: true)
        case .archive: return ArchiveScene()
        case .garden: return GardenScene()
        case .alchemy: return AlchemyScene()
        }
    }

    // MARK: - 組み立ての道具

    func addCamera(fov: CGFloat, at p: SCNVector3, look: SCNVector3) -> SCNNode {
        let cam = SCNCamera()
        cam.fieldOfView = fov
        cam.projectionDirection = .vertical   // three.js の垂直FOVに合わせる
        cam.zNear = 0.1
        cam.zFar = 400
        cam.wantsHDR = true
        // **にじみは効かせるが、溶かさない。** 閾値を低く取ると加算合成の光の玉が
        // 全部ブルームに乗り、画面ごと白く飛ぶ（薬草園で 5.7% が飽和した）。
        // 「本当に光っているもの」だけ拾わせる。
        cam.bloomIntensity = 0.45
        cam.bloomThreshold = 0.92
        cam.bloomBlurRadius = 10
        cam.exposureOffset = -0.35
        let node = SCNNode()
        node.camera = cam
        node.position = p
        node.look(at: look)
        scene.rootNode.addChildNode(node)
        camera = node
        return node
    }

    func fog(_ color: UIColor, start: CGFloat, end: CGFloat) {
        scene.fogColor = color
        scene.fogStartDistance = start
        scene.fogEndDistance = end
        scene.fogDensityExponent = 1.4
        scene.background.contents = color
    }

    /// 平面シェーディングの塊。低ポリの手触りを全シーンで揃える。
    func solid(_ geo: SCNGeometry, _ color: UIColor,
               emission: UIColor? = nil, emissionScale: CGFloat = 1,
               roughness: CGFloat = 0.9, metalness: CGFloat = 0) -> SCNNode {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.roughness.contents = roughness
        m.metalness.contents = metalness
        if let e = emission {
            m.emission.contents = e
            m.emission.intensity = emissionScale
        }
        geo.firstMaterial = m
        return SCNNode(geometry: geo)
    }

    /// 光の玉。加算合成の板で「にじむ光」を作る。
    func glow(_ color: UIColor, size: CGFloat, opacity: CGFloat) -> SCNNode {
        let plane = SCNPlane(width: size, height: size)
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = WorldScene.radialTexture(color)
        m.blendMode = .add
        m.writesToDepthBuffer = false
        m.isDoubleSided = true
        plane.firstMaterial = m
        let n = SCNNode(geometry: plane)
        n.opacity = opacity
        n.constraints = [SCNBillboardConstraint()]   // 常にカメラを向く
        return n
    }

    /// 中心が明るく外へ消える円。光の玉に貼る
    static func radialTexture(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 96, height: 96)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: &a)
            let colors = [
                UIColor(red: r, green: g, blue: b, alpha: 1).cgColor,
                UIColor(red: r, green: g, blue: b, alpha: 0).cgColor
            ] as CFArray
            guard let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                        colors: colors, locations: [0, 1]) else { return }
            c.drawRadialGradient(grad, startCenter: CGPoint(x: 48, y: 48), startRadius: 0,
                                 endCenter: CGPoint(x: 48, y: 48), endRadius: 48,
                                 options: [])
        }
    }

    /// 漂う粒。燠火・塵・蛍・花粉に使い回す。
    func motes(count: Int, spread: SCNVector3, color: UIColor,
               size: CGFloat, seed: UInt32) -> SCNNode {
        let root = SCNNode()
        var r = SeededRandom(seed)
        for _ in 0..<count {
            let n = glow(color, size: size, opacity: 0.8)
            n.position = SCNVector3(
                Float(r.range(-Double(spread.x) / 2, Double(spread.x) / 2)),
                Float(r.range(0, Double(spread.y))),
                Float(r.range(-Double(spread.z) / 2, Double(spread.z) / 2))
            )
            // 位相をずらして漂わせる。全部を同じ動きにすると機械に見える
            let dur = r.range(3.5, 8.0)
            let rise = SCNAction.moveBy(x: 0, y: CGFloat(spread.y) * 0.4, z: 0, duration: dur)
            let back = SCNAction.moveBy(x: 0, y: -CGFloat(spread.y) * 0.4, z: 0, duration: dur)
            rise.timingMode = .easeInEaseOut
            back.timingMode = .easeInEaseOut
            n.runAction(.repeatForever(.sequence([rise, back])))
            root.addChildNode(n)
        }
        return root
    }

    /// 星空。**霧に入れない**——濃い霧の中に置くと1つも見えなくなる。
    func stars(count: Int, radius: Float, seed: UInt32) -> SCNNode {
        let root = SCNNode()
        var r = SeededRandom(seed)
        for _ in 0..<count {
            let s = CGFloat(r.range(0.10, 0.32))
            let n = glow(.white, size: s, opacity: CGFloat(r.range(0.25, 0.9)))
            let a = r.range(-Double.pi, Double.pi)
            let h = r.range(0.05, 0.75)
            n.position = SCNVector3(
                Float(cos(a)) * radius,
                Float(h) * radius * 0.8 + 6,
                -abs(Float(sin(a))) * radius - 20
            )
            // 瞬き。周期をばらす
            let d = r.range(1.4, 4.0)
            n.runAction(.repeatForever(.sequence([
                .fadeOpacity(to: 0.15, duration: d),
                .fadeOpacity(to: 0.9, duration: d)
            ])))
            root.addChildNode(n)
        }
        // 霧の外に置く（fog は距離で効くので、影響を切るため独立させる）
        root.castsShadow = false
        return root
    }

    /// 岩肌。box を歪めて CG 然とした直方体に見えないようにする。
    func rock(_ w: CGFloat, _ h: CGFloat, _ d: CGFloat, _ color: UIColor, seed: UInt32) -> SCNNode {
        var r = SeededRandom(seed)
        let box = SCNBox(width: w, height: h, length: d, chamferRadius: CGFloat(r.range(0.02, 0.12)))
        let n = solid(box, color, roughness: 0.95)
        n.eulerAngles = SCNVector3(Float(r.range(-0.3, 0.3)),
                                   Float(r.range(-0.6, 0.6)),
                                   Float(r.range(-0.3, 0.3)))
        return n
    }

    func light(_ type: SCNLight.LightType, _ color: UIColor, intensity: CGFloat,
               at p: SCNVector3 = SCNVector3Zero) -> SCNNode {
        let l = SCNLight()
        l.type = type
        l.color = color
        l.intensity = intensity
        if type == .omni || type == .spot { l.attenuationEndDistance = 40 }
        let n = SCNNode()
        n.light = l
        n.position = p
        scene.rootNode.addChildNode(n)
        return n
    }
}
