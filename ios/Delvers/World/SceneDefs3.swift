import SceneKit
import UIKit

// MARK: - 薬草園（温室）
//
// **枠の数と絵の数を必ず合わせる。** web 版では常に6本の苗を描いていたので、
// 「育成 2/2」と書いてある横で3本が育っているように見えていた。
// 数字と絵が食い違うと、どちらを信じればよいのか分からなくなる。
//
// **種類ごとに違う姿にする。** 全部が同じ緑の円錐だと、何を植えても
// 画面が変わらない——3D で育てて見せる意味がまるごと無くなる。

final class GardenScene: WorldScene {
    private static let bedXZ: [(Float, Float)] = [
        (-3.2, -1.6), (0, -1.6), (3.2, -1.6),
        (-3.2, 1.6), (0, 1.6), (3.2, 1.6)
    ]

    private struct Bed {
        let root: SCNNode
        let marker: SCNNode
        let slot: PlantSlot
    }
    private var beds: [Bed] = []
    private var bedsRoot = SCNNode()
    private var plus: SCNNode!
    private var fireflies: SCNNode!
    private var inner: SCNNode!
    private var bloom: SCNNode!
    private var ready = 0.0
    private var wantReady = 0.0
    private var live: [Bed] = []
    private var camNode: SCNNode!

    override init() {
        super.init()
        fog(UIColor(red: 0.04, green: 0.08, blue: 0.06, alpha: 1), start: 22, end: 110)
        // 温室の全体が入る距離まで引く。近すぎると株だけが画面を埋めて、
        // 「ガラスの箱の中で育っている」という肝心の絵が消える
        camNode = addCamera(fov: 42, at: SCNVector3(0, 8.5, 30), look: SCNVector3(0, -3.4, 0))
        // **他の画面より倍明るかった。** 平均輝度 103 に対し、他は 21〜55。
        // 温室なので明るいのは筋が通るが、画面ごと緑に染まって
        // 下の板まで緑がかっていた。光の色ではなく量を落とす
        _ = light(.ambient, UIColor(red: 0.20, green: 0.28, blue: 0.22, alpha: 1), intensity: 290)
        let moon = light(.directional, UIColor(red: 0.75, green: 0.91, blue: 0.78, alpha: 1), intensity: 330)
        moon.position = SCNVector3(-6, 14, 8)
        moon.look(at: SCNVector3Zero)
        scene.rootNode.addChildNode(stars(count: 120, radius: 100, seed: 8))

        let ground = solid(SCNPlane(width: 90, height: 90),
                           UIColor(red: 0.12, green: 0.17, blue: 0.13, alpha: 1))
        ground.eulerAngles.x = -.pi / 2
        ground.position.y = -0.4
        scene.rootNode.addChildNode(ground)

        // 温室。骨組みと半透明のガラス
        let glassColor = UIColor(red: 0.62, green: 0.85, blue: 0.75, alpha: 0.07)
        let glass = solid(SCNBox(width: 11, height: 5.2, length: 7, chamferRadius: 0.05), glassColor)
        glass.geometry?.firstMaterial?.isDoubleSided = true
        glass.geometry?.firstMaterial?.writesToDepthBuffer = false
        glass.position.y = 2.6
        scene.rootNode.addChildNode(glass)
        let roof = solid(SCNPyramid(width: 11.4, height: 1.6, length: 7.4), glassColor)
        roof.geometry?.firstMaterial?.isDoubleSided = true
        roof.geometry?.firstMaterial?.writesToDepthBuffer = false
        roof.position.y = 5.2
        scene.rootNode.addChildNode(roof)
        let frameColor = UIColor(red: 0.23, green: 0.29, blue: 0.25, alpha: 1)
        let postXZ: [(Float, Float)] = [(-5.5, -3.5), (5.5, -3.5), (-5.5, 3.5), (5.5, 3.5)]
        for (x, z) in postXZ {
            let post = solid(SCNBox(width: 0.24, height: 5.2, length: 0.24, chamferRadius: 0), frameColor)
            post.position = SCNVector3(x, Float(2.6), z)
            scene.rootNode.addChildNode(post)
        }

        // 畑
        let soil = UIColor(red: 0.20, green: 0.16, blue: 0.11, alpha: 1)
        for (x, z) in GardenScene.bedXZ {
            let root = SCNNode()
            root.position = SCNVector3(x, 0, z)
            let bed = solid(SCNBox(width: 2.6, height: 0.3, length: 2.2, chamferRadius: 0.04), soil)
            bed.position.y = 0.05
            root.addChildNode(bed)
            let marker = GardenScene.makeMarker()
            marker.position = SCNVector3(-0.85, 0.2, 0.7)
            root.addChildNode(marker)
            let slot = PlantSlot()
            slot.node.position.y = 0.2
            slot.node.scale = v3(1.5)
            root.addChildNode(slot.node)
            root.isHidden = true
            bedsRoot.addChildNode(root)
            beds.append(Bed(root: root, marker: marker, slot: slot))
        }
        scene.rootNode.addChildNode(bedsRoot)

        // 買っていない枠の「＋」。**場所は固定**——手前の列に回ると
        // 画面の下へ落ちて板の裏に隠れ、押せなくなる
        plus = GardenScene.makePlus()
        plus.position = SCNVector3(4.4, 2.9, -2.4)
        plus.isHidden = true
        scene.rootNode.addChildNode(plus)
        hotspots["expand"] = plus

        fireflies = motes(count: 48, spread: SCNVector3(12, 5, 7),
                          color: UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1),
                          size: 0.11, seed: 71)
        fireflies.position.y = 1.6
        scene.rootNode.addChildNode(fireflies)

