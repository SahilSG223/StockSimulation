import type { RegimeId } from "../simulation/types.js";
import type { SeriesFeatures } from "./features.js";

/**
 * Index volatility cut-offs between regimes. Each one sits between the
 * typical 20-tick index volatility of neighbouring regimes, measured over 40
 * seeds × 150 ticks with the default assets:
 *   low_vol ≈ 0.0047, bull ≈ 0.0091, bear ≈ 0.0132, high_vol ≈ 0.0261
 *
 * Retune when REGIME_PARAMS or DEFAULT_ASSETS change; the calibration test in
 * tests/market/regime-estimate.test.ts fails when these drift out of line.
 */
export const REGIME_VOLATILITY_THRESHOLDS = {
  lowVolBelow: 0.0065,
  bearAbove: 0.0112,
  highVolAbove: 0.018,
} as const;

/**
 * Infer the market regime from observed prices only (agents never see the
 * engine's true regime). Uses volatility alone: in this simulator bull and
 * bear differ more reliably in how jumpy the market is than in its 20-tick
 * trend, which is mostly noise (adding trend lowered accuracy in calibration).
 *
 * Returns undefined until the index has 21 prices (volatility20 is absent).
 * The estimate lags real switches and is sometimes wrong; that's intended.
 */
export function estimateRegime(index: SeriesFeatures): RegimeId | undefined {
  const volatility = index.volatility20;
  if (volatility === undefined) return undefined;

  const t = REGIME_VOLATILITY_THRESHOLDS;
  if (volatility < t.lowVolBelow) return "low_vol";
  if (volatility > t.highVolAbove) return "high_vol";
  return volatility > t.bearAbove ? "bear" : "bull";
}
