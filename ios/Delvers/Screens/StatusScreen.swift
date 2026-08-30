import DelversCore
import SwiftUI

/// 潜行中の1人の状況。
///
/// **結果は絶対に出さない。**
///
/// `State.dispatch` のコメントにあるとおり、**結果は出発の瞬間に確定している**
/// （実時間は「見せるタイミング」だけを決める）。だから「今どこまで潜った」
/// 「今 HP がいくつ」を出すことは、まだ見せていない結末を先に漏らすのと同じになる。
/// 進捗の出典も「80%まで走って止まる進捗はむしろ信頼を壊す」と言っていて、
/// 嘘の途中経過はいちばんやってはいけない部類にあたる。
/// <https://www.eleken.co/blog-posts/progress-indicator-ux>
///
/// **出せるのは、出発した時点で分かっていたことと、経過した時間だけ。**
/// 行き先・持たせた装備・撤退ライン・持たせた薬・経過と残り。
/// これは「不確かさを減らす」（uncertain waits are longer than known, finite waits）
/// という目的には十分で、しかも一つも嘘をつかない。
///
/// **呼び戻す手段は置かない。** 派遣中に介入させない方針は変えていない。
struct StatusScreen: View {
    @EnvironmentObject var shell: Shell
    var dispatchId: String
    @State private var tick = 0.0

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let st = shell.state
        guard let d = st.dispatchInfo(dispatchId), st.data.dispatches.contains(where: { $0.id == d.id })
        else { return AnyView(returned) }

        let job = jobDef(d.jobId)
        let stage = stageDef(d.stageId)
        let p = st.progressOf(d)
        let weapon = st.itemById(d.weaponId)
        let armor = st.itemById(d.armorId)

        return AnyView(Scaffold(
            title: job.name, back: { shell.go(.base) },
            meta: stage.name, hint: "帰りを待つあいだ、拠点でできることがある",
            hero: true, heroFraction: 0.34
        ) {
            // 進捗。**残り時間を主役にする**——1分を超える待ちでは
            // ％より残り時間のほうが役に立つ、というのが出典の指針
            Panel(label: "経過") {
                VStack(spacing: DS.sp3) {
                    ProgressRing(value: p.ratio, max: 1,
                                 text: coarseDuration(p.remainingSec), label: "残り",
                                 tone: stageAccent(stage))
                        .frame(width: 136, height: 136)
                        .frame(maxWidth: .infinity)
                    // 裸の数字にしない。何の何割かを言葉でも言う
                    Text("\(stage.name)へ向かって \(Int(p.ratio * 100))% ・ 全体 \(coarseDuration(Double(d.durationSec)))")
                        .font(.delversLabel).foregroundStyle(DS.dim)
                        .frame(maxWidth: .infinity)
                }
            }

            Panel(label: "持たせたもの") {
                VStack(spacing: DS.sp2) {
                    if let w = weapon { ItemRow(item: w, stage: stage) }
                    if let a = armor { ItemRow(item: a, stage: stage) }
                    if let pid = d.potionId {
                        Row(label: "薬", value: potionDef(pid).name)
                    }
                }
            }

            Panel(label: "決めたこと") {
                VStack(spacing: DS.sp1) {
                    Row(label: "行き先", value: stage.name)
                    Row(label: "撤退ライン", value: retreatRuleDef(d.retreatRule).name)
                    Row(label: "敵の属性", value: {
                        if case .single(let e) = stage.enemyElement { return DS.elementName(e) }
                        return "まちまち"
                    }())
                }
            }

            // **何が起きているかは書かない。** 書けることは「まだ分からない」だけ
            Text("中で何が起きているかは、帰ってこないと分からない。")
                .font(.delversLabel).foregroundStyle(DS.faint)
                .frame(maxWidth: .infinity)
                .padding(.top, DS.sp1)
        } action: {
            TierButton(label: "拠点へ戻る", tier: .quiet) { shell.go(.base) }
                .accessibilityIdentifier("cta")
        }
        .onReceive(clock) { _ in tick += 1 })
    }

    /// 待っているあいだに帰ってきた場合。**画面に留めない**——
    /// 「もう帰っている人の残り時間」を見せ続けるほうが不親切
    private var returned: some View {
        Scaffold(title: "帰還", back: { shell.go(.base) }, meta: nil, hero: true) {
            Panel(label: "帰ってきた") {
                Text("待っているあいだに帰還した。レポートが読める。")
                    .font(.delversBody).foregroundStyle(DS.text)
            }
        } action: {
            TierButton(label: "拠点へ戻る", tier: .primary) { shell.go(.base) }
                .accessibilityIdentifier("cta")
        }
    }
}
