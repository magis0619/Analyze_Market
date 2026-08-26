import type { Item } from '../sim/types';
import type { GameState } from '../game/state';
import type { SceneName, Stage } from '../world/scenes';
import { createStage } from '../world/scenes';
import { bindPressFeedback, onAct, qs } from './dom';

// アプリの器（docs/UI-SPEC.md §0.5 の2層構成）。
//
//   World層 …… three.js。奥行き・光・霧・粒子だけを持つ
//   Interface層 … DOM。文字・数値・操作のすべてを持つ
//
// 画面は「HTMLを返す」「イベントを受ける」「毎フレーム更新する」の3つだけを持つ。
// 描画順の管理も当たり判定もブラウザがやるので、画面側には無い。

export interface Screen {
  /** 背後に置く3Dシーン */
  readonly scene: SceneName;
  /** 画面の全HTML。状態から一意に決まること（同じ状態なら同じ文字列） */
  render(): string;
  /** data-act のタップ。true を返したら再描画する */
  act?(action: string, el: HTMLElement): boolean | void;
  /** 毎フレーム。再描画が要るとき true を返す */
  tick?(dt: number): boolean | void;
  /** 画面を離れるとき */
  destroy?(): void;
}

export interface Nav {
  readonly state: GameState;
  readonly timeScale: number;
  now(): number;
  goTitle(): void;
  goBase(): void;
  goDispatch(): void;
  goInventory(): void;
  goCompendium(): void;
  goOpening(items: Item[]): void;
  goReport(dispatchId: string): void;
}

export interface ScreenFactories {
  title: (nav: Nav) => Screen;
  base: (nav: Nav) => Screen;
  dispatch: (nav: Nav) => Screen;
  inventory: (nav: Nav) => Screen;
  compendium: (nav: Nav) => Screen;
  opening: (nav: Nav, items: Item[]) => Screen;
  report: (nav: Nav, dispatchId: string) => Screen;
}

export class Shell implements Nav {
  readonly state: GameState;
  timeScale = 1;

  private stage: Stage;
  private ui: HTMLElement;
  private screen: Screen;
  private screenName = '';
  private factories: ScreenFactories;
  private t = 0;
  private originMs = Date.now();
  private unbind: Array<() => void> = [];
  /** 再描画が必要か。毎フレーム innerHTML を書き換えない */
  private dirty = true;
  private running = true;

  constructor(
    root: HTMLElement,
    state: GameState,
    factories: ScreenFactories,
    initial: keyof ScreenFactories = 'title'
  ) {
    this.state = state;
    this.factories = factories;

    const canvas = qs<HTMLCanvasElement>(root, '#gl');
    const ui = qs(root, '#ui');
    if (!canvas || !ui) throw new Error('#gl / #ui が見つからない');
    this.ui = ui;
    this.stage = createStage(canvas);

    this.unbind.push(onAct(this.ui, (act, el) => {
      const changed = this.screen.act?.(act, el);
      if (changed !== false) this.dirty = true;
    }));
    this.unbind.push(bindPressFeedback(this.ui));

    const onResize = (): void => {
      this.stage.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    this.unbind.push(() => window.removeEventListener('resize', onResize));

    // タブが見えていない間は回さない（§6.4）
    const onVis = (): void => { this.running = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    this.unbind.push(() => document.removeEventListener('visibilitychange', onVis));

    this.screen = (factories[initial] as (nav: Nav) => Screen)(this);
    this.screenName = initial;
    this.mount();
    onResize();
    this.loop();
  }

  now(): number {
    if (this.timeScale === 1) return Date.now();
    return this.originMs + (Date.now() - this.originMs) * this.timeScale;
  }

  // ------------------------------------------------------------ 遷移

  private go(name: string, screen: Screen): void {
    this.screen.destroy?.();
    this.screen = screen;
    this.screenName = name;
    this.mount();
  }

  goTitle(): void { this.go('title', this.factories.title(this)); }
  goBase(): void { this.go('base', this.factories.base(this)); }
  goDispatch(): void { this.go('dispatch', this.factories.dispatch(this)); }
  goInventory(): void { this.go('inventory', this.factories.inventory(this)); }
  goCompendium(): void { this.go('compendium', this.factories.compendium(this)); }
  goOpening(items: Item[]): void { this.go('opening', this.factories.opening(this, items)); }
  goReport(id: string): void { this.go('report', this.factories.report(this, id)); }

  // ------------------------------------------------------------ 描画

  private mount(): void {
    this.stage.load(this.screen.scene);
    // 検証スクリプトがここを読んで「今どの画面か」を確認する（§7.2）。
    // 座標決め打ちのスクリプトが別画面を測り続ける事故を、構造で防ぐ
    document.documentElement.dataset.screen = this.screenName;
    this.dirty = true;
    this.redraw();
  }

  private redraw(): void {
    // スクロール位置を保つ。全書き換えのたびに一覧が先頭へ飛ぶと使えない
    const prev = qs(this.ui, '.stack');
    const top = prev?.scrollTop ?? 0;
    this.ui.innerHTML = this.screen.render();
    const next = qs(this.ui, '.stack');
    if (next && top > 0) next.scrollTop = top;
    this.dirty = false;
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastMs) / 1000);
    this.lastMs = now;
    this.t += dt;

    if (this.screen.tick?.(dt)) this.dirty = true;
    if (this.dirty) this.redraw();
    this.stage.renderAt(this.t);
  };
  private lastMs = performance.now();

  /** テスト用。外から強制的に再描画させる。 */
  invalidate(): void { this.dirty = true; }
}
