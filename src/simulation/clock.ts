/** Discrete simulation time. Advances only via {@link SimulationClock.tick}. */
export class SimulationClock {
  private current = 0;

  get tick(): number {
    return this.current;
  }

  /** Advance by `steps` (default 1). Returns the new tick. */
  advance(steps = 1): number {
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error(`steps must be a positive integer, got ${steps}`);
    }
    this.current += steps;
    return this.current;
  }

  reset(): void {
    this.current = 0;
  }
}
