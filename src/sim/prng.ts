// Seedable xorshift32 PRNG. The simulation must use this exclusively;
// the built-in nondeterministic RNG must never appear under src/sim/ (spec C2).
export class Prng {
  private s: number;

  constructor(seed: number) {
    // Avoid the all-zero lock state; mix the seed once.
    let x = (seed >>> 0) || 0x9e3779b9;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
  }

  /** Raw 32-bit unsigned integer. */
  next(): number {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next() / 0x1_0000_0000;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }

  /** Uniform integer in [a, b] inclusive. */
  range(a: number, b: number): number {
    return a + this.int(b - a + 1);
  }

  /** Pick one element. */
  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(arr.length)];
    if (v === undefined) throw new Error('pick from empty array');
    return v;
  }

  /** Bernoulli trial. */
  chance(p: number): boolean {
    return this.float() < p;
  }
}
