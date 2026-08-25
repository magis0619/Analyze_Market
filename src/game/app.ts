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

  /**
   * 画面遷移を起こしたタップの後始末フラグ。
   *
   * 画面は pointerDown で切り替わるが、そのタップの pointerUp / pointerMove は
   * **新しい画面**に届く。座標がたまたま新画面の当たり判定に重なっていると、
   * 押した覚えのない操作が1回入る。実際、拠点の「派遣準備」（y=324〜364）は
   * 派遣画面のステージ一覧（y∈[232,558)）の内側にあり、開いた瞬間に
   * ステージ3〜4が選ばれていた。
   *
   * 画面ごとにガードを足すと同じバグを永遠に作り続けるので、遷移した時点で
   * 「次の up を1回だけ捨てる」ことを App の責務として持つ。
   */
  private swallowUp = false;
  /** 今まさに指が触れている最中か。画面外から呼ばれた遷移と区別する */
  private pointerActive = false;

  /**
   * 入力層から pointerdown のたびに呼ぶ。
   *
   * これが無いと、指が触れていないところで呼ばれた遷移（update() の中や
   * デバッグ用の外部呼び出し）がフラグを立てっぱなしにして、
   * **次の無関係なタップが1回丸ごと消える**。実際、派遣画面を外から開いたあと
   * 装備一覧の最初のタップが反応しなかった。
   */
  notePointerDown(): void {
    this.swallowUp = false;
    this.pointerActive = true;
  }

  /** 入力層から pointerup / cancel のたびに呼ぶ。 */
  notePointerUp(): void {
    this.pointerActive = false;
  }

  /** 遷移直後かどうか（pointerMove の判定用。フラグは消費しない）。 */
  pendingSwallow(): boolean { return this.swallowUp; }

  /** 入力層から呼ぶ。true が返ったらその pointerUp は無視すること。 */
  consumeSwallowedUp(): boolean {
    if (!this.swallowUp) return false;
    this.swallowUp = false;
    return true;
  }

  private go(next: GameScreen): void {
    this.screen = next;
    // 指が触れている最中の遷移だけが、その指の pointerUp を捨てる必要がある
    this.swallowUp = this.pointerActive;
  }

  goBase(): void { this.go(this.factories.base(this)); }
  goDispatch(): void { this.go(this.factories.dispatch(this)); }
  goInventory(): void { this.go(this.factories.inventory(this)); }
  goCompendium(): void { this.go(this.factories.compendium(this)); }
  goOpening(items: Item[]): void { this.go(this.factories.opening(this, items)); }
  goReport(id: string): void { this.go(this.factories.report(this, id)); }
}
