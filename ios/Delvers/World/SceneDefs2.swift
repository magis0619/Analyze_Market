import SceneKit
import UIKit

// MARK: - 派遣準備（覗き込む入口）

final class GateScene: WorldScene {
    private var deep: SCNNode!
    private var glowNode: SCNNode!
    private var dust: SCNNode!
    private var want = UIColor(red: 0.91, green: 0.75, blue: 0.45, alpha: 1)
    private var cur = UIColor(red: 0.91, green: 0.75, blue: 0.45, alpha: 1)
    private var wantIntensity = 0.4
    private var intensity = 0.4
    private var camNode: SCNNode!

    override init() {
        super.init()
        fog(UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1), start: 22, end: 110)
        // 岩の輪は半径 5.4。fov44・z=14 では `visibleHalfWidth` が 2.6 しか無く、
        // 岩は一つも映らず、奥の円錐の縁だけが金色の破片として見えていた。
        // 半幅 6.1 まで引いて、輪ごと「覗き込む穴」に見せる
        camNode = addCamera(fov: 54, at: SCNVector3(0, 3.4, 24), look: SCNVector3(0, 0.4, -1))
        requireFits("入口の岩の輪", radius: 5.4, fov: 54, distance: 26)
        // 「夜」と「見えない」は別。岩肌の向きが読める程度まで上げる
        _ = light(.ambient, UIColor(red: 0.18, green: 0.22, blue: 0.34, alpha: 1), intensity: 900)
        let key = light(.directional, UIColor(red: 0.62, green: 0.70, blue: 1.0, alpha: 1), intensity: 480)
        key.position = SCNVector3(-8, 14, 16)
        key.look(at: SCNVector3Zero)
        // 手前の岩肌を起こす。これが無いと壁が黒く沈み、
        // 「穴」ではなく「黒い画面に光の亀裂」に見える
        let fill = light(.directional, UIColor(red: 0.50, green: 0.56, blue: 0.80, alpha: 1),
                         intensity: 620)
        fill.position = SCNVector3(5, -6, 22)
        fill.look(at: SCNVector3(0, 2, 0))

        let subjectY: Float = 2.6

        // 岩壁。**面で塞いでから穴を開ける。**
        //
        // 最初は岩を26個ぐるりと並べたが、暗い岩を暗い霧の中に散らしても
        // 輪郭が出ず、岩と岩の隙間から奥の光が漏れて
        // 「金色の破片が散らばった青い画面」にしかならなかった。
        // 一枚の環（内径4.2・外径18）で塞げば、穴の形はその抜けとして必ず出る。
        var r = SeededRandom(404)
        let face = solid(SCNTube(innerRadius: 4.2, outerRadius: 18, height: 3.0),
                         UIColor(red: 0.19, green: 0.20, blue: 0.27, alpha: 1), roughness: 1)
        face.geometry?.firstMaterial?.isDoubleSided = true
        face.eulerAngles.x = .pi / 2
        face.position = SCNVector3(0, subjectY, -0.5)
        scene.rootNode.addChildNode(face)

        // 穴の縁にだけ岩を足して、切り口が定規で引いた円に見えないようにする
        for i in 0..<16 {
            let a = Double(i) / 16 * .pi * 2
            let rad = r.range(4.1, 4.9)
            let b = rock(CGFloat(r.range(1.2, 2.2)), CGFloat(r.range(1.2, 2.4)),
                         CGFloat(r.range(1.0, 1.8)),
                         UIColor(red: 0.16, green: 0.17, blue: 0.24, alpha: 1),
                         seed: UInt32(410 + i))
            b.position = SCNVector3(Float(cos(a) * rad), subjectY + Float(sin(a) * rad),
                                    Float(0.2 + r.range(0, 1.2)))
            scene.rootNode.addChildNode(b)
        }

        // 奥。円錐の内側を覗く形にすると、平らな穴より深く見える
        let throat = solid(SCNCone(topRadius: 4.6, bottomRadius: 0.2, height: 13),
                           UIColor(red: 0.09, green: 0.11, blue: 0.19, alpha: 1), roughness: 1)
        throat.geometry?.firstMaterial?.isDoubleSided = true
        throat.eulerAngles.x = .pi / 2
        throat.position = SCNVector3(0, subjectY, -7)
        scene.rootNode.addChildNode(throat)