        inner = light(.omni, UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1),
                      intensity: 420, at: SCNVector3(0, 2.6, 1))
        bloom = glow(UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1), size: 5, opacity: 0.22)
        bloom.position = SCNVector3(0, 2.2, 0.5)
        scene.rootNode.addChildNode(bloom)
    }

    /// 空き枠に立てる木の札。「土だけ」より「空いている」がはっきり読める
    static func makeMarker() -> SCNNode {
        let g = SCNNode()
        let wood = UIColor(red: 0.42, green: 0.34, blue: 0.24, alpha: 1)
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = wood
        m.roughness.contents = 1.0
        let post = SCNBox(width: 0.08, height: 0.7, length: 0.08, chamferRadius: 0)
        post.firstMaterial = m
        let pn = SCNNode(geometry: post); pn.position.y = 0.35
        let board = SCNBox(width: 0.62, height: 0.3, length: 0.06, chamferRadius: 0)
        board.firstMaterial = m
        let bn = SCNNode(geometry: board); bn.position.y = 0.66; bn.eulerAngles.z = 0.08
        g.addChildNode(pn); g.addChildNode(bn)
        return g
    }

    /// 「＋」。押させるのは SwiftUI 側の透明なボタン
    static func makePlus() -> SCNNode {
        let g = SCNNode()
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = UIColor(red: 0.75, green: 0.91, blue: 0.78, alpha: 0.4)
        m.emission.contents = UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1)
        m.emission.intensity = 0.6
        let bar = SCNBox(width: 1.5, height: 0.24, length: 0.24, chamferRadius: 0.04)
        bar.firstMaterial = m
        let post = SCNBox(width: 0.24, height: 1.5, length: 0.24, chamferRadius: 0.04)
        post.firstMaterial = m
        g.addChildNode(SCNNode(geometry: bar))
        g.addChildNode(SCNNode(geometry: post))
        return g
    }

    override func apply(_ mood: Mood) {
        wantReady = mood.intensity
        guard !mood.slots.isEmpty || mood.slots.isEmpty else { return }
        live.removeAll()
        var sum: Float = 0
        for (i, bed) in beds.enumerated() {
            let slot = i < mood.slots.count ? mood.slots[i] : nil
            bed.root.isHidden = slot == nil
            guard let slot else { continue }
            live.append(bed)
            bed.slot.set(kind: slot.kind, ratio: slot.ratio)
            // 空き枠は土と札だけ。何も植わっていないことが形で分かるように
            bed.marker.isHidden = slot.kind >= 0
            sum += GardenScene.bedXZ[i].0
        }
        // 開いている枠を画面の中央へ寄せる。2枠のときに左端へ固まっていると、
        // 温室の右3分の2が意味もなく空いた絵になる
        let mid = mood.slots.isEmpty ? 0 : sum / Float(mood.slots.count)
        bedsRoot.position.x = -mid * 0.8
        plus.isHidden = !(mood.slots.count < GardenScene.bedXZ.count && mood.canExpand)
    }

    override func update(_ t: TimeInterval) {
        ready += (wantReady - ready) * 0.06
        let ft = Float(t)
        fireflies.opacity = CGFloat(0.16 + ready * 0.34)
        inner.light?.intensity = CGFloat(320 + ready * 420 + Double(sin(ft * 1.3)) * 50)
        bloom.scale = v3(Float(0.85 + ready * 0.4) + sin(ft * 1.1) * 0.05)
        for (i, bed) in live.enumerated() { bed.slot.update(t, i) }
        if !plus.isHidden {
            // ゆっくり息をする。動いているものは「押せそう」に見える
            plus.scale = v3(0.9 + sin(ft * 1.8) * 0.06)
            plus.eulerAngles.y = sin(ft * 0.4) * 0.25
        }
        camNode.position.x = sin(ft * 0.12) * 0.7
        camNode.look(at: SCNVector3(0, -3.4, 0))
    }
}

