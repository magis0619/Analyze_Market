// swift-tools-version: 5.9
import PackageDescription

// DELVERS のゲームロジック。**画面に触れない層**として切ってある。
//
// もとは TypeScript（`src/sim/` と `src/data/`）で、そちらは Canvas も DOM も
// 参照しない決まりで書かれていた。その決まりがあったおかげで、この移植は
// 「UI を作り直す」話と「ルールを移す」話に分けられている。
//
// この層は UIKit / SwiftUI / SceneKit を import しない。
// import の無さが、そのまま層の境界の担保になっている。
let package = Package(
    name: "DelversCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "DelversCore", targets: ["DelversCore"])
    ],
    targets: [
        .target(name: "DelversCore"),
        .testTarget(
            name: "DelversCoreTests",
            dependencies: ["DelversCore"],
            resources: [
                // TypeScript 版の実測値。移植の正解表
                .process("Resources/golden.json"),        // sim 層（tools/golden.ts）
                .process("Resources/golden-state.json")   // state 層（tools/golden-state.ts）
            ]
        )
    ]
)
