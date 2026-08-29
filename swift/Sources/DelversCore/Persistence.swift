import Foundation

// セーブの置き場所。**コア層は「どこに置くか」を知らない。**
//
// web 版は localStorage に置いていた。iOS はファイル。ここを固定にすると
// テストが実ファイルを触ることになり、「保存したつもり」の検証に
// 後片付けが要る。protocol で外に出して、テストは記憶の中に置く。

public protocol SaveStore: AnyObject {
    func load() -> Data?
    func save(_ data: Data)
}

/// テスト用。プロセスの中だけに持つ。
public final class MemorySaveStore: SaveStore {
    public private(set) var stored: Data?
    /// 保存が呼ばれた回数。「保存し忘れ」を数で確かめられるようにしておく
    public private(set) var writes = 0

    public init(_ initial: Data? = nil) { stored = initial }

    public func load() -> Data? { stored }

    public func save(_ data: Data) {
        stored = data
        writes += 1
    }
}

/// 実機用。アプリのサポートディレクトリに1ファイル置く。
public final class FileSaveStore: SaveStore {
    private let url: URL

    /// - Parameter name: ファイル名。既定は `delvers.save.json`
    public init(name: String = "delvers.save.json") {
        let dir = (try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )) ?? FileManager.default.temporaryDirectory
        url = dir.appendingPathComponent(name)
    }

    public init(url: URL) { self.url = url }

    public func load() -> Data? { try? Data(contentsOf: url) }

    public func save(_ data: Data) {
        // **途中で落ちても壊れたセーブを残さない。** 直に書くと、書き込みの
        // 最中に落ちた回だけ半端な JSON がディスクに残り、次の起動で
        // 「セーブが読めない」＝進行が消えたように見える。
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            // 保存に失敗しても進行は続ける（web 版と同じ扱い）
        }
    }
}

// MARK: - 帰還通知
//
// 仕様 §7.2「帰還時にローカル通知を送る」。
// **コア層は通知の出し方を知らない。** UserNotifications を import した瞬間に
// この層が画面側の都合を持つことになる。呼ぶ口だけ置いて、実装はアプリが差す。

public protocol ReturnNotifier: AnyObject {
    /// 許可を求める。**初めて派遣を出した瞬間**にだけ呼ばれる——
    /// 起動直後に求めても何のための許可か分からず、まず拒否される。
    func requestPermission()
    /// 帰還を知らせる。
    func notifyReturn(job: String, stage: String, outcome: String)
}

/// 何もしない実装。テストと、通知を使わない場面の既定。
public final class SilentNotifier: ReturnNotifier {
    public init() {}
    public func requestPermission() {}
    public func notifyReturn(job: String, stage: String, outcome: String) {}
}
