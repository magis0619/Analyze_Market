import XCTest

/// 画面の検査（docs/IOS-RUBRIC.md の A・B・C）。
///
/// **目で見た印象を点にしない。** 「重なっていない」「44pt ある」「本当に押せる」は
/// 測れる。測れるものは全部ここで測って、目視は測れないものだけに残す。
///
/// web 版の Playwright 検査（854件）の対応物。DOM の代わりに
/// アクセシビリティの木を見る——**要素の枠と、押せるかどうか**が取れる。
final class AuditTests: XCTestCase {

    private var failures: [String] = []
    private var passed = 0

    override func setUp() {
        continueAfterFailure = true
    }

    private func check(_ id: String, _ screen: String, _ ok: Bool,
                       _ detail: @autoclosure () -> String) {
        if ok { passed += 1; return }
        failures.append("  \(id) [\(screen)] \(detail())")
    }

    private func launch(_ args: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = args
        app.launch()
        // 3D と遷移が落ち着くまで待つ。動いている最中に測ると枠が動く
        Thread.sleep(forTimeInterval: 1.4)
        return app
    }

    // MARK: - 画面ごとの検査

    /// 検査する画面。**一覧は1つにする**——検査ごとに別々に書いていると、
    /// 画面を足したときに片方だけ増えて、通っている検査の範囲が分からなくなる。
    static let screens: [(String, [String])] = [
            ("base", ["-reset", "-devitems", "24", "-pending", "5", "-grown",
                      "-gold", "5000", "-screen", "base"]),
            ("dispatch", ["-reset", "-devitems", "24", "-grown", "-gold", "5000",
                          "-screen", "dispatch"]),
            ("inventory", ["-reset", "-devitems", "24", "-gold", "5000", "-screen", "inventory"]),
            ("garden", ["-reset", "-devitems", "8", "-grown", "-gold", "5000", "-screen", "garden"]),
            ("alchemy", ["-reset", "-devitems", "8", "-grown", "-gold", "5000", "-screen", "alchemy"]),
            ("compendium", ["-reset", "-devitems", "24", "-screen", "compendium"]),
            ("opening", ["-reset", "-devitems", "8", "-pending", "6", "-screen", "opening"]),
            ("report", ["-reset", "-devitems", "24", "-report", "-screen", "report"]),
        ("title", ["-reset", "-screen", "title"])
    ]

    func test画面の検査() {
        for (name, args) in Self.screens {
            let app = launch(args)
            audit(app, name)
            app.terminate()
        }

        report()
    }

