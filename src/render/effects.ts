import { fillScrim } from './draw';
import { COLORS, OUTLINE } from './palette';

// §5.4 演出のメリハリ：
//  1. レア戦利品 … 0.8秒ホールド＋パーティクル
//  2. 装備由来の選択肢 … 該当装備アイコンが1回光る
//  3. 死亡 … 1.2秒停止＋彩度を落とす
// 平常時は淡々と進行させる。演出は上の3つに限定する。

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

export class Effects {
  /** 残り停止時間（秒）。>0 の間シミュレーション再生を止める */
  freeze = 0;
  /** 死亡演出中（彩度を落とす） */
  desaturate = false;
  particles: Particle[] = [];
  private counter = 0;

  holdRare(cx: number, cy: number): void {
    this.freeze = Math.max(this.freeze, 0.8);
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const spd = 24 + (i % 5) * 14;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 20,
        life: 0.9, maxLife: 0.9,
        color: i % 3 === 0 ? '#f2ede4' : '#e8c84c',
        size: i % 4 === 0 ? 3 : 2
      });
    }
  }

  holdDeath(): void {
    this.freeze = Math.max(this.freeze, 1.2);
    this.desaturate = true;
  }

  update(dt: number): void {
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      if (this.freeze === 0) this.desaturate = false;
    }
    this.counter += dt;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (p.life < p.maxLife * 0.35 && Math.floor(p.life * 20) % 2 === 0) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  /** 死亡演出：領域から色を抜く。
   *
   * 以前は globalCompositeOperation='saturation' に灰色を重ねていたが、
   * 合成の結果できる中間色はパレットの外なので §9.3 の32色制限を壊していた。
   * 代わりに石色の順序ディザを2枚重ねる。打つ色はパレット内の2色だけのまま、
   * 「色が抜けて石に変わった」ように見える。 */
  applyDesaturate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (!this.desaturate) return;
    // 濃さは残り時間に比例させて抜いていく。一定の濃さで1.2秒固定すると
    // その間レポートが一切読めず、「演出」ではなく「読めない時間」になる。
    const t = Math.max(0, Math.min(1, this.freeze / 1.2));
    fillScrim(ctx, x, y, w, h, COLORS.stoneDark, 0.22 * t);
    fillScrim(ctx, x, y, w, h, OUTLINE, 0.10 * t);
  }
}
