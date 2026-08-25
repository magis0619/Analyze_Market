// v1（OUTFITTER）の商談・観戦・系譜を削除した後の最小シェル。
// DELVERS の実装はこの後のコミットで積む（仕様書 §1.2「削除は必ずコミットを
// 分けること」に従い、破棄と新実装を混ぜない）。

export interface GameScreen {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  pointerDown?(x: number, y: number): void;
}

export class App {
  screen: GameScreen;

  constructor(readonly seed: number, screen: GameScreen) {
    this.screen = screen;
  }
}