        glowNode = glow(.white, size: 6.4, opacity: 0.8)
        glowNode.position = SCNVector3(0, subjectY, -2.6)
        scene.rootNode.addChildNode(glowNode)
        deep = light(.omni, .white, intensity: 2400, at: SCNVector3(0, subjectY, -4.2))

        dust = motes(count: 90, spread: SCNVector3(14, 12, 10), color: .white, size: 0.075, seed: 55)
        dust.position = SCNVector3(0, subjectY - 4, 1)
        scene.rootNode.addChildNode(dust)
    }

    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantIntensity = mood.intensity
    }

    override func update(_ t: TimeInterval) {
        // 0.3秒程度で寄せる。パッと変わると「設定が切り替わった」に見えて、
        // 場所が変わった感じがしない
        cur = blend(cur, want, 0.08)
        intensity += (wantIntensity - intensity) * 0.06
        let ft = Float(t)
        deep.light?.color = cur
        deep.light?.intensity = CGFloat(1500 + intensity * 2000 + Double(sin(ft * 1.4)) * 160)
        glowNode.geometry?.firstMaterial?.diffuse.contents = WorldScene.radialTexture(cur)
        glowNode.scale = v3(Float(0.8 + intensity * 0.5) + sin(ft * 1.1) * 0.04)
        dust.opacity = CGFloat(0.16 + intensity * 0.5)
        camNode.position.x = sin(ft * 0.13) * 0.5
        camNode.look(at: SCNVector3(0, -2.2, 0))
    }

    private func blend(_ a: UIColor, _ b: UIColor, _ k: CGFloat) -> UIColor {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return UIColor(red: r1 + (r2 - r1) * k, green: g1 + (g2 - g1) * k,
                       blue: b1 + (b2 - b1) * k, alpha: 1)
    }
}

// MARK: - 派遣先の地図
//
// 10行の一覧では「浅いか深いか」が文字を読むまで分からない。
// このゲームで一番はっきりした縦の軸を、平らな表に潰していた。
// 上が浅く、下へ行くほど深く、深いものほど手前に大きい。

final class MapScene: WorldScene {
    static let count = 10

    private struct Node { let root: SCNNode; let ring: SCNNode; let mat: SCNMaterial; let halo: SCNNode }
    private var nodes: [Node] = []
    private var segs: [SCNNode] = []
    private var states = [Int](repeating: 0, count: MapScene.count)
    private var selected = -1
    private var camNode: SCNNode!

    /// 左右に振る。**隣同士は必ず反対側**——正弦波で置くと2番と3番がほぼ同じ位置に来て、
    /// 丸が重なって数字が読めなくなる。折り返しながら降りる形は地図としても素直。
    static func position(_ i: Int) -> SCNVector3 {
        SCNVector3(
            Float(i % 2 == 1 ? 1 : -1) * Float(2.6 - Double(i % 3) * 0.45),
            Float(6.4 - Double(i) * 1.12),
            Float(-7 + Double(i) * 0.62)
        )
    }

