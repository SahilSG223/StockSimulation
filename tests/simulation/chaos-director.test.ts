import { describe, expect, it } from "vitest";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import { planChaos, type ChaosScenarioId } from "../../src/simulation/chaos-director.js";

describe("planChaos", () => {
  it("stable scenario is always an empty plan, regardless of seed", () => {
    for (const seed of [0, 1, 42, 999]) {
      const result = planChaos({ seed, scenarioId: "stable" });
      expect(result.plan).toEqual([]);
      expect(result.events).toEqual([]);
    }
  });

  it.each<ChaosScenarioId>(["shock_mid", "whipsaw"])(
    "%s: same seed produces a deep-equal plan every time",
    (scenarioId) => {
      const a = planChaos({ seed: 42, scenarioId });
      const b = planChaos({ seed: 42, scenarioId });
      expect(a).toEqual(b);
    },
  );

  it("shock_mid varies its tick across different seeds", () => {
    const ticks = new Set(
      Array.from({ length: 10 }, (_, seed) => planChaos({ seed, scenarioId: "shock_mid" }).plan[0]!.tick),
    );
    expect(ticks.size).toBeGreaterThan(1);
  });

  it("whipsaw schedules market_crash, ai_demand_spike, chip_export_ban at strictly increasing ticks", () => {
    const { plan } = planChaos({ seed: 7, scenarioId: "whipsaw" });
    expect(plan.map((p) => p.preset)).toEqual(["market_crash", "ai_demand_spike", "chip_export_ban"]);
    expect(plan[1]!.tick).toBeGreaterThan(plan[0]!.tick);
    expect(plan[2]!.tick).toBeGreaterThan(plan[1]!.tick);
  });

  it("events match the plan and are accepted by MarketEngine.scheduleEvent", () => {
    const { events, plan } = planChaos({ seed: 7, scenarioId: "whipsaw" });
    expect(events.map((e) => ({ preset: e.type, tick: e.tick }))).toEqual(
      plan.map((p) => ({ preset: p.preset, tick: p.tick })),
    );

    const engine = new MarketEngine({ seed: 7 });
    for (const event of events) {
      expect(() => engine.scheduleEvent(event)).not.toThrow();
    }
  });
});
