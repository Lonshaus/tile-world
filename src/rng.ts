// 可存檔的亂數產生器（mulberry32），狀態只是一個 32 位元整數

export class Rng {
  constructor(public state: number) {}

  static fromTime(): Rng {
    return new Rng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pickWeighted(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i];
      if (x < 0) return i;
    }
    return weights.length - 1;
  }
}