    override init() {
        super.init()
        // 霧は薄く。濃いと奥のノードが完全に消えて「行ける先が無い」画面になる
        fog(UIColor(red: 0.02, green: 0.03, blue: 0.05, alpha: 1), start: 30, end: 160)
        camNode = addCamera(fov: 46, at: SCNVector3(0, 0.9, 20), look: SCNVector3(0, -0.4, -3))
        _ = light(.ambient, UIColor(red: 0.17, green: 0.20, blue: 0.31, alpha: 1), intensity: 620)
        let key = light(.directional, UIColor(red: 0.62, green: 0.71, blue: 1.0, alpha: 1), intensity: 300)
        key.position = SCNVector3(-6, 12, 14)
        key.look(at: SCNVector3Zero)
        scene.rootNode.addChildNode(stars(count: 130, radius: 110, seed: 21))

        // 経路。**区間ごとに分ける**——1本にすると「どこまで行けるか」を色で言えない
        for i in 0..<(MapScene.count - 1) {
            let a = MapScene.position(i), b = MapScene.position(i + 1)
            let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
            let len = sqrt(dx * dx + dy * dy + dz * dz)
            let seg = solid(SCNCylinder(radius: 0.075, height: CGFloat(len)),
                            UIColor(red: 0.17, green: 0.20, blue: 0.31, alpha: 1))
            seg.position = SCNVector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
            // シリンダーは Y 軸方向。両端を結ぶ向きへ倒す
            seg.eulerAngles = SCNVector3(atan2(sqrt(dx * dx + dz * dz), dy) * 0, 0, 0)
            seg.look(at: b, up: scene.rootNode.worldUp, localFront: SCNVector3(0, 1, 0))
            scene.rootNode.addChildNode(seg)
            segs.append(seg)
        }

        for i in 0..<MapScene.count {
            let root = SCNNode()
            root.position = MapScene.position(i)
            let torus = SCNTorus(ringRadius: 0.62, pipeRadius: 0.17)
            let ring = solid(torus, UIColor(red: 0.22, green: 0.26, blue: 0.37, alpha: 1),
                             roughness: 0.55, metalness: 0.2)
            root.addChildNode(ring)
            let halo = glow(.white, size: 2.4, opacity: 0)
            root.addChildNode(halo)
            scene.rootNode.addChildNode(root)
            nodes.append(Node(root: root, ring: ring, mat: ring.geometry!.firstMaterial!, halo: halo))
            hotspots["node\(i)"] = root
        }

        let dust = motes(count: 60, spread: SCNVector3(16, 24, 14),
                         color: UIColor(red: 0.56, green: 0.66, blue: 1.0, alpha: 1),
                         size: 0.07, seed: 88)
        dust.position.y = -6
        dust.opacity = 0.5
        scene.rootNode.addChildNode(dust)
    }

    override func apply(_ mood: Mood) {
        selected = mood.selected
        guard !mood.nodes.isEmpty else { return }
        for (i, n) in nodes.enumerated() {
            let info = i < mood.nodes.count ? mood.nodes[i] : nil
            n.root.isHidden = info == nil
            guard let info else { continue }
            states[i] = info.state
            // 未解放は属性の色を出さない。「何が出るか分からない」を色でも言う
            let c = info.state == 0
                ? UIColor(red: 0.22, green: 0.26, blue: 0.37, alpha: 1)
                : moodElementColor(info.element)
            n.mat.diffuse.contents = c
            n.mat.emission.contents = c
            n.halo.geometry?.firstMaterial?.diffuse.contents = WorldScene.radialTexture(c)
        }
        // 区間の色は「両端とも解放済みなら通っている」で決める
        for (i, seg) in segs.enumerated() {
            let on = states[i] > 0 && states[i + 1] > 0
            let c = on ? UIColor(red: 0.37, green: 0.44, blue: 0.62, alpha: 1)
                       : UIColor(red: 0.14, green: 0.16, blue: 0.24, alpha: 1)
            seg.geometry?.firstMaterial?.diffuse.contents = c
            seg.geometry?.firstMaterial?.emission.contents = c
            seg.geometry?.firstMaterial?.emission.intensity = on ? 0.35 : 0.1
        }
    }

    override func update(_ t: TimeInterval) {
        let ft = Float(t)
        for (i, n) in nodes.enumerated() where !n.root.isHidden {
            let st = states[i]
            let sel = i == selected
            let base: Double = st == 2 ? 0.85 : st == 1 ? 0.45 : 0.12
            let pulse = sel ? 0.35 + Double(sin(ft * 2.6)) * 0.22 : 0
            n.mat.emission.intensity = CGFloat(base + pulse)
            n.halo.opacity = st == 0 ? 0 : CGFloat((st == 2 ? 0.5 : 0.28) + pulse * 0.6)
            n.halo.scale = v3(Float(0.9 + (sel ? 0.6 + Double(sin(ft * 2.6)) * 0.15 : 0)))
            n.ring.eulerAngles.z = ft * (sel ? 0.6 : 0.12) + Float(i)
            n.root.scale = v3(sel ? 1.22 : 1)
        }
        // 選んだ先へゆっくり首を振る。一気に寄せると地図の全体が見えなくなる
        let look = selected >= 0 ? MapScene.position(selected) : SCNVector3(0, -0.4, -3)
        camNode.position.x += (look.x * 0.18 + sin(ft * 0.14) * 0.4 - camNode.position.x) * 0.05
        camNode.position.y += (0.9 + look.y * 0.06 - camNode.position.y) * 0.05
        camNode.look(at: SCNVector3(camNode.position.x * 0.4,
                                    -0.4 + (selected >= 0 ? look.y * 0.06 : 0), -3))
    }
}

