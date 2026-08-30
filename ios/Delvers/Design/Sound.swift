import AVFoundation

/// 音。
///
/// **音を後回しにしていたのは間違いだった。** game feel の資料はどれも
/// 「音を消すと、絵が同じでも体感される手応えが 50〜70% 落ちる」と言っている
/// <https://www.bloodmooninteractive.com/articles/juice.html>。
/// 3D と触覚まで作り込んで音が無いのは、一番効くところが空いているということ。
///
/// **音源ファイルは読まない。** 3D で外部のモデルもテクスチャも読まないのと同じ理由——
/// 読み込みの失敗という壊れ方を持たせない。波形はその場で作る。
///
/// 分類は `Haptic` と揃える。手応えは触覚と音で同じ出来事を言うので、
/// 別々の語彙を持つと、片方だけ鳴る場面が生まれる。
enum Sfx {
    case tap        // 触れた
    case commit     // 決めた（派遣・装備・調合）
    case gain       // 手に入った（収穫・売却・解放）
    case reveal     // 出た（開封）
    case deny       // 何も起きない

    private static let engine = AVAudioEngine()
    private static let node = AVAudioPlayerNode()
    private static var buffers: [String: AVAudioPCMBuffer] = [:]
    private static var started = false

    /// **鳴らせない時に落ちない。** 音は飾りなので、
    /// 出せない環境（他のアプリが専有している等）では黙って諦める。
    private static func start() {
        guard !started else { return }
        started = true
        // `.ambient` にする。消音スイッチを尊重し、他の音を止めない。
        // 遊びの音でユーザーの音楽を止めるのは失礼にあたる
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode,
                       format: AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1))
        try? engine.start()
        node.play()
    }

    func play() {
        Self.start()
        guard Self.engine.isRunning else { return }
        let key = "\(self)"
        let buf = Self.buffers[key] ?? Self.build(self)
        Self.buffers[key] = buf
        guard let buf else { return }
        Self.node.scheduleBuffer(buf, at: nil, options: .interrupts)
    }

    /// 波形を作る。倍音を少し混ぜて、指数で減衰させる——
    /// 純音のままだと電子音になり、木と土と火の画面から浮く。
    private static func build(_ s: Sfx) -> AVAudioPCMBuffer? {
        let rate = 44100.0
        // (開始周波数, 終了周波数, 長さ秒, 音量, 倍音の強さ)
        let (f0, f1, dur, gain, harm): (Double, Double, Double, Double, Double) = {
            switch s {
            case .tap:    return (620, 540, 0.055, 0.16, 0.25)
            case .commit: return (196, 262, 0.30,  0.30, 0.45)
            case .gain:   return (523, 784, 0.26,  0.26, 0.35)
            case .reveal: return (392, 1046, 0.55, 0.32, 0.50)
            case .deny:   return (220, 165, 0.18,  0.22, 0.30)
            }
        }()
        let n = AVAudioFrameCount(rate * dur)
        guard let fmt = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
              let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: n),
              let ch = buf.floatChannelData?[0] else { return nil }
        buf.frameLength = n
        var phase = 0.0
        for i in 0..<Int(n) {
            let t = Double(i) / rate
            let p = t / dur
            let freq = f0 + (f1 - f0) * p
            phase += 2 * .pi * freq / rate
            // 立ち上がりを 6ms かけて、プチッというクリックを出さない
            let attack = min(1, t / 0.006)
            let decay = exp(-3.6 * p)
            let v = sin(phase) + harm * sin(phase * 2) + harm * 0.35 * sin(phase * 3)
            ch[i] = Float(v / (1 + harm * 1.35) * gain * attack * decay)
        }
        return buf
    }
}
