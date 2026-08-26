// DOM を組み立てるための最小限のヘルパ。
//
// フレームワークは入れない。仕様書 §0.3 が挙げる「controlled」——
// 部品はあらかじめ作り、組み合わせるだけ——を成立させるのに、
// テンプレート文字列と委譲イベントで足りる。
//
// 依存を増やさないことにも意味がある。ここで React を入れると、
// 「UIの正しさを表明で確かめる」という主旨に対して、
// 確かめる対象が「描画結果」から「フレームワークの振る舞い」へ滑る。

/** HTMLエスケープ。**ゲーム内の文字列は必ずこれを通す。** */
export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/** 数値を桁区切りで。表示する数字は必ずここを通す（表記を1箇所に集める）。 */
export function num(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

/** 秒を「1時間20分」の形に。 */
export function duration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}時間${m > 0 ? `${m}分` : ''}`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}分${s % 60 > 0 ? `${s % 60}秒` : ''}`;
  return `${s}秒`;
}

/** 条件付きで文字列を出す（テンプレートの中で三項が積み重なるのを防ぐ）。 */
export function when(cond: unknown, html: string): string {
  return cond ? html : '';
}

/** 配列を連結する。map(...).join('') を毎回書かないため。 */
export function each<T>(xs: readonly T[], f: (x: T, i: number) => string): string {
  return xs.map(f).join('');
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel);
}

export function qsa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

/**
 * 委譲イベント。
 *
 * 要素ごとに addEventListener すると、再描画のたびに張り直しになり、
 * 外し忘れが漏れる。ルートで1回だけ受けて `data-act` で振り分ける。
 */
export function onAct(
  root: HTMLElement,
  handler: (act: string, el: HTMLElement, ev: PointerEvent) => void
): () => void {
  const fn = (ev: Event): void => {
    const t = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
    if (!t || t.hasAttribute('disabled')) return;
    const act = t.dataset.act;
    if (act) handler(act, t, ev as PointerEvent);
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

/** 押下中の見た目（§3.1 の pressed）。CSS の :active では足りない場面用。 */
export function bindPressFeedback(root: HTMLElement): () => void {
  const down = (ev: Event): void => {
    (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]')?.classList.add('is-pressed');
  };
  const up = (): void => {
    qsa(root, '.is-pressed').forEach(el => el.classList.remove('is-pressed'));
  };
  root.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}
