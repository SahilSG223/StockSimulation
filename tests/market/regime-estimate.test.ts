import { describe, expect, it } from "vitest";
import { computeMarketFeatures } from "../../src/market/features.js";
import { PriceHistory } from "../../src/market/price-history.js";
import {
  REGIME_VOLATILITY_THRESHOLDS as T,
  estimateRegime,
} from "../../src/market/regime-estimate.js";
import { DEFAULT_ASSETS } from "../../src/simulation/assets.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { RegimeId } from "../../src/simulation/types.js";

/** Seeds 41–60 were not used to choose the thresholds (calibration used 1–40). */
const SEEDS = Array.from({ length: 20 }, (_, i) => 41 + i);

/** Run one seed and return the estimate at every tick from 20 onward. */
function estimates(options: { seed: number; ticks: number; setup: (e: MarketEngine) => void }) {
  const engine = new MarketEngine({ seed: options.seed });
  options.setup(engine);
  const history = new PriceHistory();
  history.record({ tick: engine.tick, prices: engine.getPrices() });
  const out: { tick: number; truth: RegimeId; estimate: RegimeId | undefined }[] = [];
  for (let t = 1; t <= options.ticks; t++) {
    const snapshot = engine.step();
    history.record(snapshot);
    if (t < 20) continue;
    const { index } = computeMarketFeatures({ history, assets: DEFAULT_ASSETS });
    out.push({ tick: t, truth: snapshot.regime, estimate: estimateRegime(index) });
  }
  return out;
}

describe("estimateRegime", () => {
  it("returns undefined until volatility20 exists", () => {
    expect(estimateRegime({})).toBeUndefined();
    expect(estimateRegime({ return1: 0.01, return5: 0.02 })).toBeUndefined();
  });

  it("maps index volatility onto regimes at the thresholds", () => {
    expect(estimateRegime({ volatility20: T.lowVolBelow - 1e-6 })).toBe("low_vol");
    expect(estimateRegime({ volatility20: T.lowVolBelow })).toBe("bull");
    expect(estimateRegime({ volatility20: T.bearAbove })).toBe("bull");
    expect(estimateRegime({ volatility20: T.bearAbove + 1e-6 })).toBe("bear");
    expect(estimateRegime({ volatility20: T.highVolAbove })).toBe("bear");
    expect(estimateRegime({ volatility20: T.highVolAbove + 1e-6 })).toBe("high_vol");
  });

  it("is undefined before tick 20 in a real run", () => {
    const engine = new MarketEngine({ seed: 1 });
    const history = new PriceHistory();
    history.record({ tick: 0, prices: engine.getPrices() });
    for (let t = 1; t < 20; t++) history.record(engine.step());
    expect(estimateRegime(computeMarketFeatures({ history, assets: DEFAULT_ASSETS }).index)).toBe(
      undefined,
    );
  });

  // Calibration gate: if REGIME_PARAMS or DEFAULT_ASSETS change, retune the thresholds.
  it.each([
    // Held-out accuracy when calibrated: bull 88%, bear 85%, high_vol 98%, low_vol 98%.
    ["bull", 0.8],
    ["bear", 0.75],
    ["high_vol", 0.95],
    ["low_vol", 0.95],
  ] as const)("matches the true regime most of the time in a steady %s market", (regime, min) => {
    let correct = 0;
    let total = 0;
    for (const seed of SEEDS) {
      for (const e of estimates({ seed, ticks: 150, setup: (eng) => eng.setRegime(regime) })) {
        total += 1;
        if (e.estimate === e.truth) correct += 1;
      }
    }
    expect(correct / total).toBeGreaterThanOrEqual(min);
  });

  it("notices a bull → bear switch within 15 ticks for the median seed", () => {
    const lags = SEEDS.map((seed) => {
      const run = estimates({ seed, ticks: 120, setup: (eng) => eng.setRegime("bear", 60) });
      // First tick after the switch where the estimate has said "bear" 3 ticks running.
      const hit = run.find(
        (e, i) => e.tick >= 62 && run.slice(i - 2, i + 1).every((x) => x.estimate === "bear"),
      );
      return hit ? hit.tick - 60 : Infinity;
    }).sort((a, b) => a - b);

    expect(lags[Math.floor(lags.length / 2)]).toBeLessThanOrEqual(15);
  });
});
