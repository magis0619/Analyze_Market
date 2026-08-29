import SceneKit
import UIKit

// 画面ごとのシーン。web 版 §6.6 の対応表をそのまま持ってきている。
//
// | 画面 | 何を映すか | 状態で何が変わるか |
// |---|---|---|
// | 拠点 | 星・遠景の山・小屋・煙・焚き火・看板・郵便受け・宝箱・棚・温室 | 潜行中は灯りが落ち、用がある物だけ光って少し浮く |
// | 派遣準備 | 覗き込むダンジョンの入口 | 派遣先の属性で奥の光の色、深さで塵の密度 |
// | 派遣先の地図 | 折り返して降りる経路と10個のノード | 未解放＝暗い / 解放＝灯る / 踏破＝属性色 |
// | 装備選択 | 一点を照らす展示台 | レアリティで光の色とオーラの強さ |
// | 帰還レポート | 到達深度まで灯る竪坑 | 派遣先の属性で色 |
// | 開封 | 光の奔流 | レアリティで強度 |
// | 薬草園 | ガラスの温室・土のベッド・株 | 枠の数・植えたもの・育ち具合がそのまま出る |
// | 錬金工房 | 大鍋 | 選んだ薬の属性で液の色 |

// MARK: - 拠点

final class BaseScene: WorldScene {
    private var presence = 1.0
    private var wantPresence = 1.0
    private var gReady = 0.0
    private var hearth: SCNNode!
    private var flame: SCNNode!
    private var windows: [SCNNode] = []
    private var greenLight: SCNNode!
    private var greenGlow: SCNNode!
    private var props: [(id: String, root: SCNNode, mat: SCNMaterial, halo: SCNNode)] = []
    private var propNow: [String: Double] = [:]
    private var propWant: [String: Double] = [:]
    private var camNode: SCNNode!
    /// 潜行中に灯る、道沿いの提灯。
    private var waitLamps: [SCNNode] = []
    /// タイトル用の遠景。**同じ拠点を、遠くから一度だけ見せる。**
    /// タイトルと拠点が同じ絵だと「画面が変わった」と感じない
    /// （8x8 明度の指紋で 3.1 しか離れていなかった）。
    private let vista: Bool

