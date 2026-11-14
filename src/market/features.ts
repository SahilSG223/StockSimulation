import type { AssetParams, Sector } from "../simulation/types.js";
import type { PriceHistory } from "./price-history.js";

/**
 * Deterministic features computed from observed prices only. A field is absent
 * (not null) until the history is long enough to compute it.
 *
 * - returnN: simple return over the last N ticks (0.02 = +2%)
 * - volatility20: sample std dev of the last 20 one-tick log returns
 * - momentum20: latest level vs the mean of the last 20 levels (0.01 = 1% above)
 */
export interface SeriesFeatures {
  return1?: number;
  return5?: number;
  return20?: number;
  volatility20?: number;
  momentum20?: number;
}

export interface MarketFeatures {
  /** Tick the features describe (latest recorded tick). */
  tick: number;
  symbols: Record<string, SeriesFeatures>;
  /** Equal-weighted per sector; sectors with no recorded symbols are omitted. */
  sectors: Partial<Record<Sector, SeriesFeatures>>;
  /**
   * Equal-weighted index of every symbol, built from observed prices. Not the
   * engine's hidden market factor (`marketReturn`), which is ground truth.
   */
  index: SeriesFeatures;
}

/** Features for one level series (oldest → newest). */
export function seriesFeatures(levels: readonly number[]): SeriesFeatures {
  const features: SeriesFeatures = {};
  const set = (key: keyof SeriesFeatures, value: number | undefined): void => {
    if (value !== undefined) features[key] = value;
  };
  set("return1", trailingReturn(levels, 1));
  set("return5", trailingReturn(levels, 5));
  set("return20", trailingReturn(levels, 20));
  set("volatility20", realizedVolatility(levels, 20));
  set("momentum20", momentum(levels, 20));
  return features;
}

export function computeMarketFeatures(options: {
  history: PriceHistory;
  assets: readonly Pick<AssetParams, "symbol" | "sector">[];
}): MarketFeatures {
  const { history, assets } = options;
  const tick = history.latestTick;
  if (tick === undefined) throw new Error("no prices recorded yet");

  const symbols: Record<string, SeriesFeatures> = {};
  for (const symbol of history.symbols()) {
    symbols[symbol] = seriesFeatures(history.series(symbol));
  }

  const bySector = new Map<Sector, (readonly number[])[]>();
  for (const asset of assets) {
    const series = history.series(asset.symbol);
    if (series.length === 0) continue;
    bySector.set(asset.sector, [...(bySector.get(asset.sector) ?? []), series]);
  }
  const sectors: Partial<Record<Sector, SeriesFeatures>> = {};
  for (const [sector, members] of bySector) {
    sectors[sector] = seriesFeatures(equalWeightLevels(members));
  }

  const all = history.symbols().map((symbol) => history.series(symbol));
  return { tick, symbols, sectors, index: seriesFeatures(equalWeightLevels(all)) };
}

function trailingReturn(levels: readonly number[], window: number): number | undefined {
  if (levels.length < window + 1) return undefined;
  return levels.at(-1)! / levels.at(-1 - window)! - 1;
}

function realizedVolatility(levels: readonly number[], window: number): number | undefined {
  if (levels.length < window + 1) return undefined;
  const recent = levels.slice(-(window + 1));
  const logReturns = recent.slice(1).map((level, i) => Math.log(level / recent[i]!));
  const mean = logReturns.reduce((sum, r) => sum + r, 0) / window;
  const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (window - 1);
  return Math.sqrt(variance);
}

function momentum(levels: readonly number[], window: number): number | undefined {
  if (levels.length < window) return undefined;
  const average = levels.slice(-window).reduce((sum, level) => sum + level, 0) / window;
  return levels.at(-1)! / average - 1;
}

/**
 * Equal-weighted index levels starting at 1: each tick's index return is the
 * average of the members' one-tick returns (rebalanced every tick), so the
 * result doesn't depend on where the rolling history window starts.
 */
function equalWeightLevels(members: readonly (readonly number[])[]): number[] {
  const length = members[0]?.length ?? 0;
  const levels = length > 0 ? [1] : [];
  for (let t = 1; t < length; t++) {
    const averageReturn =
      members.reduce((sum, series) => sum + series[t]! / series[t - 1]! - 1, 0) / members.length;
    levels.push(levels[t - 1]! * (1 + averageReturn));
  }
  return levels;
}