    private func audit(_ app: XCUIApplication, _ screen: String) {
        let W = app.frame.width
        let H = app.frame.height

        // **見えている範囲だけを見る。**
        // ScrollView の外にある要素は「押せない」のではなく「まだ画面に来ていない」。
        // 混ぜると、スクロールすれば届くものまで欠陥として数えてしまう。
        // 下端は ActionBar の上まで（そこから下は本文ではない）。
        let cta = app.buttons["cta"]
        let contentTop: CGFloat = 56
        let contentBottom: CGFloat = {
            var b = H
            for id in ["cta", "equip", "plant"] {
                let e = app.buttons[id]
                if e.exists, e.frame.height > 1 { b = min(b, e.frame.minY - 4) }
            }
            return b
        }()
        func visible(_ f: CGRect) -> Bool {
            f.minY >= contentTop - 12 && f.maxY <= contentBottom + 8
                && f.minX >= -0.5 && f.maxX <= W + 0.5
        }

        // 押せるもの（ボタン・セグメント）を集める
        var controls: [(String, CGRect)] = []
        for kind in [app.buttons, app.segmentedControls] {
            for i in 0..<kind.count {
                let e = kind.element(boundBy: i)
                guard e.exists, e.isHittable else { continue }
                let f = e.frame
                guard f.width > 1, f.height > 1 else { continue }
                let label = e.label.isEmpty ? e.identifier : e.label
                controls.append((String(label.prefix(16)), f))
                _ = label
            }
        }

        // A3: タップ対象が 44pt 以上
        // **ここは Apple の指針でもあり、web 版の U3 と同じ基準。**
        // 小さいものは「押せるつもりで押せない」を生む
        let small = controls.filter { $0.1.height < 43.5 || $0.1.width < 43.5 }
        check("A3", screen, small.isEmpty,
              "44pt 未満 \(small.count)件: " + small.prefix(3)
                .map { "\($0.0) \(Int($0.1.width))×\(Int($0.1.height))" }.joined(separator: " / "))

        // A4: 押せるものどうしが重なっていない
        // 3D の位置から置く名札は、放っておくと重なる（実際に4つ重なった）
        var overlaps: [String] = []
        let onScreen = controls.filter { visible($0.1) }
        for i in 0..<onScreen.count {
            for j in (i + 1)..<onScreen.count {
                let a = onScreen[i].1, b = onScreen[j].1
                let inter = a.intersection(b)
                // **入れ子は数えない。** 部品の中に部品がある形（タブの中のタブ）は
                // 設計であって重なりではない。含んでいる側を除く
                if a.contains(b) || b.contains(a) { continue }
                // 少しの重なりは影の分。面積で見る
                if inter.width > 4, inter.height > 4 {
                    overlaps.append("\(onScreen[i].0)×\(onScreen[j].0)")
                }
            }
        }
        check("A4", screen, overlaps.isEmpty,
              "重なり \(overlaps.count)件: " + overlaps.prefix(3).joined(separator: " / "))

        // A5: 横にはみ出していない
        let out = controls.filter { $0.1.minX < -0.5 || $0.1.maxX > W + 0.5 }
        check("A5", screen, out.isEmpty,
              "画面外 \(out.count)件: " + out.prefix(3).map(\.0).joined(separator: " / "))

        // A1: 文字が名札や板からはみ出していない（枠が画面内にあること）
        var texts: [(String, CGRect)] = []
        for i in 0..<app.staticTexts.count {
            let e = app.staticTexts.element(boundBy: i)
            guard e.exists, e.frame.width > 1 else { continue }
            texts.append((String(e.label.prefix(14)), e.frame))
        }
        let clipped = texts.filter { $0.1.minX < -0.5 || $0.1.maxX > W + 0.5 }
        check("A1", screen, clipped.isEmpty,
              "文字が画面外 \(clipped.count)件: " + clipped.prefix(3).map(\.0).joined(separator: " / "))

        // A2: 本文のコントラストが 4.5:1 以上（大きい文字は 3:1）
        // **板の上も 3D の上もまとめて測る。** トークンの色だけ検査していると、
        // 3D に直に置いた文字は素通りする。実際タイトルの副題が読めなかった。
        if let sheet = PixelSheet(XCUIScreen.main.screenshot(),
                                  points: CGSize(width: W, height: H)) {
            var faint: [String] = []
            // **字が1つも写っていない枠は測れない。**
            // ScrollView の中の要素は、画面外へ流れていても枠だけは
            // 元の位置で返ってくることがある（撤退ルールの枠 @32,768 には
            // 実際には何も描かれていなかった）。一様な区画は
            // 「読めない」ではなく「そこに字が無い」なので、数を控えて先へ進む。
            var flat = 0
            for (label, f) in texts {
                // **上端の帯に潜り込んだ文字は数えない。** スクロールの途中で
                // TopBar の下に入っているだけで、色の欠陥ではない
                // （1.0:1＝一様な帯を測っていた、という報告が出ていた）
                guard f.height >= 9, f.width >= 12, visible(f), f.minY >= contentTop + 8
                else { continue }
                // 大きい文字は 3:1 で足りる（WCAG 1.4.3 の large text）
                let need = f.height >= 26 ? 3.0 : 4.5
                guard let c = sheet.contrast(f.insetBy(dx: 1, dy: 1)) else { continue }
                if c < 1.05 { flat += 1; continue }
                if c < need {
                    faint.append("\(label) \(String(format: "%.1f", c)):1 "
                                 + "@\(Int(f.minX)),\(Int(f.minY)) \(Int(f.width))x\(Int(f.height))")
                }
            }
            check("A2", screen, faint.isEmpty,
                  "読めない文字 \(faint.count)件: " + faint.prefix(3).joined(separator: " / "))
            // 枠と実際の描画がずれている要素が増えていないかは別に見張る。
            // ここが膨らんだら、A2 が黙って素通りしている件数が増えているということ
            check("A2b", screen, flat <= 2, "枠に字が無い要素が \(flat)件（測れていない）")
        }

        // A4b: 3D に置いた名札が本文の文字を踏んでいないか。
        // 名札は 3D 由来の座標なので、板の上に落ちてくることがある
        var propTags: [(String, CGRect)] = []
        for id in ["prop-sign", "prop-mail", "prop-chest", "prop-shelf", "prop-garden"] {
            let e = app.buttons[id]
            if e.exists, e.isHittable { propTags.append((id, e.frame)) }
        }
        var stomped: [String] = []
        for (pid, pf) in propTags {
            for (t, tf) in texts where tf.height > 6 {
                // **チップ自身の文字は数えない。** 名前も件数もチップの中にある
                if pf.contains(tf) { continue }
                let inter = pf.intersection(tf)
                if inter.width > 6, inter.height > 6 { stomped.append("\(pid)×\(t)") }
            }
        }
        check("A4b", screen, stomped.isEmpty,
              "名札が文字を踏んでいる \(stomped.count)件: " + stomped.prefix(3).joined(separator: " / "))

        // B1: 主要動線が1つ、親指到達域（画面下 1/3）にある
        //
        // **`if cta.exists` で囲まない。** 囲むと「その画面に主要動線が無い」が
        // 失敗ではなく沈黙になる。所持品は主要動線に `bulk` という名を付けていたので、
        // この検査は所持品を**一度も見ないまま通っていた**。
        // 無いなら無いと言わせる。
        check("B1", screen, cta.exists, "主要動線（cta）が無い")
        if cta.exists {
            let mid = cta.frame.midY
            check("B1", screen, mid >= H * 2 / 3,
                  "主要動線の中心が y=\(Int(mid))（親指到達域 y≧\(Int(H * 2 / 3)) の外）")
        }

        // B3: 見えている操作は全部押せる
        var blocked: [String] = []
        for kind in [app.buttons] {
            for i in 0..<kind.count {
                let e = kind.element(boundBy: i)
                guard e.exists, e.isEnabled else { continue }
                let f = e.frame
                guard f.width > 1, f.height > 1, visible(f) else { continue }
                if !e.isHittable {
                    blocked.append("\(e.label.prefix(12))@\(Int(f.minY))-\(Int(f.maxY))")
                }
            }
        }
        check("B3", screen, blocked.isEmpty,
              "押せない操作 \(blocked.count)件: " + blocked.prefix(3).joined(separator: " / "))

        // B5: 戻り方がある（拠点とタイトルを除く）
        if screen != "base" && screen != "title" && screen != "opening" {
            check("B5", screen, app.buttons["back"].exists, "戻る手段が無い")
        }

        // C1: セーフエリアを守っている。操作がノッチやホームインジケータに掛からない
        let unsafeTop = controls.filter { $0.1.minY < 44 }
        let unsafeBottom = controls.filter { $0.1.maxY > H - 8 }
        check("C1", screen, unsafeTop.isEmpty && unsafeBottom.isEmpty,
              "セーフエリア外 上\(unsafeTop.count)件 下\(unsafeBottom.count)件")
    }