/// 1枠ぶんの株。**種類が変わったときだけ**中身を作り直し、育ちは段で見せる。
final class PlantSlot {
    let node = SCNNode()
    private var kind = -2
    private var stage = -1
    private var parts: (root: SCNNode, crown: SCNNode, spark: SCNNode?, glow: [SCNMaterial])?

    /// 段ごとの背丈。種はほとんど土に埋まっている
    private static let stageScale: [Float] = [0.22, 0.5, 0.78, 1.0]

    /// 育ちの段（種→芽→つぼみ→開花）。
    /// 連続で伸ばすと「いつ採り頃になったか」が分からない。
    private static func growthStage(_ ratio: Double) -> Int {
        if ratio >= 1 { return 3 }
        if ratio >= 0.6 { return 2 }
        if ratio >= 0.25 { return 1 }
        return 0
    }

    func set(kind newKind: Int, ratio: Double) {
        if newKind != kind {
            parts?.root.removeFromParentNode()
            parts = newKind >= 0 ? PlantSlot.build(newKind) : nil
            if let p = parts { node.addChildNode(p.root) }
            kind = newKind
            stage = -1
        }
        guard let p = parts else { return }
        let st = PlantSlot.growthStage(ratio)
        if st != stage {
            stage = st
            p.root.scale = v3(PlantSlot.stageScale[st])
            // 穂先と粒は「育ちきった／もうすぐ」の合図。早く出すと段の意味が消える
            p.crown.isHidden = st < 3
            p.spark?.isHidden = st < 2
        }
    }

    func update(_ t: TimeInterval, _ i: Int) {
        guard let p = parts else { return }
        let ft = Float(t)
        p.root.eulerAngles.z = sin(ft * 0.8 + Float(i) * 1.3) * 0.045
        let lit = stage >= 3
            ? 0.55 + Double(sin(ft * 1.6 + Float(i))) * 0.16
            : 0.12 + Double(stage) * 0.05
        for m in p.glow { m.emission.intensity = CGFloat(lit) }
    }

