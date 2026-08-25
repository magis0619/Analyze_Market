import type { Item } from '../sim/types';
import { GameState } from './state';

export interface GameScreen {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  pointerDown?(x: number, y: number): void;
  /** ドラッグでのスクロールに対応する画面だけ実装すればよい */
  pointerMove?(x: number, y: number): void;
  pointerUp?(x: number, y: number): void;
}

/** 画面から呼ぶ遷移。画面同士は互いを import しない。 */
export interface Nav {
  readonly state: GameState;
  /** 実時間の倍率（デバッグ用。1が本番） */
  readonly timeScale: number;
  now(): number;
  goBase(): void;
  goDispatch(): void;
  goInventory(): void;
  goCompendium(): void;
  goOpening(items: Item[]): void;
  goReport(dispatchId: string): void;
}

export class App implements Nav {
  screen: GameScreen;
  readonly state: GameState;
  timeScale = 1;
  private factories: {
    base: (nav: Nav) => GameScreen;
    dispatch: (nav: Nav) => GameScreen;
    inventory: (nav: Nav) => GameScreen;
    compendium: (nav: Nav) => GameScreen;
    opening: (nav: Nav, items: Item[]) => GameScreen;
    report: (nav: Nav, dispatchId: string) => GameScreen;
  };

  constructor(
    state: GameState,
    factories: App['factories'],
    initial: (nav: Nav) => GameScreen
  ) {
    this.state = state;
    this.factories = factories;
    this.screen = initial(this);
  }

  now(): number {
    // timeScale > 1 のとき、経過時間を水増しして見せる（開発時の確認用）。
    // 本番（timeScale = 1）では Date.now() をそのまま使う。
    if (this.timeScale === 1) return Date.now();
    const origin = this.originMs;
    return origin + (Date.now() - origin) * this.timeScale;
  }
  private originMs = Date.now();

  goBase(): void { this.screen = this.factories.base(this); }
  goDispatch(): void { this.screen = this.factories.dispatch(this); }
  goInventory(): void { this.screen = this.factories.inventory(this); }
  goCompendium(): void { this.screen = this.factories.compendium(this); }
  goOpening(items: Item[]): void { this.screen = this.factories.opening(this, items); }
  goReport(id: string): void { this.screen = this.factories.report(this, id); }
}