    /// D4 の一部: 画面に着いた直後、主要動線が本当に使えるか。
    ///
    /// **「演出の最中に操作を奪わない」は、XCUITest では測れなかった。**
    /// 2通り試して、2通りとも変異（演出中だけ `disabled` にする）を素通りした:
    ///
    /// 1. 起動してから問い合わせる → 起動だけで数秒かかり、0.55 秒の演出は終わっている。
    /// 2. 動いているアプリの中で叩いてすぐ問い合わせる → `tap()` はアプリが
    ///    静止するまで返らない。**XCUITest は演出の完了を待ってから次へ進む**ので、
    ///    問い合わせが演出の途中に落ちること自体が起きない。
    ///
    /// 測れないものを「測った」と書かない。ここが見ているのは
    /// **着いた直後に主要動線が使えるか**だけ。それでも値打ちはあった——
    /// 3D の `assert` で図鑑が落ちていたのを、この検査が見つけた。
    ///
    /// 演出の長さ（すべて 0.8 秒以内）と、入力を塞いでいないことは
    /// コードを読んで確かめている。実行時には確かめていない。
    func test着いた直後に主要動線が使える() {
        for (name, args) in Self.screens {
            let app = XCUIApplication()
            app.launchArguments = args
            app.launch()
            let cta = app.buttons["cta"]
            let appeared = cta.waitForExistence(timeout: 12)
            check("D4", name, appeared, "主要動線が現れない")
            if appeared {
                // `isHittable` だけでは足りない。あれは「その点に指が届くか」しか見ず、
                // 押しても何も起きないボタンでも true を返す
                check("D4", name, cta.isEnabled && cta.isHittable,
                      "主要動線が押せない（届く=\(cta.isHittable) / 受け取る=\(cta.isEnabled)）")
            }
            app.terminate()
        }
        report()
    }