    /// 属性ごとに違う姿。色は派遣先の属性色と同じ言葉を使う——
    /// ここだけ新しい配色を作ると「赤＝炎」をもう一度覚え直すことになる。
    private static func build(_ kind: Int) -> (SCNNode, SCNNode, SCNNode?, [SCNMaterial]) {
        let root = SCNNode()
        func mat(_ c: UIColor, emissive: UIColor, rough: CGFloat = 0.8,
                 metal: CGFloat = 0) -> SCNMaterial {
            let m = SCNMaterial()
            m.lightingModel = .physicallyBased
            m.diffuse.contents = c
            m.roughness.contents = rough
            m.metalness.contents = metal
            m.emission.contents = emissive
            m.emission.intensity = 0.2
            return m
        }

        switch kind {
        case 1:  // 火苔。赤黒い苔の塊が内側から灯る
            let m = mat(UIColor(red: 0.31, green: 0.10, blue: 0.08, alpha: 1),
                        emissive: UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), rough: 0.95)
            let lumps: [(Float, Float, Float, CGFloat)] = [
                (0.0, 0.26, 0.0, 0.40), (-0.3, 0.18, 0.2, 0.26), (0.28, 0.2, -0.18, 0.30)
            ]
            for lump in lumps {
                let s = SCNSphere(radius: lump.3)
                s.firstMaterial = m
                let n = SCNNode(geometry: s)
                n.position = SCNVector3(lump.0, lump.1, lump.2)
                n.scale.y = 0.62
                root.addChildNode(n)
            }
            let crown = WorldScene.glowNode(UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), 1.5, 0.55)
            crown.position.y = 0.42
            root.addChildNode(crown)
            let spark = WorldScene.sparkNode(UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), 8, 31)
            spark.position.y = 0.2
            root.addChildNode(spark)
            return (root, crown, spark, [m])

        case 2:  // 雷根。紫がかった捻れた根と静電気の火花
            let m = mat(UIColor(red: 0.42, green: 0.31, blue: 0.62, alpha: 1),
                        emissive: UIColor(red: 0.56, green: 0.49, blue: 1.0, alpha: 1), rough: 0.7)
            for (i, a) in [0.5, 2.6, 4.5].enumerated() {
                let c = SCNCylinder(radius: 0.07, height: 0.85); c.firstMaterial = m
                let n = SCNNode(geometry: c)
                n.position = SCNVector3(Float(cos(a)) * 0.14, 0.42, Float(sin(a)) * 0.14)
                n.eulerAngles = SCNVector3(Float(cos(a)) * 0.3, Float(i), Float(sin(a)) * 0.3)
                root.addChildNode(n)
            }
            let crownGeo = SCNPyramid(width: 0.4, height: 0.4, length: 0.4)
            crownGeo.firstMaterial = m
            let crown = SCNNode(geometry: crownGeo)
            crown.position.y = 0.94
            root.addChildNode(crown)
            let spark = WorldScene.sparkNode(UIColor(red: 0.85, green: 0.79, blue: 1.0, alpha: 1), 10, 53)
            spark.position.y = 0.3
            root.addChildNode(spark)
            return (root, crown, spark, [m])

        case 3:  // 毒茸。柄と傘。丸い傘は他の4種のどれとも輪郭が被らない
            let stalkM = mat(UIColor(red: 0.85, green: 0.82, blue: 0.72, alpha: 1),
                             emissive: .black, rough: 0.9)
            let capM = mat(UIColor(red: 0.35, green: 0.63, blue: 0.37, alpha: 1),
                           emissive: UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1), rough: 0.75)
            let stalk = SCNCylinder(radius: 0.11, height: 0.62); stalk.firstMaterial = stalkM
            let sn = SCNNode(geometry: stalk); sn.position.y = 0.31
            root.addChildNode(sn)
            let cap = SCNSphere(radius: 0.36); cap.firstMaterial = capM
            let cn = SCNNode(geometry: cap); cn.position.y = 0.6; cn.scale.y = 0.55
            root.addChildNode(cn)
            let crown = SCNNode()
            let small = SCNSphere(radius: 0.2); small.firstMaterial = capM
            let smn = SCNNode(geometry: small); smn.position = SCNVector3(0.3, 0.34, 0.16); smn.scale.y = 0.55
            let ss = SCNCylinder(radius: 0.06, height: 0.3); ss.firstMaterial = stalkM
            let ssn = SCNNode(geometry: ss); ssn.position = SCNVector3(0.3, 0.15, 0.16)
            crown.addChildNode(smn); crown.addChildNode(ssn)
            root.addChildNode(crown)
            return (root, crown, nil, [capM])

        case 4:  // 氷花。青い蕾。細い花弁を内へ倒して「まだ開いていない」形に
            let stemM = mat(UIColor(red: 0.21, green: 0.34, blue: 0.42, alpha: 1),
                            emissive: .black, rough: 0.8)
            let petalM = mat(UIColor(red: 0.50, green: 0.82, blue: 1.0, alpha: 1),
                             emissive: UIColor(red: 0.44, green: 0.78, blue: 1.0, alpha: 1), rough: 0.3)
            let stalk = SCNCylinder(radius: 0.06, height: 0.7); stalk.firstMaterial = stemM
            let sn = SCNNode(geometry: stalk); sn.position.y = 0.35
            root.addChildNode(sn)
            for i in 0..<5 {
                let a = Double(i) / 5 * .pi * 2
                let p = SCNCone(topRadius: 0, bottomRadius: 0.13, height: 0.5)
                p.firstMaterial = petalM
                let n = SCNNode(geometry: p)
                n.position = SCNVector3(Float(cos(a)) * 0.09, 0.94, Float(sin(a)) * 0.09)
                n.eulerAngles = SCNVector3(Float(cos(a)) * 0.28, 0, Float(-sin(a)) * 0.28)
                root.addChildNode(n)
            }
            let crownGeo = SCNSphere(radius: 0.15); crownGeo.firstMaterial = petalM
            let crown = SCNNode(geometry: crownGeo); crown.position.y = 1.22
            root.addChildNode(crown)
            return (root, crown, nil, [petalM])

        default:  // 鉄草。灰色がかった結晶の芽。金属質を少し持たせて手触りを変える
            let m = mat(UIColor(red: 0.56, green: 0.61, blue: 0.71, alpha: 1),
                        emissive: UIColor(red: 0.24, green: 0.29, blue: 0.39, alpha: 1),
                        rough: 0.35, metal: 0.55)
            let shards: [(Float, Float, CGFloat)] = [
                (0.0, 0.0, 1.0), (-0.28, 0.18, 0.62), (0.3, -0.14, 0.72)
            ]
            for (i, v) in shards.enumerated() {
                let c = SCNCone(topRadius: 0, bottomRadius: 0.16, height: v.2)
                c.firstMaterial = m
                let n = SCNNode(geometry: c)
                n.position = SCNVector3(v.0, Float(v.2) / 2, v.1)
                let fi = Float(i)
                n.eulerAngles = SCNVector3((fi - 1) * 0.16, fi * 0.7, (fi - 1) * 0.2)
                root.addChildNode(n)
            }
            let crownGeo = SCNSphere(radius: 0.22)
            crownGeo.firstMaterial = m
            let crown = SCNNode(geometry: crownGeo)
            crown.position.y = 1.06
            crown.scale = SCNVector3(1, 1.4, 1)
            root.addChildNode(crown)
            return (root, crown, nil, [m])
        }
    }
}

