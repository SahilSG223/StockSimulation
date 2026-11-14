/**
 * Seeded PRNG (Mulberry32). All simulation randomness must go through this —
 * never call Math.random() from engine paths.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Force uint32; seed 0 is allowed and distinct from 1.
    this.state = seed >>> 0;
  }

  /** Next uint32 in [0, 2^32). */
  nextUint32(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  /**
   * Approximate standard normal via Box–Muller.
   * Consumes two uniform draws (deterministic given seed).
   */
  nextGaussian(): number {
    const u1 = Math.max(this.nextFloat(), Number.EPSILON);
    const u2 = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