// MARK: - 展示台（装備選択・所持品）

final class PedestalScene: WorldScene {
    private var keyLight: SCNNode!
    private var halo: SCNNode!
    private var motesNode: SCNNode!
    private var want = UIColor(red: 0.56, green: 0.49, blue: 1.0, alpha: 1)
    private var cur = UIColor(red: 0.56, green: 0.49, blue: 1.0, alpha: 1)
    private var aura = 0.4
    private var wantAura = 0.4
    /// 載せる場所。装備モデルはここに差す
    let mount = SCNNode()

    /// `dim` は所持品画面（宝物庫）。装備選択の展示台と**同じ場所に見せない**——
    /// 8x8 の指紋で入口と 9.6 しか離れておらず、どちらも「暗い青の帯」だった。
    /// 展示台は一点を照らす舞台、宝物庫は物が積んである部屋。
    init(dim: Bool = false) {
        super.init()
        fog(UIColor(red: 0.02, green: 0.03, blue: 0.06, alpha: 1), start: 12, end: 60)
        _ = addCamera(fov: dim ? 46 : 38, at: SCNVector3(0, 1.6, dim ? 14 : 12),
                      look: SCNVector3(0, 0.4, 0))
        _ = light(.ambient,
                  dim ? UIColor(red: 0.24, green: 0.18, blue: 0.11, alpha: 1)
                      : UIColor(red: 0.10, green: 0.13, blue: 0.22, alpha: 1),
                  intensity: dim ? 620 : 420)

        if dim {
            // 宝物庫。両脇に武器架け、後ろに積んだ箱。**物が積んである部屋**にする
            var vr = SeededRandom(707)
            for side in [-1.0 as Float, 1.0] {
                let rack = SCNNode()
                for k in 0..<5 {
                    let blade = solid(SCNBox(width: 0.14, height: CGFloat(vr.range(1.6, 2.6)),
                                             length: 0.5, chamferRadius: 0.03),
                                      UIColor(red: 0.52, green: 0.48, blue: 0.42, alpha: 1),
                                      roughness: 0.35, metalness: 0.75)
                    blade.position = SCNVector3(Float(k) * 0.42 - 0.84, 0.6, 0)
                    blade.eulerAngles.z = Float(vr.range(-0.14, 0.14))
                    rack.addChildNode(blade)
                }
                let bar = solid(SCNBox(width: 2.6, height: 0.14, length: 0.7, chamferRadius: 0.03),
                                UIColor(red: 0.26, green: 0.19, blue: 0.14, alpha: 1))
                bar.position.y = -0.4
                rack.addChildNode(bar)
                rack.position = SCNVector3(side * 4.4, -0.6, -1.6)
                rack.eulerAngles.y = -side * 0.42
                scene.rootNode.addChildNode(rack)
            }
            for i in 0..<4 {
                let box = solid(SCNBox(width: CGFloat(vr.range(1.1, 1.8)), height: 0.9,
                                       length: 1.0, chamferRadius: 0.05),
                                UIColor(red: 0.30, green: 0.22, blue: 0.15, alpha: 1))
                box.position = SCNVector3(Float(vr.range(-5.5, 5.5)), Float(-2.1 + Double(i % 2) * 0.9),
                                          Float(-5 - vr.range(0, 2)))
                scene.rootNode.addChildNode(box)
            }
            let lamp = light(.omni, UIColor(red: 1.0, green: 0.72, blue: 0.38, alpha: 1),
                             intensity: 1900, at: SCNVector3(0, 2.6, 3))
            lamp.light?.attenuationEndDistance = 26
        }

        // 台座。角を落として、上面だけに光が乗るようにする
        let dais = solid(SCNCylinder(radius: 2.6, height: 0.5),
                         UIColor(red: 0.11, green: 0.13, blue: 0.20, alpha: 1), roughness: 0.7)
        dais.position.y = -1.6
        scene.rootNode.addChildNode(dais)
        let step = solid(SCNCylinder(radius: 3.3, height: 0.35),
                         UIColor(red: 0.08, green: 0.10, blue: 0.16, alpha: 1), roughness: 0.85)
        step.position.y = -1.95
        scene.rootNode.addChildNode(step)

        mount.position = SCNVector3(0, 0.6, 0)
        scene.rootNode.addChildNode(mount)

        halo = glow(.white, size: 6.5, opacity: 0.5)
        halo.position = SCNVector3(0, 0.4, -1.6)
        scene.rootNode.addChildNode(halo)

        keyLight = light(.spot, .white, intensity: dim ? 900 : 2000, at: SCNVector3(0, 7, 3.5))
        keyLight.light?.spotInnerAngle = 22
        keyLight.light?.spotOuterAngle = 62
        keyLight.look(at: SCNVector3Zero)

        motesNode = motes(count: 44, spread: SCNVector3(6, 6, 4), color: .white, size: 0.07, seed: 66)
        motesNode.position.y = -1.4
        motesNode.opacity = 0.35
        scene.rootNode.addChildNode(motesNode)
    }

    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantAura = mood.intensity
    }

    override func update(_ t: TimeInterval) {
        let ft = Float(t)
        aura += (wantAura - aura) * 0.07
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        want.getRed(&r, green: &g, blue: &b, alpha: &a)
        var cr: CGFloat = 0, cg: CGFloat = 0, cb: CGFloat = 0
        cur.getRed(&cr, green: &cg, blue: &cb, alpha: &a)
        cur = UIColor(red: cr + (r - cr) * 0.08, green: cg + (g - cg) * 0.08,
                      blue: cb + (b - cb) * 0.08, alpha: 1)
        keyLight.light?.color = cur
        halo.geometry?.firstMaterial?.diffuse.contents = WorldScene.radialTexture(cur)
        halo.scale = v3(Float(0.85 + aura * 0.45) + sin(ft * 2.1) * 0.05)
        motesNode.opacity = CGFloat(0.18 + aura * 0.45)
        // 載せた物はゆっくり回して、形を全周見せる
        mount.eulerAngles.y = ft * 0.35
        mount.position.y = 0.6 + sin(ft * 1.2) * 0.06
    }
}