// MARK: - 錬金工房（大鍋）

final class AlchemyScene: WorldScene {
    private var liquid: SCNNode!
    private var liquidMat: SCNMaterial!
    private var bubbles: SCNNode!
    private var pot: SCNNode!
    private var want = UIColor(red: 0.44, green: 0.50, blue: 0.62, alpha: 1)
    private var power = 0.15
    private var wantPower = 0.15
    private var lamp: SCNNode!

    override init() {
        super.init()
        fog(UIColor(red: 0.03, green: 0.03, blue: 0.05, alpha: 1), start: 14, end: 70)
        // 少し上から覗き込む。真横だと液面（色が変わる主役）が線になって消える。
        //
        // **画角に入る大きさか、必ず数で確かめる。** 縦画面の水平半幅は
        // `距離 × tan(垂直FOV/2) × 0.46`。fov42・z=17 では半幅が 3.0 しか無く、
        // 半径 3.8 の鍋は「必ず画面から溢れる」——床も棚も作ったのに、
        // 黒い帯と楕円しか映っていなかったのはこれが理由。
        _ = addCamera(fov: 48, at: SCNVector3(0, 5.6, 22), look: SCNVector3(0, -1.2, 0))
        requireFits("大鍋", radius: 3.8 * 0.72, fov: 48, distance: 22)
        _ = light(.ambient, UIColor(red: 0.16, green: 0.16, blue: 0.24, alpha: 1), intensity: 520)
        // 鍋の胴に光を当てる。液面だけ光っていると、鍋が闇に溶けて輪しか見えない
        let rimLight = light(.directional, UIColor(red: 0.72, green: 0.78, blue: 1.0, alpha: 1),
                             intensity: 420)
        rimLight.position = SCNVector3(-8, 10, 12)
        rimLight.look(at: SCNVector3Zero)

        pot = SCNNode()
        // **胴を黒くしすぎない。** 0.10 では環境光を上げても闇に沈み、
        // 液面の楕円だけが浮いて「鍋」に見えなかった
        let body = solid(SCNTube(innerRadius: 3.5, outerRadius: 3.8, height: 4.4),
                         UIColor(red: 0.26, green: 0.24, blue: 0.27, alpha: 1),
                         roughness: 0.45, metalness: 0.65)
        body.geometry?.firstMaterial?.isDoubleSided = true
        pot.addChildNode(body)
        let bottom = solid(SCNSphere(radius: 3.6),
                           UIColor(red: 0.24, green: 0.22, blue: 0.25, alpha: 1),
                           roughness: 0.45, metalness: 0.65)
        bottom.position.y = -2.2
        bottom.scale.y = 0.55
        pot.addChildNode(bottom)
        let rim = solid(SCNTorus(ringRadius: 3.7, pipeRadius: 0.18),
                        UIColor(red: 0.30, green: 0.28, blue: 0.24, alpha: 1),
                        roughness: 0.4, metalness: 0.7)
        rim.position.y = 2.2
        pot.addChildNode(rim)
        pot.position.y = -0.2
        pot.scale = v3(0.72)     // 半幅 4.5 に対して半径 2.7。周りの床と火も見える
        scene.rootNode.addChildNode(pot)

        // 床と、奥の棚。鍋だけを浮かべると、周りが真っ黒で場所に見えない
        let floor = solid(SCNPlane(width: 60, height: 60),
                          UIColor(red: 0.10, green: 0.09, blue: 0.11, alpha: 1))
        floor.eulerAngles.x = -.pi / 2
        floor.position.y = -4.6
        scene.rootNode.addChildNode(floor)
        var rr = SeededRandom(611)
        for i in 0..<9 {
            let jar = solid(SCNCylinder(radius: CGFloat(rr.range(0.3, 0.55)),
                                        height: CGFloat(rr.range(0.7, 1.4))),
                            UIColor(hue: CGFloat(rr.range(0.3, 0.65)), saturation: 0.3,
                                    brightness: 0.22, alpha: 1))
            jar.position = SCNVector3(Float(rr.range(-11, 11)), -4.0, Float(-8 - Double(i) * 0.7))
            scene.rootNode.addChildNode(jar)
        }
        let backWall = solid(SCNPlane(width: 40, height: 20),
                             UIColor(red: 0.07, green: 0.07, blue: 0.09, alpha: 1))
        backWall.position = SCNVector3(0, 4, -16)
        scene.rootNode.addChildNode(backWall)

        // 液面。色が変わる主役
        let disc = SCNCylinder(radius: 3.45, height: 0.06)
        liquidMat = SCNMaterial()
        liquidMat.lightingModel = .constant
        liquidMat.diffuse.contents = want
        liquidMat.emission.contents = want
        disc.firstMaterial = liquidMat
        liquid = SCNNode(geometry: disc)
        liquid.position.y = 1.0
        // **鍋の子にする。** 鍋だけを縮めたとき、外に置いた液面は原寸のまま残り、
        // 縮んだ鍋を手前から隠していた（画面に淡い楕円しか映らなかった）
        pot.addChildNode(liquid)

        bubbles = motes(count: 26, spread: SCNVector3(5, 4, 5), color: .white, size: 0.14, seed: 19)
        bubbles.position.y = 1.1
        bubbles.opacity = 0
        pot.addChildNode(bubbles)

        lamp = light(.omni, want, intensity: 700, at: SCNVector3(0, 0.9, 0))

        // 鍋の下の火。**下から照らさないと鍋が「置いてある物」に見えない。**
        // 同時に、ここが仕事場であることも言う
        let hearth = SCNNode()
        for i in 0..<5 {
            let log = solid(SCNCylinder(radius: 0.10, height: 1.3),
                            UIColor(red: 0.19, green: 0.13, blue: 0.09, alpha: 1))
            log.eulerAngles = SCNVector3(Float.pi / 2.4, Float(i) / 5 * .pi * 2, 0)
            hearth.addChildNode(log)
        }
        let fireGlow = glow(UIColor(red: 1.0, green: 0.55, blue: 0.22, alpha: 1),
                            size: 3.0, opacity: 0.55)
        fireGlow.position.y = 0.3
        hearth.addChildNode(fireGlow)
        hearth.position = SCNVector3(0, -3.9, 0)
        scene.rootNode.addChildNode(hearth)
        let fireLight = light(.omni, UIColor(red: 1.0, green: 0.52, blue: 0.20, alpha: 1),
                              intensity: 1500, at: SCNVector3(0, -3.4, 0))
        fireLight.light?.attenuationEndDistance = 22
    }

    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantPower = mood.intensity
    }

    override func update(_ t: TimeInterval) {
        power += (wantPower - power) * 0.08
        let ft = Float(t)
        liquidMat.diffuse.contents = want
        liquidMat.emission.contents = want
        liquidMat.emission.intensity = CGFloat(0.4 + power * 1.4)
        liquid.position.y = 1.0 + sin(ft * 1.4) * 0.04
        lamp.light?.color = want
        lamp.light?.intensity = CGFloat(400 + power * 1400 + Double(sin(ft * 3.1)) * 60)
        // 調合中は泡立つ
        bubbles.opacity = CGFloat(max(0, power - 0.6) * 2.2)
        for b in bubbles.childNodes {
            b.geometry?.firstMaterial?.diffuse.contents = WorldScene.radialTexture(want)
        }
    }
}

