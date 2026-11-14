import type { MarketEngine } from "../simulation/market-engine.js";
import type { PriceSnapshot, PublicEventInfo, RegimeId } from "../simulation/types.js";
import { computeMarketFeatures, type MarketFeatures } from "./features.js";
import { PriceHistory } from "./price-history.js";
import { estimateRegime } from "./regime-estimate.js";

/** What agents may see about the market. Validated by `publicMarketObservationSchema`. */
export interface PublicMarketObservation {
  tick: number;
  prices: Readonly<Record<string, number>>;
  events: readonly PublicEventInfo[];
  features: Omit<MarketFeatures, "tick">;
  regimeEstimate?: RegimeId;
}

/**
 * Wraps the engine to build agent observations. Advance time with
 * `feed.step()` (not `engine.step()`) so the price history stays in sync;
 * `observe()` throws if the engine was advanced behind the feed's back.
 *
 * Built from public data only: the engine's true regime and hidden market
 * factor are dropped, and events carry public info only.
 */
export class MarketFeed {
  private readonly history: PriceHistory;

  constructor(
    private readonly engine: MarketEngine,
    options: { historyCapacity?: number } = {},
  ) {
    this.history = new PriceHistory(options.historyCapacity);
    this.history.record({ tick: engine.tick, prices: engine.getPrices() });
  }

  step(): PriceSnapshot {
    const snapshot = this.engine.step();
    this.history.record(snapshot);
    return snapshot;
  }

  observe(): PublicMarketObservation {
    const market = this.engine.observe();
    if (market.tick !== this.history.latestTick) {
      throw new Error(
        `engine is at tick ${market.tick} but feed recorded ${this.history.latestTick}; advance with feed.step()`,
      );
    }

    const { symbols, sectors, index } = computeMarketFeatures({
      history: this.history,
      assets: this.engine.config.assets,
    });
    const regimeEstimate = estimateRegime(index);

    return {
      tick: market.tick,
      prices: market.prices,
      events: market.events,
      features: { symbols, sectors, index },
      ...(regimeEstimate !== undefined ? { regimeEstimate } : {}),
    };
  }
}
