/**
 * Rolling window of observed prices per symbol (oldest → newest). Fed from
 * the engine's public prices after each step; never from ground-truth fields.
 */
export class PriceHistory {
  private readonly prices = new Map<string, number[]>();
  private lastTick: number | undefined;

  /** `capacity` = max prices kept per symbol; must cover the longest feature window + 1. */
  constructor(readonly capacity = 64) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new Error(`capacity must be an integer >= 2, got ${capacity}`);
    }
  }

  /** The tick of the most recent record, or undefined before the first one. */
  get latestTick(): number | undefined {
    return this.lastTick;
  }

  /** Record one tick of prices. Ticks must increase and the symbol set must stay the same. */
  record(snapshot: { tick: number; prices: Readonly<Record<string, number>> }): void {
    const { tick, prices } = snapshot;
    if (this.lastTick !== undefined && tick <= this.lastTick) {
      throw new Error(`tick ${tick} is not after last recorded tick ${this.lastTick}`);
    }

    const symbols = Object.keys(prices);
    if (this.prices.size > 0) {
      const same =
        symbols.length === this.prices.size && symbols.every((symbol) => this.prices.has(symbol));
      if (!same) throw new Error(`symbol set changed at tick ${tick}`);
    }

    for (const symbol of symbols) {
      const series = this.prices.get(symbol) ?? [];
      series.push(prices[symbol]!);
      if (series.length > this.capacity) series.shift();
      this.prices.set(symbol, series);
    }
    this.lastTick = tick;
  }

  symbols(): string[] {
    return [...this.prices.keys()];
  }

  /** Prices for one symbol, oldest → newest; empty if never recorded. */
  series(symbol: string): readonly number[] {
    return this.prices.get(symbol) ?? [];
  }
}
