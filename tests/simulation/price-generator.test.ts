import { describe, expect, it } from "vitest";
import { DEFAULT_ASSETS } from "../../src/simulation/assets.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import { collectEffectsBySymbol, stepPrices } from "../../src/simulation/price-generator.js";
import { SeededRng } from "../../src/simulation/rng.js";
import type { MarketEvent } from "../../src/simulation/types.js";

describe("price generator", () => {
  it("exposes a small multi-sector universe with μ/β/vol params", () => {
    expect(DEFAULT_ASSETS.length).toBeGreaterThanOrEqual(4);
    const sectors = new Set(DEFAULT_ASSETS.map((a) => a.sector));
    expect(sectors.size).toBeGreaterThanOrEqual(4);
    for (const a of DEFAULT_ASSETS) {
      expect(a.mu).toBeTypeOf("number");
      expect(a.beta).toBeTypeOf("number");
      expect(a.vol).toBeGreaterThan(0);
      expect(a.initialPrice).toBeGreaterThan(0);
    }
  });

  it("regimes change generation path (bull vs bear diverge under same rng stream fork)", () => {
    const assets = DEFAULT_ASSETS;
    const prices = Object.fromEntries(assets.map((a) => [a.symbol, a.initialPrice]));
    const empty = new Map();

    const bull = stepPrices({
      assets,
      prices,
      regime: "bull",
      effectsBySymbol: empty,
      rng: new SeededRng(7),
    });
    const bear = stepPrices({
      assets,
      prices,
      regime: "bear",
      effectsBySymbol: empty,
      rng: new SeededRng(7),
    });

    expect(bull.prices).not.toEqual(bear.prices);
    expect(bull.marketReturn).not.toBe(bear.marketReturn);
  });

  it("high_vol produces larger average absolute returns than low_vol", () => {
    const engineHigh = new MarketEngine({ seed: 11, initialRegime: "high_vol" });
    const engineLow = new MarketEngine({ seed: 11, initialRegime: "low_vol" });

    let highAbs = 0;
    let lowAbs = 0;
    const steps = 40;
    let prevH = engineHigh.getPrices();
    let prevL = engineLow.getPrices();
    for (let i = 0; i < steps; i++) {
      engineHigh.step();
      engineLow.step();
      const h = engineHigh.getPrices();
      const l = engineLow.getPrices();
      for (const sym of Object.keys(prevH)) {
        highAbs += Math.abs(Math.log(h[sym]! / prevH[sym]!));
        lowAbs += Math.abs(Math.log(l[sym]! / prevL[sym]!));
      }
      prevH = h;
      prevL = l;
    }
    expect(highAbs).toBeGreaterThan(lowAbs);
  });

  it("collects event effects only for targeted symbols/sectors", () => {
    const event: MarketEvent = {
      id: "e1",
      type: "sector_rally",
      tick: 1,
      duration: 2,
      affectedSectors: ["Energy"],
      publicInfo: { headline: "Oil surge", summary: "Demand spike" },
      effect: { returnShock: 0.01, volMultiplier: 1.2, driftBias: 0.001 },
    };
    const map = collectEffectsBySymbol(DEFAULT_ASSETS, [event]);
    expect(map.has("ENRG")).toBe(true);
    expect(map.has("TECH")).toBe(false);
  });
});