// MARK: - 竪坑（帰還レポート）

final class DescentScene: WorldScene {
    private var torches: [(node: SCNNode, mat: SCNMaterial)] = []
    private var want = UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1)
    private var reached = 0.55
    private var strain = 0.0
    private var wantStrain = 0.0

    override init() {
        super.init()
        fog(UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1), start: 18, end: 90)
        _ = addCamera(fov: 46, at: SCNVector3(0, 4, 17), look: SCNVector3(0, -3, 0))
        _ = light(.ambient, UIColor(red: 0.20, green: 0.25, blue: 0.38, alpha: 1), intensity: 900)
        let key = light(.directional, UIColor(red: 0.62, green: 0.70, blue: 1.0, alpha: 1), intensity: 400)
        key.position = SCNVector3(-8, 12, 14)
        key.look(at: SCNVector3Zero)

        // 竪坑の壁。左右に岩を積んで、間を落ちていく穴に見せる
        var r = SeededRandom(303)
        for i in 0..<26 {
            for side in [-1.0, 1.0] {
                let b = rock(CGFloat(r.range(2.0, 3.4)), CGFloat(r.range(1.6, 2.6)),
                             CGFloat(r.range(1.6, 2.6)),
                             UIColor(red: 0.11, green: 0.13, blue: 0.20, alpha: 1),
                             seed: UInt32(310 + i * 2))
                b.position = SCNVector3(Float(side * r.range(3.6, 4.6)),
                                        Float(6 - Double(i) * 1.5), Float(r.range(-2, 1)))
                scene.rootNode.addChildNode(b)
            }
            // 松明。到達深度まで灯る
            let tor = glow(.white, size: 1.5, opacity: 0)
            tor.position = SCNVector3(Float(i % 2 == 0 ? -3.0 : 3.0), Float(6 - Double(i) * 1.5), 1.2)
            scene.rootNode.addChildNode(tor)
            torches.append((tor, tor.geometry!.firstMaterial!))
        }
    }

    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantStrain = mood.intensity
        reached = 0.78
    }

    override func update(_ t: TimeInterval) {
        strain += (wantStrain - strain) * 0.06
        let ft = Float(t)
        let lit = Int(Double(torches.count) * reached)
        for (i, tor) in torches.enumerated() {
            let on = i < lit
            // 追い詰められた回ほど松明が不安定に揺れる
            let flick = 0.7 + Double(sin(ft * (3.0 + Float(i) * 0.3))) * (0.12 + strain * 0.35)
            tor.node.opacity = on ? CGFloat(max(0.1, flick)) : 0.04
            tor.mat.diffuse.contents = WorldScene.radialTexture(on ? want :
                UIColor(red: 0.17, green: 0.20, blue: 0.31, alpha: 1))
        }
    }
}

