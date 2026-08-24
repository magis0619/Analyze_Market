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

  /** 死亡演出：領域の彩度を落とす */
  applyDesaturate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (!this.desaturate) return;
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(13,10,18,0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}
