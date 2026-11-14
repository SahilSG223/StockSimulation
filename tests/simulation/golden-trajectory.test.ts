/**
 * Locks the market model to fixed numbers. Run-vs-run determinism tests pass
 * even if the model changes consistently (e.g. RNG draws reordered); this one
 * does not. If it fails after an intentional model change, bump
 * SIMULATION_VERSION and update the values below in the same commit.
 */
import { describe, expect, it } from "vitest";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { PriceSnapshot } from "../../src/simulation/types.js";

const EXPECTED: Record<number, PriceSnapshot> = {
  1: {
    tick: 1,
    prices: {
      TECH: 98.98489635615539,
      SEMI: 76.93441128039501,
      ENRG: 58.808602532675906,
      BANK: 49.43302897194422,
      CONS: 40.19665279124421,
    },
    marketReturn: -0.006849297835073192,
    regime: "bull",
  },
  // Semiconductor shock active (ticks 5–7).
  5: {
    tick: 5,
    prices: {
      TECH: 98.49810229801268,
      SEMI: 76.78702391759487,
      ENRG: 58.058253403358286,
      BANK: 51.48249939209227,
      CONS: 40.96911998153755,
    },
    marketReturn: -0.002586287043293398,
    regime: "bull",
  },
  7: {
    tick: 7,
    prices: {
      TECH: 101.69613293359693,
      SEMI: 78.28051530012846,
      ENRG: 57.752355553008876,
      BANK: 52.06237364605855,
      CONS: 41.58323385107618,
    },
    marketReturn: 0.0047916788622994365,
    regime: "bull",
  },
  // Scheduled switch to bear.
  10: {
    tick: 10,
    prices: {
      TECH: 97.67711532011612,
      SEMI: 78.10766613486327,
      ENRG: 56.521412047152,
      BANK: 52.12735866992447,
      CONS: 40.44338474835519,
    },
    marketReturn: -0.013677503284018955,
    regime: "bear",
  },
  25: {
    tick: 25,
    prices: {
      TECH: 102.43291273805055,
      SEMI: 83.26523878036974,
      ENRG: 51.55789426970263,
      BANK: 53.457337855719736,
      CONS: 41.532014859465306,
    },
    marketReturn: 0.01926958006999693,
    regime: "bear",
  },
};

/** Tolerance is far below any real model change but absorbs float noise across platforms. */
const DIGITS = 9;

function expectSnapshotClose(actual: PriceSnapshot, expected: PriceSnapshot): void {
  expect(actual.tick).toBe(expected.tick);
  expect(actual.regime).toBe(expected.regime);
  expect(actual.marketReturn).toBeCloseTo(expected.marketReturn, DIGITS);
  expect(Object.keys(actual.prices)).toEqual(Object.keys(expected.prices));
  for (const [symbol, price] of Object.entries(expected.prices)) {
    expect(actual.prices[symbol]).toBeCloseTo(price, DIGITS);
  }
}

describe("golden trajectory (seed 42)", () => {
  it("matches recorded prices, regimes, and fills", () => {
    const engine = new MarketEngine({ seed: 42 });
    engine.scheduleEvent({
      id: "golden-semi-shock",
      type: "supply_shock",
      tick: 5,
      duration: 3,
      affectedSectors: ["Semiconductors"],
      publicInfo: { headline: "Export curbs rumored", summary: "Chip exports may be restricted." },
      effect: { returnShock: -0.02, volMultiplier: 1.5, driftBias: -0.001 },
    });
    engine.setRegime("bear", 10);
    engine.registerAgent("golden");

    for (let t = 1; t <= 25; t++) {
      if (t === 4) {
        engine.submitOrder({ agentId: "golden", symbol: "SEMI", side: "buy", quantity: 100 });
      }
      if (t === 15) {
        engine.submitOrder({ agentId: "golden", symbol: "SEMI", side: "sell", quantity: 100 });
      }
      const snapshot = engine.step();
      const expected = EXPECTED[t];
      if (expected) expectSnapshotClose(snapshot, expected);
    }

    const portfolio = engine.getPortfolio("golden");
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.cash).toBeCloseTo(99776.51938491719, DIGITS);
    expect(portfolio.realizedPnl).toBeCloseTo(-215.60051147816574, DIGITS);
    expect(portfolio.equity).toBeCloseTo(99776.51938491719, DIGITS);
  });
});