    // MARK: - 通しの検査（B2 / B4）

    func test拠点から一巡できる() {
        let app = launch(["-reset", "-devitems", "24", "-pending", "5", "-grown",
                          "-gold", "5000", "-screen", "base"])

        // B2: 「次にやること」が理由つきで出ている
        check("B2", "base", app.otherElements["next-why"].exists
              || app.staticTexts.matching(NSPredicate(format: "label CONTAINS '次にやること'")).count > 0
              || app.descendants(matching: .any)["next-why"].exists,
              "「次にやること」が出ていない")

        // B4: 押したら画面が追随する
        let before = app.navigationBars.firstMatch.exists
        _ = before
        // どのチップが出ているかを先に控える。押せない理由が
        // 「無い」のか「重なっている」のかで直し方が違う
        let shown = ["sign", "mail", "chest", "shelf", "garden"].map { id -> String in
            let e = app.buttons["prop-\(id)"]
            return "\(id):\(e.exists ? (e.isHittable ? "可" : "不可") : "無")"
        }.joined(separator: " ")
        check("B0", "base", !shown.contains("無") && !shown.contains("不可"),
              "拠点のチップ \(shown)")

        let garden = app.buttons["prop-garden"]
        if garden.exists, garden.isHittable {
            garden.tap()
            Thread.sleep(forTimeInterval: 1.0)
            check("B4", "base→garden", app.buttons["tab-0"].exists,
                  "薬草園へ移れていない")
            if app.buttons["back"].exists {
                app.buttons["back"].tap()
                Thread.sleep(forTimeInterval: 0.8)
            }
        } else {
            check("B4", "base→garden", false, "薬草園の名札が押せない")
        }

        // 派遣準備 → 地図 → ノードを押す
        let sign = app.buttons["prop-sign"]
        if sign.exists, sign.isHittable {
            sign.tap()
            Thread.sleep(forTimeInterval: 1.0)
            let mapOpen = app.buttons["map-open"]
            check("B4", "dispatch", mapOpen.exists, "派遣先の1行が無い")
            if mapOpen.exists {
                mapOpen.tap()
                Thread.sleep(forTimeInterval: 1.4)
                // 地図のノードが10個とも映って、押せること
                var shown = 0
                var nodeFrames: [CGRect] = []
                for i in 1...10 {
                    let n = app.buttons["node-\(i)"]
                    if n.exists, n.isHittable { shown += 1; nodeFrames.append(n.frame) }
                }
                check("M1", "map", shown == 10, "映って押せるノードが \(shown) 個（10であるべき）")
                var nodeOverlap = 0
                for i in 0..<nodeFrames.count {
                    for j in (i + 1)..<nodeFrames.count {
                        let inter = nodeFrames[i].intersection(nodeFrames[j])
                        if inter.width > 4, inter.height > 4 { nodeOverlap += 1 }
                    }
                }
                check("M2", "map", nodeOverlap == 0, "ノードが \(nodeOverlap) 組重なっている")
                audit(app, "map")
            }
        } else {
            check("B4", "dispatch", false, "派遣の名札が押せない")
        }

        app.terminate()
        report()
    }

    // MARK: - Dynamic Type（C2）

    /// C2: Dynamic Type の特大で崩れないか。
    ///
    /// **1画面だけ見て「耐える」とは言えない。** 拠点は行が短く、
    /// 文字が倍になっても収まりやすい。崩れるのは、もともと横に詰めてある
    /// 一覧・升目・比較の欄のほうで、そこを見ずに通していた。
    func test特大の文字でも崩れない() {
        for (name, args) in Self.screens {
            let app = XCUIApplication()
            app.launchArguments = args + ["-UIPreferredContentSizeCategoryName",
                                          "UICTContentSizeCategoryAccessibilityL"]
            app.launch()
            Thread.sleep(forTimeInterval: 1.6)
            let W = app.frame.width
            var clipped: [String] = []
            for i in 0..<app.staticTexts.count {
                let e = app.staticTexts.element(boundBy: i)
                guard e.exists, e.frame.width > 1 else { continue }
                if e.frame.minX < -0.5 || e.frame.maxX > W + 0.5 {
                    clipped.append(String(e.label.prefix(14)))
                }
            }
            check("C2", "\(name)(特大)", clipped.isEmpty,
                  "特大の文字で画面外 \(clipped.count)件: " + clipped.prefix(3).joined(separator: " / "))
            app.terminate()
        }
        report()
    }

