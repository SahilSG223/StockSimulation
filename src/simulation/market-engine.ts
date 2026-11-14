import { DEFAULT_ASSETS } from "./assets.js";
import { SimulationClock } from "./clock.js";
import { EventScheduler } from "./event-scheduler.js";
import { executeOrder } from "./execution-engine.js";
import { PortfolioManager } from "./portfolio-manager.js";
import { collectEffectsBySymbol, stepPrices } from "./price-generator.js";
import { REGIME_PARAMS } from "./regimes.js";
import { SeededRng } from "./rng.js";
import type {
  ExecutionResult,
  MarketEvent,
  Order,
  PortfolioSnapshot,
  PriceSnapshot,
  PublicEventInfo,
  RegimeId,
  SimulationConfig,
} from "./types.js";

export interface MarketObservation {
  tick: number;
  regime: RegimeId;
  prices: Readonly<Record<string, number>>;
  /** Public event info only — no ground-truth effect fields. */
  events: readonly PublicEventInfo[];
}

const DEFAULT_INITIAL_REGIME: RegimeId = "bull";

/**
 * Top-level deterministic market. Owns prices, clock, events, and portfolios.
 * Agents submit orders; they never write cash/position fields.
 */
export class MarketEngine {
  readonly config: Readonly<SimulationConfig>;
  private readonly clock = new SimulationClock();
  private readonly rng: SeededRng;
  private readonly events = new EventScheduler();
  private readonly portfolios = new PortfolioManager();
  private readonly knownSymbols: ReadonlySet<string>;
  private prices: Record<string, number>;
  private regime: RegimeId;
  private lastMarketReturn = 0;
  /** Optional regime changes keyed by tick (applied at the start of that tick's step). */
  private readonly regimeSchedule = new Map<number, RegimeId>();

  constructor(config: Partial<SimulationConfig> & { seed: number }) {
    const initialRegime = config.initialRegime ?? DEFAULT_INITIAL_REGIME;
    if (!(initialRegime in REGIME_PARAMS)) {
      throw new Error(`unknown regime: ${initialRegime}`);
    }

    this.config = {
      seed: config.seed,
      assets: config.assets ?? DEFAULT_ASSETS,
      initialCash: config.initialCash ?? 100_000,
      transactionCostRate: config.transactionCostRate ?? 0.001,
      ...(config.maxPositionSize !== undefined ? { maxPositionSize: config.maxPositionSize } : {}),
      initialRegime,
    };

    this.rng = new SeededRng(this.config.seed);
    this.knownSymbols = new Set(this.config.assets.map((a) => a.symbol));
    this.regime = initialRegime;
    this.prices = Object.fromEntries(this.config.assets.map((a) => [a.symbol, a.initialPrice]));
  }

  get tick(): number {
    return this.clock.tick;
  }

  get currentRegime(): RegimeId {
    return this.regime;
  }

  getPrices(): Readonly<Record<string, number>> {
    return { ...this.prices };
  }

  registerAgent(agentId: string, initialCash?: number): void {
    this.portfolios.register(agentId, initialCash ?? this.config.initialCash);
  }

  scheduleEvent(event: MarketEvent): void {
    this.events.schedule(event);
  }

  /** Change regime immediately, or schedule a change for a future tick. */
  setRegime(regime: RegimeId, atTick?: number): void {
    if (!(regime in REGIME_PARAMS)) {
      throw new Error(`unknown regime: ${regime}`);
    }
    if (atTick === undefined || atTick <= this.clock.tick) {
      this.regime = regime;
      return;
    }
    this.regimeSchedule.set(atTick, regime);
  }

  submitOrder(order: Order): ExecutionResult {
    return executeOrder({
      order,
      tick: this.clock.tick,
      price: this.prices[order.symbol],
      portfolios: this.portfolios,
      knownSymbols: this.knownSymbols,
      limits: {
        transactionCostRate: this.config.transactionCostRate,
        ...(this.config.maxPositionSize !== undefined
          ? { maxPositionSize: this.config.maxPositionSize }
          : {}),
      },
    });
  }

  getPortfolio(agentId: string): PortfolioSnapshot {
    return this.portfolios.getSnapshot(agentId, this.prices);
  }

  /**
   * Advance one tick: apply scheduled regime, generate prices under active
   * events, then bump the clock.
   */
  step(): PriceSnapshot {
    const nextTick = this.clock.tick + 1;
    const scheduled = this.regimeSchedule.get(nextTick);
    if (scheduled !== undefined) {
      this.regime = scheduled;
      this.regimeSchedule.delete(nextTick);
    }

    const active = this.events.activeAt(nextTick);
    const effectsBySymbol = collectEffectsBySymbol(this.config.assets, active);
    const result = stepPrices({
      assets: this.config.assets,
      prices: this.prices,
      regime: this.regime,
      effectsBySymbol,
      rng: this.rng,
    });

    this.prices = result.prices;
    this.lastMarketReturn = result.marketReturn;
    this.clock.advance(1);

    return {
      tick: this.clock.tick,
      prices: { ...this.prices },
      marketReturn: this.lastMarketReturn,
      regime: this.regime,
    };
  }

  /** Run `n` steps; returns the final snapshot. */
  run(n: number): PriceSnapshot {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`n must be a positive integer`);
    }
    let snap: PriceSnapshot | undefined;
    for (let i = 0; i < n; i++) {
      snap = this.step();
    }
    return snap!;
  }

  observe(): MarketObservation {
    return {
      tick: this.clock.tick,
      regime: this.regime,
      prices: this.getPrices(),
      events: this.events.publicInfoAt(this.clock.tick),
    };
  }

  /** Ground-truth events for evaluation — includes effect fields. */
  getEvents(): readonly MarketEvent[] {
    return this.events.all();
  }
}
