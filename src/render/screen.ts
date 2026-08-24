// 内部解像度 360×640 に描画し、整数倍スケールで表示キャンバスへ拡大する。
// imageSmoothingEnabled は必ず false（仕様 §5.3）。
//
// スケーリング方式（重要・C1対策・3回目の改訂）:
//
// 試行1（R1）: バッキングストアをデバイスピクセル基準にし、CSS px 側を
// devicePixelRatio で割り戻す方式 → 除算の丸め誤差でにじみが残った。
//
// 試行2（R2）: ゲームピクセル:CSS px を整数比に固定し、CSS px→デバイスpx
// の変換をブラウザの transform:scale(整数) に委ねる方式 →
// 実機スマートフォンの CSS 幅（390〜430px 程度）は VW(360) の2倍
// （720px）に届かないため、k は常に1に固定され、この仕組み自体が
// 実機では一度も作動していなかった（批評ラウンド3で判明）。k=1 では
// canvas は CSS 上も 360×640 の等倍表示になり、結局ブラウザが
// devicePixelRatio 倍（非整数）でデバイスピクセルへ変換する以外の
// 経路がなく、試行1とほぼ同じ状況に逆戻りしていた。
//
// 試行3（今回）: k は「デバイスピクセル」基準で計算する（window.innerWidth
// に devicePixelRatio を掛けた実効デバイスピクセル数に対して整数倍を
// 選ぶ）ため、実機でも k=2〜3 程度になる。バッキングストアは VW*k×VH*k
// （デバイスピクセル数に一致する整数）。CSS 側のサイズは devicePixelRatio
// で「割った」値ではなく、バッキングストアと同じ数値をそのまま CSS px の
// サイズとして指定する（この時点では画面に収まらない大きさになる）。
// 最後に transform: scale(1/devicePixelRatio) で必要な分だけ縮小する。
//
// この方式が試行1と本質的に異なる点: 「CSS px を求める割り算」と
// 「ブラウザが内部で行う CSS→デバイスpx の掛け算」という2段階の丸めが
// 発生しない。CSS の transform 行列とブラウザの devicePixelRatio 拡大は
// 合成時に1つの浮動小数点演算としてまとめて適用され、算術的には
// (VW*k) * (1/dpr) * dpr = VW*k に厳密に一致する（掛け算と割り算が
// 打ち消し合う）。width/height プロパティによるレイアウトのように
// 整数デバイスピクセルへスナップする中間ステップを挟まない。

export const VW = 360;
export const VH = 640;

export class Screen {
  readonly ctx: CanvasRenderingContext2D;
  private readonly display: HTMLCanvasElement;
  scale = 1;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    const ctx = display.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    display.style.transformOrigin = 'top left';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    // 実効デバイスピクセル数（整数倍の判定はここで行う。CSS px のままだと
    // 実機の画面幅では k=1 に固定され、方式そのものが機能しなくなる）。
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;
    const k = Math.max(1, Math.min(Math.floor(availW / VW), Math.floor(availH / VH)));
    this.scale = k;

    // バッキングストアは常にデバイスピクセル数（VW*k, VH*k）に厳密一致。
    // width/height の代入は canvas のコンテキスト状態を全てリセットする
    // （transform も含む）ため、描画コード側は VW×VH のゲームピクセル座標系
    // のまま書けるよう、ここで ctx.scale(k, k) を必ず入れ直す。
    this.display.width = VW * k;
    this.display.height = VH * k;
    this.ctx.scale(k, k);

    // CSS px 側は devicePixelRatio で割らず、バッキングストアと同じ数値を
    // そのまま使う。実際の見かけサイズへは transform で縮小する。
    this.display.style.width = `${VW * k}px`;
    this.display.style.height = `${VH * k}px`;
    this.display.style.transform = `scale(${1 / dpr})`;

    // 中央寄せ（CSS px、縮小後の見かけサイズ基準）。位置ずれは端の1px未満の
    // 縁取りにしか影響せず、内部コンテンツの再サンプリングとは無関係。
    const shownW = (VW * k) / dpr;
    const shownH = (VH * k) / dpr;
    const left = Math.floor((window.innerWidth - shownW) / 2);
    const top = Math.floor((window.innerHeight - shownH) / 2);
    this.display.style.left = `${left}px`;
    this.display.style.top = `${top}px`;

    this.ctx.imageSmoothingEnabled = false;
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