    init(vista: Bool = false) {
        self.vista = vista
        super.init()
        // 霧は薄く。濃いと小屋も木も山も形が読めないところまで沈む
        fog(UIColor(red: 0.04, green: 0.05, blue: 0.09, alpha: 1), start: 26, end: 130)

        // 引いて全体を入れる。近いと小屋だけで横幅が埋まり、
        // 物が中央に固まって名札が重なる（実際に4つとも重なった）
        camNode = vista
            // 谷の向こうから見下ろす。空と山が主役になり、拠点は灯りの点になる
            ? addCamera(fov: 40, at: SCNVector3(-6, 20, 74), look: SCNVector3(0, 1.5, -6))
            : addCamera(fov: 46, at: SCNVector3(0.4, 7.5, 42), look: SCNVector3(0, -3.5, 2))

        // 「夜」と「見えない」は別。環境光と月光を上げ、下からの弱い反射を足して
        // 面の向きが分かるようにする。暗さは霧ではなく周辺減光で作る
        _ = light(.ambient, UIColor(red: 0.21, green: 0.26, blue: 0.42, alpha: 1), intensity: 620)
        let moon = light(.directional, UIColor(red: 0.70, green: 0.76, blue: 1.0, alpha: 1), intensity: 560)
        moon.position = SCNVector3(-10, 18, 12)
        moon.look(at: SCNVector3Zero)
        let bounce = light(.directional, UIColor(red: 0.42, green: 0.50, blue: 0.72, alpha: 1), intensity: 240)
        bounce.position = SCNVector3(6, -8, 10)
        bounce.look(at: SCNVector3Zero)

        scene.rootNode.addChildNode(stars(count: 150, radius: 90, seed: 7))

        // 地面
        let ground = solid(SCNPlane(width: 200, height: 200),
                           UIColor(red: 0.15, green: 0.19, blue: 0.29, alpha: 1))
        ground.eulerAngles.x = -.pi / 2
        ground.position.y = -0.4
        scene.rootNode.addChildNode(ground)

        // 遠景の山。空より暗くして輪郭を重ねる（明るいと切り絵に見える）
        var r = SeededRandom(31)
        for i in 0..<9 {
            let w = CGFloat(r.range(24, 46))
            let h = CGFloat(r.range(14, 30))
            let m = solid(SCNPyramid(width: w, height: h, length: w * 0.7),
                          UIColor(red: 0.055, green: 0.07, blue: 0.12, alpha: 1), roughness: 1)
            m.position = SCNVector3(Float(r.range(-70, 70)), -1, Float(-58 - Double(i) * 4))
            scene.rootNode.addChildNode(m)
        }

        // 木立
        for i in 0..<7 {
            let t = SCNNode()
            let trunk = solid(SCNCylinder(radius: 0.11, height: 1.4),
                              UIColor(red: 0.16, green: 0.13, blue: 0.10, alpha: 1))
            trunk.position.y = 0.7
            t.addChildNode(trunk)
            for k in 0..<3 {
                let cone = solid(SCNCone(topRadius: 0, bottomRadius: CGFloat(0.95 - Double(k) * 0.22),
                                         height: 1.3),
                                 UIColor(red: 0.08, green: 0.16, blue: 0.13, alpha: 1))
                cone.position.y = Float(1.5 + Double(k) * 0.75)
                t.addChildNode(cone)
            }
            t.position = SCNVector3(Float(r.range(-16, 16)), 0, Float(r.range(-22, -8)))
            t.scale = v3(Float(r.range(0.8, 1.5)))
            scene.rootNode.addChildNode(t)
        }

        // 小屋
        let lodge = SCNNode()
        let wall = solid(SCNBox(width: 5.2, height: 2.8, length: 4, chamferRadius: 0.06),
                         UIColor(red: 0.37, green: 0.29, blue: 0.22, alpha: 1))
        wall.position.y = 1.4
        lodge.addChildNode(wall)
        let roof = solid(SCNPyramid(width: 6.6, height: 1.9, length: 5.4),
                         UIColor(red: 0.40, green: 0.20, blue: 0.18, alpha: 1))
        roof.position.y = 2.8
        lodge.addChildNode(roof)
        let chimney = solid(SCNBox(width: 0.5, height: 1.6, length: 0.5, chamferRadius: 0.03),
                            UIColor(red: 0.24, green: 0.22, blue: 0.22, alpha: 1))
        chimney.position = SCNVector3(1.7, 3.6, -0.4)
        lodge.addChildNode(chimney)
        // 窓。ロウソクの揺らぎで在宅を出す
        for dx in [-1.4 as Float, 1.4] {
            let pane = solid(SCNPlane(width: 0.9, height: 0.8),
                             UIColor(red: 1.0, green: 0.84, blue: 0.55, alpha: 1),
                             emission: UIColor(red: 1.0, green: 0.84, blue: 0.55, alpha: 1),
                             emissionScale: 1.0)
            pane.geometry?.firstMaterial?.lightingModel = .constant
            pane.position = SCNVector3(dx, 1.5, 2.01)
            lodge.addChildNode(pane)
            let g = glow(UIColor(red: 1.0, green: 0.80, blue: 0.48, alpha: 1), size: 2.2, opacity: 0.28)
            g.position = SCNVector3(dx, 1.5, 2.2)
            lodge.addChildNode(g)
            windows.append(pane)
            windows.append(g)
        }
        let door = solid(SCNPlane(width: 0.9, height: 1.6),
                         UIColor(red: 0.09, green: 0.07, blue: 0.05, alpha: 1))
        door.position = SCNVector3(0, 0.9, 2.02)
        lodge.addChildNode(door)
        lodge.position = SCNVector3(-3.4, 0, -1.5)
        scene.rootNode.addChildNode(lodge)

        // 道沿いの提灯。**潜行中だけ灯す。**
        //
        // 留守を「家の灯りが減る」だけで表すと、変化が引き算にしかならず
        // 気づかれない（実際、派遣中と拠点の絵をほとんど区別できなかった）。
        // 出ている間だけ道に灯がともるなら、変化は足し算になって目に入る。
        for i in 0..<5 {
            let post = SCNNode()
            let pole = solid(SCNCylinder(radius: 0.06, height: 1.8),
                             UIColor(red: 0.20, green: 0.16, blue: 0.12, alpha: 1))
            pole.position.y = 0.9
            post.addChildNode(pole)
            let lantern = solid(SCNSphere(radius: 0.20),
                                UIColor(red: 1.0, green: 0.72, blue: 0.36, alpha: 1),
                                emission: UIColor(red: 1.0, green: 0.72, blue: 0.36, alpha: 1),
                                emissionScale: 1.0)
            lantern.geometry?.firstMaterial?.lightingModel = .constant
            lantern.position.y = 1.9
            post.addChildNode(lantern)
            let halo = glow(UIColor(red: 1.0, green: 0.66, blue: 0.30, alpha: 1),
                            size: 1.5, opacity: 0.5)
            halo.position.y = 1.9
            post.addChildNode(halo)
            // 右奥へ、坑道の方角へ向かって並べる
            post.position = SCNVector3(Float(2.0 + Double(i) * 2.3), 0,
                                       Float(5.0 - Double(i) * 3.4))
            post.opacity = 0
            scene.rootNode.addChildNode(post)
            waitLamps.append(post)
        }

        // 煙
        let smoke = motes(count: 22, spread: SCNVector3(1.2, 7, 1.2),
                          color: UIColor(white: 0.55, alpha: 1), size: 0.34, seed: 91)
        smoke.position = SCNVector3(-1.7, 4.4, -1.9)
        smoke.opacity = 0.30
        scene.rootNode.addChildNode(smoke)

        // 焚き火
        let fire = SCNNode()
        for i in 0..<5 {
            let log = solid(SCNCylinder(radius: 0.09, height: 1.1),
                            UIColor(red: 0.18, green: 0.13, blue: 0.09, alpha: 1))
            log.eulerAngles = SCNVector3(Float.pi / 2.4, Float(i) / 5 * .pi * 2, 0)
            log.position.y = 0.16
            fire.addChildNode(log)
        }
        flame = glow(UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), size: 2.6, opacity: 1)
        flame.position.y = 0.55
        fire.addChildNode(flame)
        fire.position = SCNVector3(1.6, 0, 1.5)
        scene.rootNode.addChildNode(fire)
        hearth = light(.omni, UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), intensity: 900,
                       at: SCNVector3(1.6, 1.1, 1.5))
        let embers = motes(count: 18, spread: SCNVector3(1.4, 4, 1.4),
                           color: UIColor(red: 1.0, green: 0.55, blue: 0.28, alpha: 1),
                           size: 0.10, seed: 44)
        embers.position = SCNVector3(1.6, 0.5, 1.5)
        scene.rootNode.addChildNode(embers)

        // 温室（薬草園）。夜の紺の中でここだけ緑に灯る
        let green = SCNNode()
        let glassMat = UIColor(red: 0.62, green: 0.85, blue: 0.75, alpha: 0.14)
        let body = solid(SCNBox(width: 3.4, height: 1.9, length: 2.6, chamferRadius: 0.04), glassMat)
        body.geometry?.firstMaterial?.isDoubleSided = true
        body.geometry?.firstMaterial?.blendMode = .alpha
        body.geometry?.firstMaterial?.writesToDepthBuffer = false
        body.position.y = 0.95
        green.addChildNode(body)
        let gRoof = solid(SCNPyramid(width: 3.6, height: 0.9, length: 2.8), glassMat)
        gRoof.geometry?.firstMaterial?.isDoubleSided = true
        gRoof.geometry?.firstMaterial?.writesToDepthBuffer = false
        gRoof.position.y = 1.9
        green.addChildNode(gRoof)
        for gx in [-1.7 as Float, 1.7] {
            for gz in [-1.3 as Float, 1.3] {
                let post = solid(SCNBox(width: 0.12, height: 1.9, length: 0.12, chamferRadius: 0),
                                 UIColor(red: 0.23, green: 0.29, blue: 0.25, alpha: 1))
                post.position = SCNVector3(gx, 0.95, gz)
                green.addChildNode(post)
            }
        }
        greenGlow = glow(UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1), size: 3.4, opacity: 0.34)
        greenGlow.position.y = 1.0
        green.addChildNode(greenGlow)
        green.position = SCNVector3(6.8, 0, -0.5)
        scene.rootNode.addChildNode(green)
        greenLight = light(.omni, UIColor(red: 0.61, green: 0.88, blue: 0.54, alpha: 1),
                           intensity: 420, at: SCNVector3(6.8, 1.2, 0.7))
        let gFoot = SCNNode()
        gFoot.position = SCNVector3(0, -0.2, 1.6)
        green.addChildNode(gFoot)
        if !vista { hotspots["garden"] = gFoot }

        addProps()
    }

    /// 拠点の「用事」を物にする。
    ///
    /// 同じ大きさ・同じ角丸のタイルが並んでいると、押す先が4つあることは
    /// 分かっても、**そこに何があるか**は文字を読むまで分からない。
    /// 看板・郵便受け・宝箱・棚なら、絵を見た時点で分かる。
    private func addProps() {
        let wood = UIColor(red: 0.42, green: 0.34, blue: 0.24, alpha: 1)

        // 看板（派遣）
        let sign = SCNNode()
        for dx in [-0.42 as Float, 0.42] {
            let post = solid(SCNBox(width: 0.13, height: 1.7, length: 0.13, chamferRadius: 0.01), wood)
            post.position = SCNVector3(dx, 0.85, 0)
            sign.addChildNode(post)
        }
        let board = solid(SCNBox(width: 1.5, height: 0.86, length: 0.1, chamferRadius: 0.02), wood)
        board.position.y = 1.5
        board.eulerAngles.x = -0.12
        sign.addChildNode(board)
        register("sign", sign, at: SCNVector3(-6.2, 0, 6.4),
                 mat: board.geometry!.firstMaterial!,
                 haloColor: UIColor(red: 0.91, green: 0.75, blue: 0.45, alpha: 1), haloY: 1.5)

        // 郵便受け（レポート）。旗が立っていれば未読
        let mail = SCNNode()
        let metal = UIColor(red: 0.29, green: 0.33, blue: 0.44, alpha: 1)
        let mpost = solid(SCNCylinder(radius: 0.07, height: 1.2), metal)
        mpost.position.y = 0.6
        mail.addChildNode(mpost)
        let mbox = solid(SCNBox(width: 0.62, height: 0.42, length: 0.86, chamferRadius: 0.18),
                         metal, roughness: 0.5, metalness: 0.35)
        mbox.position.y = 1.4
        mail.addChildNode(mbox)
        let flagNode = solid(SCNBox(width: 0.34, height: 0.24, length: 0.05, chamferRadius: 0.01),
                             UIColor(red: 0.85, green: 0.34, blue: 0.25, alpha: 1),
                             emission: UIColor(red: 0.85, green: 0.34, blue: 0.25, alpha: 1),
                             emissionScale: 0.4)
        flagNode.position = SCNVector3(0.42, 1.72, 0)
        flagNode.name = "flag"
        mail.addChildNode(flagNode)
        register("mail", mail, at: SCNVector3(-3.0, 0, 7.8),
                 mat: mbox.geometry!.firstMaterial!,
                 haloColor: UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1), haloY: 1.72)

        // 宝箱（未鑑定品）。中身があるときだけ蓋の隙間から光が漏れる
        let chest = SCNNode()
        let cwood = UIColor(red: 0.35, green: 0.25, blue: 0.15, alpha: 1)
        let cbody = solid(SCNBox(width: 1.3, height: 0.72, length: 0.9, chamferRadius: 0.05), cwood)
        cbody.position.y = 0.36
        chest.addChildNode(cbody)
        let lid = solid(SCNCylinder(radius: 0.45, height: 1.3), cwood)
        lid.eulerAngles.z = .pi / 2
        lid.position.y = 0.74
        chest.addChildNode(lid)
        let band = solid(SCNBox(width: 0.16, height: 0.8, length: 0.94, chamferRadius: 0),
                         UIColor(red: 0.54, green: 0.42, blue: 0.20, alpha: 1),
                         roughness: 0.4, metalness: 0.5)
        band.position.y = 0.4
        chest.addChildNode(band)
        register("chest", chest, at: SCNVector3(0.4, 0, 8.4),
                 mat: cbody.geometry!.firstMaterial!,
                 haloColor: UIColor(red: 1.0, green: 0.82, blue: 0.48, alpha: 1), haloY: 0.78)

        // 棚（所持品）。溢れかけているときだけ赤く灯る
        let shelf = SCNNode()
        let swood = UIColor(red: 0.31, green: 0.24, blue: 0.17, alpha: 1)
        for dx in [-0.62 as Float, 0.62] {
            let side = solid(SCNBox(width: 0.12, height: 1.8, length: 0.5, chamferRadius: 0.01), swood)
            side.position = SCNVector3(dx, 0.9, 0)
            shelf.addChildNode(side)
        }
        for y in [0.35 as Float, 0.95, 1.55] {
            let board = solid(SCNBox(width: 1.36, height: 0.09, length: 0.5, chamferRadius: 0.01), swood)
            board.position.y = y
            shelf.addChildNode(board)
        }
        var jr = SeededRandom(77)
        for (i, p) in [(-0.32, 0.55), (0.18, 0.5), (0.42, 1.14), (-0.24, 1.75)].enumerated() {
            let junk = solid(SCNBox(width: 0.22, height: 0.34, length: 0.22, chamferRadius: 0.02),
                             UIColor(red: 0.43, green: 0.47, blue: 0.58, alpha: 1),
                             roughness: 0.55, metalness: 0.3)
            junk.position = SCNVector3(Float(p.0), Float(p.1), 0)
            junk.eulerAngles.z = Float(jr.range(0, 0.5)) * Float(i)
            shelf.addChildNode(junk)
        }
        register("shelf", shelf, at: SCNVector3(3.8, 0, 7.6),
                 mat: shelf.childNodes[0].geometry!.firstMaterial!,
                 haloColor: UIColor(red: 1.0, green: 0.37, blue: 0.44, alpha: 1), haloY: 1.0)
    }

    private func register(_ id: String, _ node: SCNNode, at p: SCNVector3,
                          mat: SCNMaterial, haloColor: UIColor, haloY: Float) {
        node.position = p
        scene.rootNode.addChildNode(node)
        let halo = glow(haloColor, size: 2.2, opacity: 0)
        halo.position.y = haloY
        node.addChildNode(halo)
        // 目印は物の**足元**に取る。SwiftUI 側は名札を下にぶら下げるので、
        // 中心に取ると名札が物の胴を隠す
        let foot = SCNNode()
        foot.position = SCNVector3(0, -0.1, 0.4)
        node.addChildNode(foot)
        if !vista { hotspots[id] = foot }
        props.append((id, node, mat, halo))
        propNow[id] = 0
        propWant[id] = 0
    }

    override func apply(_ mood: Mood) {
        wantPresence = mood.presence
        gReady = mood.intensity
        propWant["chest"] = mood.props.chest
        propWant["mail"] = mood.props.mail
        propWant["sign"] = mood.props.sign
        propWant["shelf"] = mood.props.shelf
    }

    override func update(_ t: TimeInterval) {
        presence += (wantPresence - presence) * 0.06
        let ft = Float(t)

        flame.scale = v3(1 + sin(ft * 7.3) * 0.09 + sin(ft * 3.1) * 0.05)
        hearth.light?.intensity = CGFloat((620 + sin(ft * 9.1) * 150) * Float(0.55 + presence * 0.45))

        // ロウソクの揺らぎ。周期の違う波を重ねると規則正しさが消える。
        // 留守のときは片方だけ消す——全部消すと「誰もいない家」になり、
        // 帰る場所という温度感が失われる
        for (i, w) in windows.enumerated() {
            let phase = Float(i) * 1.7
            let flick = 0.82 + sin(ft * 6.1 + phase) * 0.09 + sin(ft * 2.3 + phase) * 0.06
            let lit: Float = (i >= 2 && presence < 0.5) ? 0.14 : 1
            w.opacity = CGFloat(flick * lit)
        }

        // 出ている人数が多いほど、道の灯が先まで伸びる
        let away = Float(max(0, min(1, 1 - presence)))
        for (i, lamp) in waitLamps.enumerated() {
            let reach = max(0, min(1, away * 5 - Float(i)))
            lamp.opacity = CGFloat(reach) * CGFloat(0.75 + sin(ft * 2.4 + Float(i) * 1.3) * 0.2)
        }

        greenLight.light?.intensity = CGFloat((470 + sin(ft * 0.9) * 70) * Float(1 + gReady * 0.7))
        greenGlow.scale = v3(Float(1 + gReady * 0.35) * (1 + sin(ft * 1.3) * 0.06))

        // 用がある物だけ光る。件数は名札のバッジが言う——World層は数字を描かない
        for (i, p) in props.enumerated() {
            let want = propWant[p.id] ?? 0
            let now = (propNow[p.id] ?? 0) + (want - (propNow[p.id] ?? 0)) * 0.08
            propNow[p.id] = now
            let pulse = 0.5 + sin(ft * 2.2 + Float(i)) * 0.5
            p.mat.emission.contents = p.halo.geometry?.firstMaterial?.diffuse.contents
            p.mat.emission.intensity = CGFloat(now * Double(0.25 + pulse * 0.5))
            p.halo.opacity = CGFloat(now * Double(0.25 + pulse * 0.45))
            p.halo.scale = v3(Float(1 + now * Double(0.6 + pulse * 0.4)))
            // 用があるものは、ほんの少し浮いて呼ぶ
            p.root.position.y = Float(now) * (0.06 + sin(ft * 1.7 + Float(i)) * 0.06)
            if let flag = p.root.childNode(withName: "flag", recursively: true) {
                flag.eulerAngles.z = Float(-1.1 + now * 1.1)
            }
        }

        // カメラの漂い。振幅は控えめに
        camNode.position.x = 0.8 + sin(ft * 0.16) * 1.1
        camNode.position.y = 4.6 + sin(ft * 0.11) * 0.3
        camNode.look(at: SCNVector3(0, -2.0, 0))
    }
}
