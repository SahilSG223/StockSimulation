import { describe, expect, it } from "vitest";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { MarketEvent } from "../../src/simulation/types.js";

function sampleEvent(overrides: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: "ev-semi-shock",
    type: "supply_shock",
    tick: 5,
    duration: 3,
    affectedSectors: ["Semiconductors"],
    publicInfo: {
      headline: "Export curbs rumored",
      summary: "Policymakers may restrict chip exports.",
    },
    effect: {
      returnShock: -0.02,
      volMultiplier: 1.5,
      driftBias: -0.001,
    },
    ...overrides,
  };
}

function runTrajectory(seed: number, steps: number) {
  const engine = new MarketEngine({ seed });
  engine.scheduleEvent(sampleEvent());
  engine.setRegime("high_vol", 10);
  engine.registerAgent("a1");
  const prices: Record<string, number>[] = [engine.getPrices()];
  for (let i = 0; i < steps; i++) {
    engine.step();
    prices.push(engine.getPrices());
  }
  return { prices, finalTick: engine.tick, regime: engine.currentRegime };
}

describe("seeded determinism", () => {
  it("same seed + config yields identical price trajectories", () => {
    const a = runTrajectory(42, 25);
    const b = runTrajectory(42, 25);
    expect(a).toEqual(b);
  });

  it("different seeds diverge", () => {
    const a = runTrajectory(1, 20);
    const b = runTrajectory(2, 20);
    expect(a.prices).not.toEqual(b.prices);
  });

  it("orders + fills are reproducible for the same seed and sequence", () => {
    const run = (seed: number) => {
      const eng = new MarketEngine({ seed, transactionCostRate: 0.001 });
      eng.registerAgent("trader");
      eng.step();
      eng.step();
      const r1 = eng.submitOrder({
        agentId: "trader",
        symbol: "TECH",
        side: "buy",
        quantity: 10,
      });
      eng.step();
      const r2 = eng.submitOrder({
        agentId: "trader",
        symbol: "TECH",
        side: "sell",
        quantity: 4,
      });
      return {
        r1,
        r2,
        portfolio: eng.getPortfolio("trader"),
        prices: eng.getPrices(),
      };
    };

    expect(run(99)).toEqual(run(99));
  });
});