// MARK: - 光の玉と粒（PlantSlot からも使う）

extension WorldScene {
    static func glowNode(_ color: UIColor, _ size: CGFloat, _ opacity: CGFloat) -> SCNNode {
        let plane = SCNPlane(width: size, height: size)
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = radialTexture(color)
        m.blendMode = .add
        m.writesToDepthBuffer = false
        m.isDoubleSided = true
        plane.firstMaterial = m
        let n = SCNNode(geometry: plane)
        n.opacity = opacity
        n.constraints = [SCNBillboardConstraint()]
        return n
    }

    static func sparkNode(_ color: UIColor, _ count: Int, _ seed: UInt32) -> SCNNode {
        let root = SCNNode()
        var r = SeededRandom(seed)
        for _ in 0..<count {
            let n = glowNode(color, 0.10, 0.8)
            n.position = SCNVector3(Float(r.range(-0.45, 0.45)),
                                    Float(r.range(0, 1.0)),
                                    Float(r.range(-0.45, 0.45)))
            let d = r.range(0.8, 2.2)
            n.runAction(.repeatForever(.sequence([
                .fadeOpacity(to: 0.05, duration: d),
                .fadeOpacity(to: 0.9, duration: d)
            ])))
            root.addChildNode(n)
        }
        return root
    }
}
