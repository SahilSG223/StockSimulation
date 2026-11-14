import { describe, expect, it, vi } from "vitest";
import { AgentRuntime, createArchetypeProvider, decisionSchema } from "../../src/agents/index.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";

const buyDecision = {
  orders: [{ symbol: "TECH", side: "buy", quantity: 2 }],
  reasoning: "Observed opportunity",
  strategy: "test",
  confidence: 0.5,
  memoryReferences: [],
};

function setup(decide: ConstructorParameters<typeof AgentRuntime>[0]["decide"]) {
  const simulation = new MarketEngine({ seed: 4, initialCash: 10_000 });
  simulation.registerAgent("alice");
  simulation.registerAgent("bob");
  const runtime = new AgentRuntime({ agentId: "alice", simulation, decide });
  return { simulation, runtime };
}

describe("agent decisions into simulation", () => {
  it("records authoritative fills, fees, and portfolio without affecting other agents", async () => {
    const { simulation, runtime } = setup(() => buyDecision);
    const bob = simulation.getPortfolio("bob");
    const record = await runtime.runCycle();
    expect(record.results[0]).toMatchObject({ status: "filled", order: { agentId: "alice" } });
    expect(record.portfolioAfter).toEqual(simulation.getPortfolio("alice"));
    expect(record.portfolioAfter.cash).toBeCloseTo(
      10_000 - simulation.getPrices().TECH! * 2 * 1.001,
    );
    expect(simulation.getPortfolio("bob")).toEqual(bob);
    expect(record.observation).not.toHaveProperty("regime");
    await expect(runtime.runCycle()).rejects.toThrow("already acted");
  });

  it.each([
    {
      ...buyDecision,
      orders: [...buyDecision.orders, { symbol: "TECH", side: "buy", quantity: -1 }],
    },
    {
      ...buyDecision,
      orders: [...buyDecision.orders, { symbol: "MISSING", side: "buy", quantity: 1 }],
    },
    { ...buyDecision, agentId: "bob" },
    { ...buyDecision, confidence: Number.NaN },
    { ...buyDecision, memoryReferences: ["invented"] },
    { ...buyDecision, orders: [{ ...buyDecision.orders[0], agentId: "bob" }] },
  ])("rejects invalid batches before any submission", async (decision) => {
    const { simulation, runtime } = setup(() => decision);
    const submit = vi.spyOn(simulation, "submitOrder");
    const before = simulation.getPortfolio("alice");
    await expect(runtime.runCycle()).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled();
    expect(simulation.getPortfolio("alice")).toEqual(before);
  });

  it("leaves financial risk rejection to the engine", async () => {
    const { runtime } = setup(() => ({
      ...buyDecision,
      orders: [{ symbol: "TECH", side: "buy", quantity: 1e9 }],
    }));
    expect((await runtime.runCycle()).results[0]).toMatchObject({
      status: "rejected",
      reason: "insufficient_cash",
    });
  });

  it("validates observations before calling the provider", async () => {
    const decide = vi.fn(() => buyDecision);
    const { simulation, runtime } = setup(decide);
    vi.spyOn(simulation, "observe").mockReturnValue({
      tick: 0,
      regime: "bull",
      prices: { TECH: -1 },
      events: [],
    });
    await expect(runtime.runCycle()).rejects.toThrow();
    expect(decide).not.toHaveBeenCalled();
  });

  it("rejects stale async decisions and overlapping cycles", async () => {
    let resolve!: (value: unknown) => void;
    const { simulation, runtime } = setup(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = runtime.runCycle();
    await expect(runtime.runCycle()).rejects.toThrow("already running");
    simulation.step();
    resolve(buyDecision);
    await expect(pending).rejects.toThrow("market advanced");
    expect(simulation.getPortfolio("alice").positions).toEqual([]);
  });

  it("supports hold decisions and preserves context against provider mutation", async () => {
    const { runtime } = setup(({ observation }) => {
      observation.portfolio.cash = 0;
      return { ...buyDecision, orders: [] };
    });
    const record = await runtime.runCycle();
    expect(record.results).toEqual([]);
    expect(record.observation.portfolio.cash).toBe(10_000);
  });

  it("rejects nonfinite quantities and unexpected financial claims", () => {
    expect(
      decisionSchema.safeParse({
        ...buyDecision,
        orders: [{ symbol: "TECH", side: "buy", quantity: Infinity }],
      }).success,
    ).toBe(false);
    expect(decisionSchema.safeParse({ ...buyDecision, fillPrice: 1 }).success).toBe(false);
  });

  it.each([
    "momentum",
    "contrarian",
    "conservative",
    "aggressive",
    "adaptive",
    "breakout",
    "dip_buyer",
  ] as const)("runs reproducible fixed scenarios with %s", async (archetype) => {
    async function run() {
      const { simulation, runtime } = setup(createArchetypeProvider(archetype));
      simulation.scheduleEvent({
        id: "rise",
        type: "news",
        tick: 1,
        duration: 2,
        affectedSymbols: ["TECH"],
        publicInfo: { headline: "Demand rises", summary: "Public news" },
        effect: { returnShock: 0.2, volMultiplier: 1, driftBias: 0 },
      });
      simulation.scheduleEvent({
        id: "fall",
        type: "news",
        tick: 3,
        duration: 2,
        affectedSymbols: ["TECH"],
        publicInfo: { headline: "Demand falls", summary: "Public news" },
        effect: { returnShock: -0.2, volMultiplier: 1, driftBias: 0 },
      });
      const records = [await runtime.runCycle()];
      for (let i = 0; i < 5; i++) {
        simulation.step();
        records.push(await runtime.runCycle());
      }
      return records;
    }
    const records = await run();
    expect(records).toEqual(await run());
    expect(records.some((r) => r.results.some((result) => result.status === "filled"))).toBe(true);
    expect(records[1]!.observation.events[0]).not.toHaveProperty("effect");
  });
});
