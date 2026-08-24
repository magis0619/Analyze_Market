// 内部解像度 360×640 に描画し、整数倍スケールで表示キャンバスへ拡大する。
// imageSmoothingEnabled は必ず false（仕様 §5.3）。
//
// スケーリング方式（重要・C1対策）:
// バッキングストアをデバイスピクセル基準の解像度に合わせ、CSS px 側を
// devicePixelRatio で割り戻す方式は、非整数 DPR（2.625 / 2.75 / 3.5 等の
// 実機）で浮動小数点の丸め誤差が残り、1px 幅ランの乱れ（にじみ）が
// 2ラウンド連続で検出された。
//
// 代わりに、ゲームピクセル : CSS px を常に整数比に固定し（バッキング
// ストアは VW×VH のまま）、CSS px → デバイス px の変換は一切自前で
// 計算せず、ブラウザの `transform: scale(整数)` コンポジット処理に
// 委ねる。devicePixelRatio が非整数でも、CSS px 空間での整数倍拡大は
// ブラウザの標準的な合成パスであり、自前の除算による丸め誤差が
// 発生する余地がない。

export const VW = 360;
export const VH = 640;

export class Screen {
  readonly ctx: CanvasRenderingContext2D;
  private readonly display: HTMLCanvasElement;
  scale = 1;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    display.width = VW;
    display.height = VH;
    const ctx = display.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    display.style.width = `${VW}px`;
    display.style.height = `${VH}px`;
    display.style.transformOrigin = 'top left';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    // ゲームピクセル : CSS px の倍率は常に整数。window.innerWidth/Height は
    // 既に CSS px なので devicePixelRatio を絡めた計算は不要（それ自体が
    // 誤差の発生源だった）。
    const k = Math.max(1, Math.min(
      Math.floor(window.innerWidth / VW),
      Math.floor(window.innerHeight / VH)
    ));
    this.scale = k;
    this.display.style.transform = `scale(${k})`;
    const left = Math.floor((window.innerWidth - VW * k) / 2);
    const top = Math.floor((window.innerHeight - VH * k) / 2);
    this.display.style.left = `${left}px`;
    this.display.style.top = `${top}px`;
  }

  /** present() は互換のため残すが、単一キャンバス構成では何もしない。 */
  present(): void {
    // no-op
  }

  /** クライアント座標（CSS px）→ 内部座標 */
  toInternal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.display.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - rect.left) * VW) / rect.width),
      y: Math.floor(((clientY - rect.top) * VH) / rect.height)
    };
  }
}