// MARK: - 開封（光の奔流）

final class RevealScene: WorldScene {
    private var beam: SCNNode!
    private var core: SCNNode!
    private var burst: SCNNode!
    private var want = UIColor(red: 1.0, green: 0.78, blue: 0.42, alpha: 1)
    private var power = 0.4
    private var wantPower = 0.4

    override init() {
        super.init()
        fog(UIColor(red: 0.02, green: 0.02, blue: 0.04, alpha: 1), start: 10, end: 50)
        _ = addCamera(fov: 40, at: SCNVector3(0, 0.6, 11), look: SCNVector3(0, 0, 0))
        _ = light(.ambient, UIColor(red: 0.08, green: 0.09, blue: 0.16, alpha: 1), intensity: 260)

        beam = SCNNode()
        for i in 0..<7 {
            let b = glow(.white, size: 1.2, opacity: 0.5)
            b.scale = SCNVector3(0.35, 9, 1)
            b.eulerAngles.z = Float(i) / 7 * .pi * 2
            beam.addChildNode(b)
        }
        scene.rootNode.addChildNode(beam)

        core = glow(.white, size: 5.5, opacity: 0.9)
        scene.rootNode.addChildNode(core)

        burst = motes(count: 56, spread: SCNVector3(9, 9, 5), color: .white, size: 0.10, seed: 12)
        burst.position.y = -4
        scene.rootNode.addChildNode(burst)
    }

    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantPower = mood.intensity
    }

    override func update(_ t: TimeInterval) {
        power += (wantPower - power) * 0.08
        let ft = Float(t)
        let tex = WorldScene.radialTexture(want)
        core.geometry?.firstMaterial?.diffuse.contents = tex
        core.scale = v3(Float(0.5 + power * 1.1) + sin(ft * 2.6) * 0.06)
        beam.eulerAngles.z = ft * 0.5
        beam.opacity = CGFloat(0.25 + power * 0.7)
        for b in beam.childNodes {
            b.geometry?.firstMaterial?.diffuse.contents = tex
        }
        burst.opacity = CGFloat(0.2 + power * 0.7)
    }
}


// MARK: - 書庫（図鑑）
//
// 所持品と同じ台座を使い回していたら、8x8 の明度で見ても 6.9 しか違わなかった
// ——「どこも同じ場所」に見えるということ。記録を読む場所には棚を置く。

final class ArchiveScene: WorldScene {
    private var lamp: SCNNode!
    private var dust: SCNNode!
    private var glowNode: SCNNode!

