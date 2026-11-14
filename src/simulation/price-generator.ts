import { getRegimeParams } from "./regimes.js";
import type { SeededRng } from "./rng.js";
import type { AssetParams, MarketEvent, RegimeId } from "./types.js";

export interface ActiveEventEffect {
  returnShock: number;
  volMultiplier: number;
  driftBias: number;
}

export interface PriceStepInput {
  assets: readonly AssetParams[];
  prices: Readonly<Record<string, number>>;
  regime: RegimeId;
  /** Active events already filtered to those that hit each symbol this tick. */
  effectsBySymbol: ReadonlyMap<string, readonly ActiveEventEffect[]>;
  rng: SeededRng;
}

export interface PriceStepResult {
  prices: Record<string, number>;
  returns: Record<string, number>;
  marketReturn: number;
}

/**
 * One tick of the factor model:
 *   r_i = μ_regime,i + β_i * r_m + ε_i + event shocks
 *   P_i' = P_i * exp(r_i)
 */
export function stepPrices(input: PriceStepInput): PriceStepResult {
  const regime = getRegimeParams(input.regime);
  const marketReturn = regime.marketMu + regime.marketVol * input.rng.nextGaussian();

  const prices: Record<string, number> = {};
  const returns: Record<string, number> = {};

  for (const asset of input.assets) {
    const prev = input.prices[asset.symbol];
    if (prev === undefined) {
      throw new Error(`missing price for ${asset.symbol}`);
    }

    const effects = input.effectsBySymbol.get(asset.symbol) ?? [];
    let eventReturn = 0;
    let eventVolMult = 1;
    let eventDrift = 0;
    for (const e of effects) {
      eventReturn += e.returnShock * asset.eventExposure;
      eventVolMult *= e.volMultiplier;
      eventDrift += e.driftBias * asset.eventExposure;
    }

    const mu = asset.mu * regime.driftMultiplier + eventDrift;
    const vol = asset.vol * regime.volMultiplier * eventVolMult;
    const eps = vol * input.rng.nextGaussian();
    const r = mu + asset.beta * marketReturn + eps + eventReturn;

    returns[asset.symbol] = r;
    prices[asset.symbol] = prev * Math.exp(r);
  }

  return { prices, returns, marketReturn };
}

/** Collapse overlapping events that affect a symbol into active effect list. */
export function collectEffectsBySymbol(
  assets: readonly AssetParams[],
  activeEvents: readonly MarketEvent[],
): Map<string, ActiveEventEffect[]> {
  const bySymbol = new Map<string, ActiveEventEffect[]>();

  for (const asset of assets) {
    const list: ActiveEventEffect[] = [];
    for (const ev of activeEvents) {
      if (!eventAffectsAsset(ev, asset)) continue;
      list.push({
        returnShock: ev.effect.returnShock,
        volMultiplier: ev.effect.volMultiplier,
        driftBias: ev.effect.driftBias,
      });
    }
    if (list.length > 0) {
      bySymbol.set(asset.symbol, list);
    }
  }

  return bySymbol;
}

export function eventAffectsAsset(event: MarketEvent, asset: AssetParams): boolean {
  const symbols = event.affectedSymbols;
  const sectors = event.affectedSectors;
  const hasSymbolFilter = symbols !== undefined && symbols.length > 0;
  const hasSectorFilter = sectors !== undefined && sectors.length > 0;

  if (!hasSymbolFilter && !hasSectorFilter) {
    // Untargeted event hits the whole universe.
    return true;
  }

  if (hasSymbolFilter && symbols.includes(asset.symbol)) return true;
  if (hasSectorFilter && sectors.includes(asset.sector)) return true;
  return false;
}
