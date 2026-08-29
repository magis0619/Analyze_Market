import DelversCore
import SwiftUI

// 画面から 3D へ渡すもの（web 版 docs/UI-SPEC.md §6.6 の iOS 版）。
//
// **渡すのは数値だけ。** 文字は渡さない——World層は光と密度でしか喋らない。
// ここに文字列を1つ通した瞬間、3D 側が「何の画面か」を知ることになり、
// 2層に分けた意味が消える。

struct PlotMood: Equatable {
    /// 属性の番号（-1 は空き）
    var kind: Int
    /// 育ち具合 0〜1
    var ratio: Double
}

struct NodeMood: Equatable {
    /// 0＝未解放 / 1＝解放済み / 2＝踏破済み
    var state: Int
    /// 属性の番号。複合は -1
    var element: Int
}

struct PropMood: Equatable {
    var chest: Double = 0
    var mail: Double = 0
    var sign: Double = 0
    var shelf: Double = 0
}

struct Mood: Equatable {
    /// 主となる色
    var accent: Color = DS.gold
    /// 0〜1。深さ・強さ
    var intensity: Double = 0.4
    /// 0〜1。人の気配（拠点の灯り）
    var presence: Double = 1
    /// 畑の中身。要素数がそのまま開いている枠の数
    var slots: [PlotMood] = []
    /// 畑を広げられるか
    var canExpand = false
    /// 地図のノード
    var nodes: [NodeMood] = []
    /// 選んでいるノード
    var selected: Int = -1
    /// 拠点に置いた物の状態
    var props = PropMood()
}

/// 属性 → 番号。両層の唯一の合意事項（DelversCore の並びに合わせる）
func moodElementIndex(_ e: Element) -> Int {
    switch e {
    case .physical: return 0
    case .fire: return 1
    case .lightning: return 2
    case .poison: return 3
    case .ice: return 4
    }
}

/// 番号 → 光の色。World 層が持つ唯一の対応表
func moodElementColor(_ i: Int) -> UIColor {
    switch i {
    case 1: return UIColor(red: 1.0, green: 0.51, blue: 0.28, alpha: 1)   // 炎
    case 2: return UIColor(red: 0.91, green: 0.75, blue: 0.45, alpha: 1)  // 雷
    case 3: return UIColor(red: 0.49, green: 0.86, blue: 0.54, alpha: 1)  // 毒
    case 4: return UIColor(red: 0.44, green: 0.78, blue: 1.0, alpha: 1)   // 氷
    default: return UIColor(red: 0.62, green: 0.69, blue: 0.82, alpha: 1) // 物理
    }
}
