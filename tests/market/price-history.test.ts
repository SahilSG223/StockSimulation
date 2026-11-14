import { describe, expect, it } from "vitest";
import { PriceHistory } from "../../src/market/price-history.js";

describe("PriceHistory", () => {
  it("keeps prices per symbol, oldest first", () => {
    const history = new PriceHistory();
    history.record({ tick: 0, prices: { A: 100, B: 50 } });
    history.record({ tick: 1, prices: { A: 101, B: 49 } });

    expect(history.latestTick).toBe(1);
    expect(history.symbols()).toEqual(["A", "B"]);
    expect(history.series("A")).toEqual([100, 101]);
    expect(history.series("B")).toEqual([50, 49]);
    expect(history.series("UNKNOWN")).toEqual([]);
  });

  it("drops the oldest price once capacity is reached", () => {
    const history = new PriceHistory(3);
    for (let tick = 0; tick < 5; tick++) {
      history.record({ tick, prices: { A: 100 + tick } });
    }
    expect(history.series("A")).toEqual([102, 103, 104]);
  });

  it("rejects ticks that don't move forward", () => {
    const history = new PriceHistory();
    history.record({ tick: 2, prices: { A: 100 } });
    expect(() => history.record({ tick: 2, prices: { A: 101 } })).toThrow();
    expect(() => history.record({ tick: 1, prices: { A: 101 } })).toThrow();
  });

  it("rejects a changed symbol set so series never misalign", () => {
    const history = new PriceHistory();
    history.record({ tick: 0, prices: { A: 100, B: 50 } });
    expect(() => history.record({ tick: 1, prices: { A: 101 } })).toThrow();
    expect(() => history.record({ tick: 1, prices: { A: 101, C: 10 } })).toThrow();
  });

  it("rejects a capacity too small to compute anything", () => {
    expect(() => new PriceHistory(1)).toThrow();
    expect(() => new PriceHistory(2.5)).toThrow();
  });
});
