import type { RegimeId, RegimeParams } from "./types.js";

/** Regime remaps market-factor and asset μ/vol — not arbitrary price multipliers. */
export const REGIME_PARAMS: Readonly<Record<RegimeId, RegimeParams>> = {
  bull: {
    id: "bull",
    marketMu: 0.0008,
    marketVol: 0.008,
    driftMultiplier: 1.4,
    volMultiplier: 0.9,
  },
  bear: {
    id: "bear",
    marketMu: -0.0008,
    marketVol: 0.012,
    driftMultiplier: 0.5,
    volMultiplier: 1.2,
  },
  high_vol: {
    id: "high_vol",
    marketMu: 0,
    marketVol: 0.025,
    driftMultiplier: 1.0,
    volMultiplier: 2.0,
  },
  low_vol: {
    id: "low_vol",
    marketMu: 0.0002,
    marketVol: 0.004,
    driftMultiplier: 1.0,
    volMultiplier: 0.5,
  },
};

export function getRegimeParams(id: RegimeId): RegimeParams {
  return REGIME_PARAMS[id];
}
