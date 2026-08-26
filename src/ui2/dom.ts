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
  // 委譲。ただし **click イベントには頼れない**。
  //
  // 画面は毎フレーム innerHTML を丸ごと書き換えうる（拠点は残り時間のため毎秒）。
  // pointerdown と pointerup の間に書き換えが挟まると、押した要素はもう
  // 存在しないので、ブラウザは click を共通の祖先——つまり #ui——へ投げる。
  // closest('[data-act]') は null になり、タップは**黙って消える**。
  // 「たまに押しても何も起きない」という、最も報告されにくい壊れ方になる。
  //
  // そこで pointerup の座標で引き直す。DOM が入れ替わっていても、
  // 指の下にあるものを新しい木から取り直せる。押し始めと同じ act の
  // ときだけ発火させるので、書き換えで別のボタンが滑り込んでも誤爆しない。
  let downAct: string | null = null;
  let downPointer = -1;
  let fired = false;

  const pick = (el: Element | null): HTMLElement | null => {
    const t = (el as HTMLElement | null)?.closest<HTMLElement>('[data-act]') ?? null;
    return t && !t.hasAttribute('disabled') ? t : null;
  };

  const down = (ev: PointerEvent): void => {
    fired = false;
    downPointer = ev.pointerId;
    downAct = pick(ev.target as Element | null)?.dataset.act ?? null;
  };

  const up = (ev: PointerEvent): void => {
    if (downAct === null || ev.pointerId !== downPointer) return;
    const act = downAct;
    downAct = null;
    const t = pick(document.elementFromPoint(ev.clientX, ev.clientY));
    if (!t || t.dataset.act !== act) return;
    fired = true;
    handler(act, t, ev);
  };

  // 合成 click（テストや支援技術）用の保険。
  // pointerup で処理済みなら二重に呼ばない
  const onClick = (ev: Event): void => {
    if (fired) { fired = false; return; }
    const t = pick(ev.target as Element | null);
    const act = t?.dataset.act;
    if (t && act) handler(act, t, ev as PointerEvent);
  };

  root.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    root.removeEventListener('click', onClick);
  };
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