    private func report() {
        let total = passed + failures.count
        print("=== 検査: \(total) 件中 \(passed) 件成功 / \(failures.count) 件失敗 ===")
        if !failures.isEmpty {
            print("失敗:")
            for f in failures { print(f) }
            XCTFail("\(failures.count) 件失敗（上の一覧を見る）")
        }
        failures.removeAll()
        passed = 0
    }

// MARK: - 画素を読む（A2 のため）

/// スクリーンショットを1枚だけ展開して、任意の矩形の明暗を測れるようにする。
///
/// **A2 は今まで測っていなかった。** トークンの色どうしの比は web 版で検査済みだが、
/// それは「板の上の文字」しか守らない。3D の上に直に置いた文字は、
/// 背景が毎フレーム変わるので**トークンでは保証できない**——
/// 実際、タイトルの副題は明るい小屋の壁の上にあって読めなかった。
/// 目で見つけたということは、検査に穴があったということ。
struct PixelSheet {
    let w: Int, h: Int, scale: CGFloat
    private let buf: [UInt8]

    init?(_ shot: XCUIScreenshot, points: CGSize) {
        guard let cg = shot.image.cgImage else { return nil }
        w = cg.width; h = cg.height
        scale = CGFloat(w) / max(points.width, 1)
        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        let space = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &pixels, width: w, height: h,
                                  bitsPerComponent: 8, bytesPerRow: w * 4, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        buf = pixels
    }

