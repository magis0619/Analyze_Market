import Foundation

// 正解表の読み取り。**`JSONSerialization` を使わない。**
//
// あれは `0.015739798778668046` を `NSDecimalNumber` として読み、`.doubleValue` で
// 2ulp 落とす（bits `…04000000` → `…03fffffe`）。落ちるのは正解表のほうなので、
// **実装が正しいのにテストが落ちる**——しかも「1ulp ずれ」という、いかにも移植を
// しくじったように見える落ち方をする。実際この罠に一度かかって、
// 浮動小数の contraction を疑って半日ぶんの見当違いをやりかけた。
//
// `JSONDecoder` と `Double(String)` は正確。数値を1つも落とさない経路で読む。

indirect enum JSONValue: Decodable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        // Bool を Double より先に試す。逆にすると true/false が拾えない
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "unknown JSON node")
    }

    /// 資源として同梱した JSON を丸ごと読む。
    static func loadResource(_ name: String) -> [String: JSONValue] {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONDecoder().decode(JSONValue.self, from: data),
              case .object(let obj) = root
        else {
            fatalError("\(name).json を読めない。Package.swift の resources を確認する")
        }
        return obj
    }
}

// 取り出し。テストなので、形が違えば落ちてよい。

func d(_ v: JSONValue?) -> [String: JSONValue] {
    guard case .object(let o)? = v else { fatalError("object を期待した: \(String(describing: v))") }
    return o
}

func a(_ v: JSONValue?) -> [JSONValue] {
    guard case .array(let x)? = v else { fatalError("array を期待した: \(String(describing: v))") }
    return x
}

func f(_ v: JSONValue?) -> Double {
    guard case .number(let n)? = v else { fatalError("number を期待した: \(String(describing: v))") }
    return n
}

func i(_ v: JSONValue?) -> Int { Int(f(v)) }

func s(_ v: JSONValue?) -> String {
    guard case .string(let x)? = v else { fatalError("string を期待した: \(String(describing: v))") }
    return x
}

func b(_ v: JSONValue?) -> Bool {
    guard case .bool(let x)? = v else { fatalError("bool を期待した: \(String(describing: v))") }
    return x
}

/// null かもしれない文字列（unique / weakTo / affix の element / potionId）
func optS(_ v: JSONValue?) -> String? {
    if case .string(let x)? = v { return x }
    return nil
}

/// null かもしれない数値（nextPlotCost）
func optF(_ v: JSONValue?) -> Double? {
    if case .number(let x)? = v { return x }
    return nil
}

/// null かもしれないオブジェクト（potion / nextSlot / 畑の1枠）
func optD(_ v: JSONValue?) -> [String: JSONValue]? {
    if case .object(let o)? = v { return o }
    return nil
}

/// `[[鍵, 値], ...]` として書き出した辞書を、鍵順のまま受け取る。
/// 辞書のままだと順序が消えて、落ちたときにどの鍵かを言えない。
func pairs(_ v: JSONValue?) -> [(String, JSONValue)] {
    a(v).map { entry in
        let kv = a(entry)
        return (s(kv[0]), kv[1])
    }
}
