import { describe, expect, it } from "vitest";
import {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "../../src/memory/experiences/index.js";
import { DEFAULT_ASSETS, MarketEngine } from "../../src/simulation/index.js";

describe("recordTradeExperience", () => {
  it("records fills from the engine and keeps agents isolated", () => {
    const engine = new MarketEngine({ seed: 42 });
    engine.registerAgent("a1");
    engine.registerAgent("a2");

    const obs = engine.observe();
    const market = marketContextFromObservation(obs);
    const sectorOf = new Map(DEFAULT_ASSETS.map((a) => [a.symbol, a.sector]));

    const buy = engine.submitOrder({
      agentId: "a1",
      symbol: "SEMI",
      side: "buy",
      quantity: 10,
    });
    expect(buy.status).toBe("filled");

    const store = new ExperienceStore();
    const exp = recordTradeExperience({
      store,
      agentId: "a1",
      simulationId: "sim-seed-42",
      tick: engine.tick,
      market,
      decision: {
        reasoning: "momentum in semis",
        strategy: "momentum",
        confidence: 0.7,
        memoryReferences: [],
        orders: [{ symbol: "SEMI", side: "buy", quantity: 10 }],
      },
      results: [buy],
      sectorOf,
    });

    expect(exp.outcome.fills).toHaveLength(1);
    expect(exp.outcome.fills[0]?.symbol).toBe("SEMI");
    expect(exp.outcome.cashDelta).toBeLessThan(0);
    expect(exp.scope.sectors).toContain("Semiconductors");
    expect(exp.scope.regimes).toEqual([obs.regime]);
    expect(store.listForAgent("a2")).toHaveLength(0);
    expect(store.listForAgent("a1")).toHaveLength(1);
  });

  it("records rejections without inventing fills", () => {
    const engine = new MarketEngine({ seed: 7 });
    engine.registerAgent("a1", 10);

    const market = marketContextFromObservation(engine.observe());
    const rejected = engine.submitOrder({
      agentId: "a1",
      symbol: "TECH",
      side: "buy",
      quantity: 1000,
    });
    expect(rejected.status).toBe("rejected");

    const store = new ExperienceStore();
    const exp = recordTradeExperience({
      store,
      agentId: "a1",
      simulationId: "sim-7",
      tick: engine.tick,
      market,
      decision: {
        reasoning: "too aggressive",
        memoryReferences: [],
        orders: [{ symbol: "TECH", side: "buy", quantity: 1000 }],
      },
      results: [rejected],
    });

    expect(exp.outcome.fills).toHaveLength(0);
    expect(exp.outcome.rejections).toHaveLength(1);
    expect(exp.outcome.summary).toContain("rejected");
  });

  it("rejects mismatched agentId on execution results", () => {
    const store = new ExperienceStore();
    expect(() =>
      recordTradeExperience({
        store,
        agentId: "a1",
        simulationId: "sim",
        tick: 0,
        market: { regime: "bull", prices: {}, eventIds: [], eventTypes: [] },
        decision: { reasoning: "x", memoryReferences: [], orders: [] },
        results: [
          {
            status: "rejected",
            order: { agentId: "a2", symbol: "TECH", side: "buy", quantity: 1 },
            reason: "insufficient_cash",
            tick: 0,
          },
        ],
      }),
    ).toThrow(/does not match/);
  });
});