    override init() {
        super.init()
        fog(UIColor(red: 0.03, green: 0.03, blue: 0.05, alpha: 1), start: 14, end: 60)
        // 棚は x=-9〜9 に並ぶ。fov44・z=15 では半幅が 3.5 しか無く、
        // 棚2つぶんの縦縞しか映らなかった（部屋に見えない）。
        // 半幅 8〜10 まで広げて、棚の列が奥へ続いているのが分かるようにする
        _ = addCamera(fov: 60, at: SCNVector3(0, 2.4, 26), look: SCNVector3(0, -0.4, 0))
        // 棚の列にはこの確認を掛けない。**棚は画面の外まで続いていてよい**——
        // 壁として端まで埋まっているほうが「部屋」に見える。
        // 収まっている必要があるのは、それ自体を主役として見せる物だけ。
        _ = light(.ambient, UIColor(red: 0.14, green: 0.15, blue: 0.22, alpha: 1), intensity: 520)

        // 棚を並べる。奥行きを段で作ると、平らな壁より「部屋」に見える
        var r = SeededRandom(515)
        for row in 0..<3 {
            let z = Float(-4 - row * 5)
            let shade = 0.20 - Double(row) * 0.04
            for i in 0..<7 {
                let x = Float(-9 + i * 3)
                let case_ = SCNNode()
                let wood = UIColor(red: shade + 0.06, green: shade, blue: shade - 0.05, alpha: 1)
                for side in [-0.9 as Float, 0.9] {
                    let post = solid(SCNBox(width: 0.16, height: 5.4, length: 0.7, chamferRadius: 0.02), wood)
                    post.position = SCNVector3(side, 2.7, 0)
                    case_.addChildNode(post)
                }
                for k in 0..<4 {
                    let shelf = solid(SCNBox(width: 1.9, height: 0.1, length: 0.7, chamferRadius: 0.01), wood)
                    shelf.position.y = Float(0.8 + Double(k) * 1.35)
                    case_.addChildNode(shelf)
                    // 巻物。色をわずかに散らして「同じ物が並んでいる」感じを避ける
                    for m in 0..<4 {
                        let hue = CGFloat(r.range(0.06, 0.12))
                        let book = solid(
                            SCNBox(width: CGFloat(r.range(0.12, 0.26)), height: CGFloat(r.range(0.6, 1.0)),
                                   length: 0.5, chamferRadius: 0.02),
                            UIColor(hue: hue, saturation: 0.35, brightness: CGFloat(r.range(0.18, 0.4)), alpha: 1))
                        book.position = SCNVector3(Float(-0.6 + Double(m) * 0.4),
                                                   Float(1.2 + Double(k) * 1.35), 0)
                        case_.addChildNode(book)
                    }
                }
                case_.position = SCNVector3(x, 0, z)
                scene.rootNode.addChildNode(case_)
            }
        }

        // 机の灯り。1点だけ暖かくして、読む場所であることを言う
        lamp = light(.omni, UIColor(red: 1.0, green: 0.80, blue: 0.48, alpha: 1),
                     intensity: 2600, at: SCNVector3(0, -1.4, 11))
        glowNode = glow(UIColor(red: 1.0, green: 0.80, blue: 0.48, alpha: 1), size: 2.6, opacity: 0.30)
        glowNode.position = SCNVector3(0, -2.2, 11.6)
        scene.rootNode.addChildNode(glowNode)

        // 手前の机。**下半分が真っ黒に空いていた。** 図鑑は「机で本を繰る」画面なので、
        // 手前に机と開いた本を置けば、空白が埋まると同時に何の場所かが言える
        let desk = SCNNode()
        let top = solid(SCNBox(width: 13, height: 0.4, length: 5, chamferRadius: 0.06),
                        UIColor(red: 0.22, green: 0.16, blue: 0.12, alpha: 1), roughness: 0.8)
        desk.addChildNode(top)
        for dx in [-5.6 as Float, 5.6] {
            let leg = solid(SCNBox(width: 0.5, height: 4.4, length: 0.5, chamferRadius: 0.03),
                            UIColor(red: 0.18, green: 0.13, blue: 0.10, alpha: 1))
            leg.position = SCNVector3(dx, -2.4, 0)
            desk.addChildNode(leg)
        }
        // 開いた本。2枚の板をハの字に伏せる
        for side in [-1.0 as Float, 1.0] {
            let page = solid(SCNBox(width: 2.6, height: 0.08, length: 3.4, chamferRadius: 0.01),
                             UIColor(red: 0.74, green: 0.69, blue: 0.56, alpha: 1), roughness: 0.9)
            page.position = SCNVector3(side * 1.35, 0.34, 0)
            page.eulerAngles.z = -side * 0.10
            desk.addChildNode(page)
        }
        desk.position = SCNVector3(0, -3.4, 12)
        scene.rootNode.addChildNode(desk)

        dust = motes(count: 40, spread: SCNVector3(14, 8, 8), color: .white, size: 0.06, seed: 33)
        dust.position.y = -1
        dust.opacity = 0.25
        scene.rootNode.addChildNode(dust)
    }

    override func update(_ t: TimeInterval) {
        let ft = Float(t)
        lamp.light?.intensity = CGFloat(1500 + Double(sin(ft * 2.2)) * 90)
        glowNode.scale = v3(1 + sin(ft * 1.6) * 0.04)
    }
}

