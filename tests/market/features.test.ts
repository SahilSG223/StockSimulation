import { describe, expect, it } from "vitest";
import { computeMarketFeatures, seriesFeatures } from "../../src/market/features.js";
import { PriceHistory } from "../../src/market/price-history.js";
import { DEFAULT_ASSETS } from "../../src/simulation/assets.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";

describe("seriesFeatures", () => {
  it("leaves features out until there is enough history", () => {
    expect(seriesFeatures([100])).toEqual({});
    expect(seriesFeatures([100, 110, 99])).toEqual({ return1: 99 / 110 - 1 });
  });

  it("computes trailing returns over 1, 5 and 20 ticks", () => {
    const levels = Array.from({ length: 21 }, (_, i) => 100 + i);
    const features = seriesFeatures(levels);
    expect(features.return1).toBeCloseTo(120 / 119 - 1, 12);
    expect(features.return5).toBeCloseTo(120 / 115 - 1, 12);
    expect(features.return20).toBeCloseTo(120 / 100 - 1, 12);
  });

  it("volatility20 is zero for steady growth and matches a hand calculation for a zig-zag", () => {
    const steady = Array.from({ length: 21 }, (_, i) => 100 * 1.01 ** i);
    expect(seriesFeatures(steady).volatility20).toBeCloseTo(0, 12);

    // Alternating ×1.01 / ÷1.01: log returns are ±ln(1.01) with mean 0.
    const zigzag = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    const step = Math.log(1.01);
    expect(seriesFeatures(zigzag).volatility20).toBeCloseTo(step * Math.sqrt(20 / 19), 12);
  });

  it("momentum20 compares the latest level with the 20-tick average", () => {
    const levels = [...Array.from({ length: 19 }, () => 100), 120];
    // Average = (19 × 100 + 120) / 20 = 101.
    expect(seriesFeatures(levels).momentum20).toBeCloseTo(120 / 101 - 1, 12);
  });
});

describe("computeMarketFeatures", () => {
  const assets = [
    { symbol: "UP", sector: "Technology" as const },
    { symbol: "DOWN", sector: "Technology" as const },
    { symbol: "OIL", sector: "Energy" as const },
  ];

  it("builds equal-weighted sector and index returns from member returns", () => {
    const history = new PriceHistory();
    history.record({ tick: 0, prices: { UP: 100, DOWN: 50, OIL: 20 } });
    history.record({ tick: 1, prices: { UP: 110, DOWN: 45, OIL: 21 } }); // +10%, −10%, +5%

    const features = computeMarketFeatures({ history, assets });
    expect(features.tick).toBe(1);
    expect(features.symbols.UP?.return1).toBeCloseTo(0.1, 12);
    expect(features.sectors.Technology?.return1).toBeCloseTo(0, 12);
    expect(features.sectors.Energy?.return1).toBeCloseTo(0.05, 12);
    expect(features.index.return1).toBeCloseTo((0.1 - 0.1 + 0.05) / 3, 12);
    expect(features.sectors.Financials).toBeUndefined();
  });

  it("throws before any prices are recorded", () => {
    expect(() => computeMarketFeatures({ history: new PriceHistory(), assets })).toThrow();
  });

  it("produces complete, finite, reproducible features from a real engine run", () => {
    const run = () => {
      const engine = new MarketEngine({ seed: 5 });
      const history = new PriceHistory();
      history.record({ tick: engine.tick, prices: engine.getPrices() });
      for (let i = 0; i < 30; i++) history.record(engine.step());
      return computeMarketFeatures({ history, assets: DEFAULT_ASSETS });
    };

    const features = run();
    expect(features.tick).toBe(30);
    expect(Object.keys(features.symbols)).toEqual(DEFAULT_ASSETS.map((a) => a.symbol));
    expect(Object.keys(features.sectors)).toHaveLength(5);
    const all = [
      ...Object.values(features.symbols),
      ...Object.values(features.sectors),
      features.index,
    ];
    for (const f of all) {
      expect(Object.keys(f).sort()).toEqual([
        "momentum20",
        "return1",
        "return20",
        "return5",
        "volatility20",
      ]);
      for (const value of Object.values(f)) expect(Number.isFinite(value)).toBe(true);
    }
    expect(run()).toEqual(features);
  });
});
