// 内部解像度 360×640 に描画し、整数倍スケールで表示キャンバスへ拡大する。
// imageSmoothingEnabled は必ず false（仕様 §5.3）。

export const VW = 360;
export const VH = 640;

export class Screen {
  readonly ctx: CanvasRenderingContext2D;
  private readonly display: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D;
  private readonly internal: HTMLCanvasElement;
  scale = 1;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    this.internal = document.createElement('canvas');
    this.internal.width = VW;
    this.internal.height = VH;
    const ictx = this.internal.getContext('2d');
    const dctx = display.getContext('2d');
    if (!ictx || !dctx) throw new Error('2d context unavailable');
    this.ctx = ictx;
    this.displayCtx = dctx;
    this.ctx.imageSmoothingEnabled = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    // 非整数 devicePixelRatio の端末でも「デバイスピクセル基準」で整数倍を選ぶ。
    // CSS px 基準で選ぶと DPR2.625 等の実機で非整数倍スケーリングになり、
    // 中間色（にじみ）が発生する（仕様 §5.3 / C1）。
    const dpr = window.devicePixelRatio || 1;
    const availW = Math.floor(window.innerWidth * dpr);
    const availH = Math.floor(window.innerHeight * dpr);
    const k = Math.max(1, Math.min(Math.floor(availW / VW), Math.floor(availH / VH)));
    this.scale = k;
    this.display.width = VW * k;
    this.display.height = VH * k;
    this.display.style.width = `${(VW * k) / dpr}px`;
    this.display.style.height = `${(VH * k) / dpr}px`;
    // transform 中央寄せは半画素配置を生むため、デバイスピクセルに丸めた
    // left/top を明示する。
    const left = Math.round((availW - VW * k) / 2) / dpr;
    const top = Math.round((availH - VH * k) / 2) / dpr;
    this.display.style.left = `${left}px`;
    this.display.style.top = `${top}px`;
    this.displayCtx.imageSmoothingEnabled = false;
  }

  present(): void {
    this.displayCtx.imageSmoothingEnabled = false;
    this.displayCtx.drawImage(
      this.internal, 0, 0, VW, VH,
      0, 0, VW * this.scale, VH * this.scale
    );
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