// MARK: - 潜行中の道中

/// 潜行中の1人を映す。
///
/// **深さの目盛りを置かない。** 松明が10個並ぶ竪坑（`DescentScene`）は
/// 「何番目まで到達したか」を語ってしまう。ところが結果は出発の瞬間に
/// 確定していて、まだ見せていない——だから「今ここまで来た」と言える情報は
/// こちらには無い。言えるのは**時間がどれだけ経ったか**だけ。
///
/// なので灯りは1つだけ置き、経過時間ぶんだけ下へ動かす。
/// 目盛りが無ければ、それは「進んでいる」以上のことを主張しない。
final class TravelScene: WorldScene {
    private var lantern: SCNNode!
    private var lanternLight: SCNNode!
    private var dust: SCNNode!
    private var want = UIColor(red: 1.0, green: 0.72, blue: 0.38, alpha: 1)
    private var cur = UIColor(red: 1.0, green: 0.72, blue: 0.38, alpha: 1)
    private var progress = 0.0
    private var wantProgress = 0.0

    private let top: Float = 9
    private let bottom: Float = -11

    override init() {
        super.init()
        fog(UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1), start: 16, end: 74)
        _ = addCamera(fov: 52, at: SCNVector3(0, 0, 20), look: SCNVector3(0, -0.5, 0))
        _ = light(.ambient, UIColor(red: 0.16, green: 0.20, blue: 0.32, alpha: 1), intensity: 520)

        // 坑道の壁。左右に積んで、間を降りていく道に見せる
        var r = SeededRandom(717)
        for i in 0..<22 {
            for side in [-1.0, 1.0] {
                let b = rock(CGFloat(r.range(2.4, 4.0)), CGFloat(r.range(1.8, 3.0)),
                             CGFloat(r.range(1.8, 3.0)),
                             UIColor(red: 0.13, green: 0.15, blue: 0.22, alpha: 1),
                             seed: UInt32(720 + i * 2))
                b.position = SCNVector3(Float(side * r.range(4.4, 5.6)),
                                        top - Float(i) * 1.0, Float(r.range(-2, 1)))
                scene.rootNode.addChildNode(b)
            }
        }

        // 灯り。**これ1つだけ。**
        lantern = glow(want, size: 3.4, opacity: 0.85)
        lantern.position = SCNVector3(0, top, 1.5)
        scene.rootNode.addChildNode(lantern)
        lanternLight = light(.omni, want, intensity: 1700, at: SCNVector3(0, top, 2))
        lanternLight.light?.attenuationEndDistance = 20

        dust = motes(count: 60, spread: SCNVector3(9, 22, 6), color: .white, size: 0.07, seed: 44)
        dust.opacity = 0.22
        scene.rootNode.addChildNode(dust)
    }

    /// `presence` に経過の割合、`accent` に行き先の色が来る
    override func apply(_ mood: Mood) {
        want = UIColor(mood.accent)
        wantProgress = Swift.max(0, Swift.min(1, mood.presence))
    }

    override func update(_ t: TimeInterval) {
        progress += (wantProgress - progress) * 0.05
        let ft = Float(t)
        // 揺れながら降りる。歩いている感じは、等速でないことから出る
        let y = top + (bottom - top) * Float(progress) + sin(ft * 1.9) * 0.22
        lantern.position.y = y
        lanternLight.position.y = y
        lantern.scale = v3(1 + sin(ft * 2.7) * 0.05)

        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        want.getRed(&r, green: &g, blue: &b, alpha: &a)
        var cr: CGFloat = 0, cg: CGFloat = 0, cb: CGFloat = 0
        cur.getRed(&cr, green: &cg, blue: &cb, alpha: &a)
        cur = UIColor(red: cr + (r - cr) * 0.06, green: cg + (g - cg) * 0.06,
                      blue: cb + (b - cb) * 0.06, alpha: 1)
        lantern.geometry?.firstMaterial?.diffuse.contents = WorldScene.radialTexture(cur)
        lanternLight.light?.color = cur
        lanternLight.light?.intensity = CGFloat(1500 + Double(sin(ft * 3.3)) * 140)
        dust.position.y = Float((Double(ft) * 0.35).truncatingRemainder(dividingBy: 4)) - 2
    }
}