    /// WCAG の相対輝度。
    private static func luminance(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> Double {
        func lin(_ v: UInt8) -> Double {
            let c = Double(v) / 255
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /// 矩形の中の**文字と背景のコントラスト比**。
    ///
    /// 文字の画素だけを選り分けることはできないので、輝度を並べて
    /// 上下 2% を取る。字は必ず背景と離れた端に出るので、
    /// 読めない字＝この幅が狭い、として測れる。
    func contrast(_ rect: CGRect) -> Double? {
        let x0 = max(0, Int(rect.minX * scale)), x1 = min(w, Int(rect.maxX * scale))
        let y0 = max(0, Int(rect.minY * scale)), y1 = min(h, Int(rect.maxY * scale))
        guard x1 - x0 > 3, y1 - y0 > 3 else { return nil }
        var ls: [Double] = []
        ls.reserveCapacity((x1 - x0) * (y1 - y0))
        for y in y0..<y1 {
            let row = y * w * 4
            for x in x0..<x1 {
                let i = row + x * 4
                ls.append(Self.luminance(buf[i], buf[i + 1], buf[i + 2]))
            }
        }
        ls.sort()
        let lo = ls[Int(Double(ls.count) * 0.02)]
        let hi = ls[Int(Double(ls.count) * 0.98)]
        return (hi + 0.05) / (lo + 0.05)
    }
}
}

// MARK: - UX の5軸（docs/UX-AXES.md）
//
// これまでの検査は「壊れていないか」しか見ていなかった。
// ここは**外部の基準**（Nielsen・Apple HIG・放置ゲームの設計・game feel）から
// 作った5軸のうち、機械で見られるものを見る。

extension AuditTests {

    /// 軸1 いま何が起きているか分かるか / 軸5d 次の報酬が近くに見えるか
    func testUX軸1_状態が見えるか() {
        // 潜行中の拠点
        let app = launch(["-reset", "-devitems", "24", "-grown", "-gold", "5000",
                          "-away", "-screen", "base"])
        let texts = allTexts(app)
        // 1a: 誰が・どこへ・あと何分
        check("UX1a", "base", texts.contains { $0.contains("潜行中") }, "潜行中の表示が無い")
        check("UX1a", "base", texts.contains { $0.contains("残り") && $0.contains("分") },
              "残り時間が出ていない")
        // 1c: 形でも出ている（進捗の帯）
        check("UX1c", "base", app.progressIndicators.count > 0 || app.otherElements["progress"].exists,
              "待ちの進み具合が形で出ていない")
        // 5d: 次の報酬が近くに見える
        check("UX5d", "base", texts.contains { $0.contains("次にやること") }, "次にやることが無い")
        app.terminate()

        // 1b: 戻ってきた時、留守のあいだの出来事がまとめて出る
        let app2 = launch(["-reset", "-devitems", "24", "-report", "-screen", "base"])
        let t2 = allTexts(app2)
        check("UX1b", "base", t2.contains { $0.contains("帰") || $0.contains("レポート") },
              "帰還したことが拠点で分からない")
        app2.terminate()
        report()
    }

    /// 軸2 間違えても戻れるか
    func testUX軸2_戻れるか() {
        // 2b/2c: 取り消せない操作（売却）に確認と「戻せない」の断り書き
        let app = launch(["-reset", "-devitems", "24", "-gold", "5000", "-screen", "inventory"])
        let cta = app.buttons["cta"]
        check("UX2b", "inventory", cta.exists && cta.isEnabled, "売却の動線が無い")
        if cta.exists, cta.isEnabled {
            cta.tap()
            Thread.sleep(forTimeInterval: 0.8)
            let t = allTexts(app)
            // **ボタンの文字は `staticTexts` に出ない。** 最初ここを見ていて
            // 「やめるが無い」と報告したが、実際には在った。検査の見落とし
            check("UX2b", "inventory", app.buttons["やめる"].exists, "確認に「やめる」が無い")
            check("UX2c", "inventory", t.contains { $0.contains("戻せない") },
                  "「戻せない」と書いていない")
            // 2d: ロック品と装備中を巻き込まないと明記
            check("UX2d", "inventory",
                  t.contains { $0.contains("ロック") && $0.contains("装備中") },
                  "何が除かれるか書いていない")
        }
        app.terminate()
        report()
    }

    /// 軸3 覚えていなくても決められるか
    func testUX軸3_その場で決められるか() {
        let app = launch(["-reset", "-devitems", "24", "-grown", "-gold", "5000",
                          "-screen", "dispatch"])
        // 3a/3b: 装備を選ぶ場面で、今のものと候補が並び、差が数字で出る。
        // **入口は `pick-weapon`。** 最初 `equip` を叩いていたが、あれは
        // 選んだ後に確定する側のボタンで、選ぶ画面を開く口ではなかった
        let equip = app.buttons["pick-weapon"]
        if equip.exists, equip.isHittable {
            equip.tap()
            Thread.sleep(forTimeInterval: 1.2)

            // まず**押す前**に差が見えていること。升目の各タイルには
            // 今の装備との差が ▲▼ で出ている——ここで既に比べられるなら、
            // 「別の画面の数字を覚えておく」必要がない
            let beforeTap = allTexts(app)
            check("UX3b", "dispatch",
                  beforeTap.contains { $0.contains("▲") || $0.contains("▼") },
                  "升目の時点で装備中との差が出ていない")

            // 押したら、今のものと候補が並んで、差が言葉でも出る
            var tapped = false
            for i in 0..<app.buttons.count {
                let e = app.buttons.element(boundBy: i)
                if e.exists, e.isHittable, e.identifier.hasPrefix("tile-") {
                    e.tap(); tapped = true; break
                }
            }
            Thread.sleep(forTimeInterval: 1.0)
            let t = allTexts(app)
            check("UX3a", "dispatch",
                  tapped && t.contains { $0.contains("現在") } && t.contains { $0.contains("候補") },
                  "押しても今の装備と候補が並ばない")
            check("UX3b", "dispatch",
                  t.contains { $0.contains("強い") || $0.contains("互角") },
                  "差が言葉で出ていない")
        } else {
            check("UX3a", "dispatch", false, "装備を選ぶ動線が無い")
        }
        app.terminate()
        report()
    }

    private func allTexts(_ app: XCUIApplication) -> [String] {
        var out: [String] = []
        for i in 0..<app.staticTexts.count {
            let e = app.staticTexts.element(boundBy: i)
            if e.exists { out.append(e.label) }
        }
        return out
    }
}
