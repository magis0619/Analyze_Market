import { Shop } from './shop';
import type { AdvSnapshot, RunOutcome } from '../sim/types';
import { TitleScreen } from '../ui/title';
import { NegotiationScreen } from '../ui/negotiation';
import { SendoffScreen } from '../ui/sendoff';
import { SpectateScreen } from '../ui/spectate';
import { ResultScreen } from '../ui/result';
import { Prng } from '../sim/prng';

export interface GameScreen {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  pointerDown?(x: number, y: number): void;
}

/** 進行中の1ラン。リプレイは seed + equipment + choices で完全再現できる。 */
export interface RunRecord {
  seed: number;
  adv: AdvSnapshot;
  equipment: string[];
  choices: number[];
  outcome?: RunOutcome;
}

export class App {
  shop: Shop;
  run: RunRecord | null = null;
  screen: GameScreen;
  /** 自動プレイ（検証用 ?auto=1） */
  auto = false;
  /** 再生速度（検証用 ?fast=N） */
  speed = 1;

  constructor(seed: number) {
    this.shop = new Shop(seed);
    this.screen = new TitleScreen(this);
  }

  gotoTitle(): void {
    this.screen = new TitleScreen(this);
  }

  gotoNegotiation(): void {
    this.run = null;
    this.screen = new NegotiationScreen(this);
    if (this.auto) {
      // 自動プレイ：決定論的に0〜3点を見立てて送り出す
      const rng = new Prng(this.shop.runSeed() ^ 0xa07a);
      const avail = this.shop.available();
      const n = Math.min(avail.length, rng.int(4));
      const pick: string[] = [];
      const pool = [...avail];
      for (let i = 0; i < n; i++) {
        const idx = rng.int(pool.length);
        const id = pool.splice(idx, 1)[0];
        if (id) pick.push(id);
      }
      this.startRun(pick);
    }
  }

  startRun(equipment: string[]): void {
    this.run = {
      seed: this.shop.runSeed(),
      adv: this.shop.advSnapshot(),
      equipment: [...equipment],
      choices: []
    };
    this.screen = new SendoffScreen(this);
    if (this.auto) this.gotoSpectate();
  }

  gotoSpectate(): void {
    this.screen = new SpectateScreen(this);
  }

  gotoResult(): void {
    this.screen = new ResultScreen(this);
  }
}
