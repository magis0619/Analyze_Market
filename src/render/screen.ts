// 内部解像度 360×640 に描画し、整数倍スケールで表示キャンバスへ拡大する。
// imageSmoothingEnabled は必ず false（仕様 §9.3）。
//
// スケーリング方式（C1対策・4回目の改訂）:
//
// 試行1: バッキングストアをデバイスピクセル基準にし、CSS px 側を
// devicePixelRatio で割り戻す方式 → 除算の丸め誤差でにじみが残った。
//
// 試行2: ゲームピクセル:CSS px を整数比に固定し、CSS px→デバイスpx の
// 変換をブラウザの transform:scale(整数) に委ねる方式 → 実機スマートフォンの
// CSS 幅（390〜430px 程度）は VW(360) の2倍に届かないため k が常に1に固定され、
// 仕組み自体が実機で一度も作動していなかった。
//
// 試行3: k を「デバイスピクセル」基準で計算し（innerWidth × dpr に対して
// 整数倍を選ぶ）、バッキングストアを VW*k×VH*k、CSS サイズも同じ数値にして、
// transform: scale(1/dpr) で縮める方式。拡大率そのものは
// (VW*k) × (1/dpr) × dpr = VW*k で厳密に打ち消し合う——のだが、
// **中央寄せを style.left / style.top（CSS px の整数）で行っていた**。
// dpr が非整数（2.625 など）だと CSS px の整数はデバイスピクセルの整数に
// ならず、レイヤ全体が半ピクセルずれた位置に着地して端の列が隣と混色する。
// 批評で「境界2列がブレンドされている」と指摘されたのはこれ。
//
// 試行4（今回）: 拡大率は試行3のままにして、**平行移動も transform に入れる**。
// translate はスケールより前に適用されるので、最終的なデバイス座標は
//   device = dpr × (tx + (1/dpr) × p) = dpr × tx + p
// になる。tx = round(希望デバイスオフセット) / dpr と置けば dpr × tx は整数に
// なり、レイヤは必ずデバイスピクセルの格子へ乗る。レイアウト側の丸めを
// 一切経由しないので、非整数 dpr でも境界に混色列が出ない。

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

    // 中央寄せ。ここが C1 の本体だった。
    //
    // 以前は style.left / style.top に CSS px を入れていた。CSS px の整数は
    // dpr が非整数（2.625 など）のときデバイスピクセルの整数にならないので、
    // レイヤ全体が半ピクセルずれた位置に着地し、右端と左端の2列が隣と
    // 混色していた（批評で「境界2列がブレンドされている」と指摘された症状）。
    //
    // 代わりに平行移動も transform に入れる。translate はスケールより前に
    // 適用されるので、最終的なデバイス座標は
    //   device = dpr * (tx + (1/dpr) * p) = dpr * tx + p
    // となる。よって tx = round(希望デバイスオフセット) / dpr と置けば、
    // レイヤは必ずデバイスピクセルの格子に乗る。
    const offX = Math.round((window.innerWidth * dpr - VW * k) / 2);
    const offY = Math.round((window.innerHeight * dpr - VH * k) / 2);
    this.display.style.left = '0px';
    this.display.style.top = '0px';
    this.display.style.transform =
      `translate(${offX / dpr}px, ${offY / dpr}px) scale(${1 / dpr})`;

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
