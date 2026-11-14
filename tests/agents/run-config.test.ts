import { describe, expect, it, vi } from "vitest";
import { readAgentRunPlan, AGENT_WARMUP_TICKS } from "../../src/agents/run-config.js";
import { AgentRuntime } from "../../src/agents/runtime.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import { MarketFeed } from "../../src/market/market-feed.js";
import { retrieveForDecision } from "../../src/agents/memory-retrieve.js";
import { MemoryIndex } from "../../src/memory/embeddings/memory-index.js";
import { FakeEmbedder } from "../../src/memory/embeddings/fake-embedder.js";

describe("live agent run planning", () => {
  it("defaults to seven decision ticks with a complete post-warm-up shock", () => {
    const plan = readAgentRunPlan({}, []);
    expect(plan).toMatchObject({
      ticks: 27,
      warmupTicks: 20,
      decisionTicks: 7,
      expectedDecisionCalls: 49,
      scenario: "shock_mid",
      seed: 42,
    });
    expect(plan.agents).toHaveLength(7);
    expect(plan.events[0]!.tick).toBeGreaterThan(AGENT_WARMUP_TICKS);
    expect(plan.events[0]!.tick).toBe(21);
    expect(plan.ticks - 1).toBeGreaterThanOrEqual(plan.events[0]!.tick + plan.events[0]!.duration);
    expect(plan.events[0]!.id).toBe(`chip_export_ban-t${plan.events[0]!.tick}`);
    expect(plan.regimeChanges).toEqual([{ tick: plan.events[0]!.tick, regime: "bear" }]);
    expect(plan).toEqual(readAgentRunPlan({}, []));
  });

  it.each([0, 7, 42, 100, 4294967295])(
    "fits every whipsaw event with default duration (seed %i)",
    (seed) => {
      const plan = readAgentRunPlan({ AGENT_SCENARIO: "whipsaw", AGENT_SEED: String(seed) }, []);
      expect(plan.events).toHaveLength(3);
      expect(plan.events[0]!.tick).toBe(21);
      expect(plan.events.every((event) => event.tick + event.duration < plan.ticks)).toBe(true);
    },
  );

  it("supports CLI overrides, including the pnpm argument separator", () => {
    const plan = readAgentRunPlan({ AGENT_TICKS: "60", AGENTS: "momentum", AGENT_SEED: "42" }, [
      "--",
      "--ticks",
      "45",
      "--agents",
      "contrarian,conservative",
      "--seed",
      "7",
      "--scenario",
      "whipsaw",
      "--dry-run",
    ]);
    expect(plan).toMatchObject({
      ticks: 45,
      agents: ["contrarian", "conservative"],
      seed: 7,
      scenario: "whipsaw",
      dryRun: true,
      expectedDecisionCalls: 50,
    });
    expect(plan.events).toHaveLength(3);
    expect(plan.events.every((event) => event.tick > 20)).toBe(true);
    expect(plan.regimeChanges.map((change) => change.regime)).toEqual(["high_vol", "bull", "bear"]);
  });

  it.each([
    { AGENT_TICKS: "3" },
    { AGENT_TICKS: "Infinity" },
    { AGENT_TICKS: "40.5" },
    { AGENTS: "" },
    { AGENTS: "momentum," },
    { AGENTS: "missing" },
    { AGENTS: "momentum,momentum" },
    { AGENT_SCENARIO: "unknown" },
    { AGENT_SEED: "-1" },
    { AGENT_SEED: "4294967296" },
  ])("rejects invalid configuration before side effects: %j", (env) => {
    expect(() => readAgentRunPlan(env, [])).toThrow();
  });

  it("rejects a run that cannot finish the shock window and make a post-shock decision", () => {
    const base = readAgentRunPlan({}, []);
    const end = Math.max(...base.events.map((event) => event.tick + event.duration));
    expect(() => readAgentRunPlan({ AGENT_TICKS: String(end) }, [])).toThrow(`at least ${end + 1}`);
    expect(
      readAgentRunPlan({ AGENT_TICKS: String(end + 1), AGENTS: "momentum" }, [])
        .expectedDecisionCalls,
    ).toBe(end + 1 - 20);
  });

  it("allows a stable control with no events or regime shifts", () => {
    const plan = readAgentRunPlan(
      { AGENT_TICKS: "21", AGENT_SCENARIO: "stable", AGENTS: "momentum" },
      [],
    );
    expect(plan.events).toEqual([]);
    expect(plan.regimeChanges).toEqual([]);
    expect(plan.expectedDecisionCalls).toBe(1);
  });

  it("rejects misspelled flags rather than silently using the expensive defaults", () => {
    expect(() => readAgentRunPlan({}, ["--agent", "momentum"])).toThrow();
  });
});

describe("warm-up and regime-estimate integration", () => {
  it("warms up without decisions and surfaces a shock after an estimate is available", async () => {
    const plan = readAgentRunPlan({ AGENTS: "momentum" }, []);
    const simulation = new MarketEngine({ seed: plan.seed });
    const feed = new MarketFeed(simulation);
    simulation.registerAgent("momentum");
    for (const event of plan.events) simulation.scheduleEvent(event);
    for (const change of plan.regimeChanges) simulation.setRegime(change.regime, change.tick);
    const decide = vi.fn(() => ({
      orders: [],
      reasoning: "Observe public context",
      strategy: "momentum",
      confidence: 0.5,
      memoryReferences: [],
    }));
    const runtime = new AgentRuntime({
      agentId: "momentum",
      simulation,
      observeMarket: () => feed.observe(),
      decide,
    });
    for (let tick = 0; tick < plan.warmupTicks; tick++) feed.step();
    expect(decide).not.toHaveBeenCalled();
    expect(feed.observe().regimeEstimate).toBeDefined();
    const seenEvents = new Set<string>();
    const estimates = [];
    while (simulation.tick < plan.ticks) {
      const result = await runtime.runCycle();
      expect(result.observation).not.toHaveProperty("regime");
      expect(result.observation.regimeEstimate).toBeDefined();
      estimates.push(result.observation.regimeEstimate);
      for (const event of result.observation.events) seenEvents.add(event.id);
      feed.step();
    }
    expect(estimates[0]).not.toBe("");
    expect([...seenEvents]).toEqual(plan.events.map((event) => event.id));
    expect(decide).toHaveBeenCalledTimes(plan.expectedDecisionCalls);
    expect(simulation.tick).toBe(plan.ticks);
  });

  it("passes only the public inferred regime to memory retrieval", async () => {
    const simulation = new MarketEngine({ seed: 42 });
    simulation.registerAgent("a");
    const feed = new MarketFeed(simulation);
    for (let tick = 0; tick < 20; tick++) feed.step();
    const index = new MemoryIndex(new FakeEmbedder());
    const search = vi.spyOn(index, "search");
    const runtime = new AgentRuntime({
      agentId: "a",
      simulation,
      observeMarket: () => feed.observe(),
      retrieveMemories: (ctx) => retrieveForDecision({ index, agentId: "a", ctx }),
      decide: () => ({
        orders: [],
        reasoning: "hold",
        strategy: "conservative",
        confidence: 0,
        memoryReferences: [],
      }),
    });
    await runtime.runCycle();
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({ regimeEstimate: feed.observe().regimeEstimate }),
      }),
    );
  });
});
