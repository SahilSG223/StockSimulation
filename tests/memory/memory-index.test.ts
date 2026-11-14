import { describe, expect, it } from "vitest";
import {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "../../src/memory/experiences/index.js";
import {
  FakeEmbedder,
  MemoryIndex,
  consolidateExperienceToMemory,
} from "../../src/memory/embeddings/index.js";
import { MarketEngine } from "../../src/simulation/index.js";

describe("MemoryIndex", () => {
  it("retrieves by semantic overlap and isolates agents", async () => {
    const index = new MemoryIndex(new FakeEmbedder());
    await index.upsert({
      agentId: "a1",
      content: "buy semiconductors on positive ai demand in bull markets",
      updatedAtTick: 10,
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bull"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
    });
    await index.upsert({
      agentId: "a2",
      content: "buy semiconductors on positive ai demand in bull markets",
      updatedAtTick: 10,
      reliability: 0.99,
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bull"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
    });

    const hits = await index.search({
      agentId: "a1",
      query: "semiconductor ai demand bull",
      ctx: {
        tick: 20,
        regimeEstimate: "bull",
        sectors: ["Semiconductors"],
        eventTypes: ["positive_ai_demand"],
      },
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.memory.agentId === "a1")).toBe(true);
  });

  it("drops invalidated memories from search", async () => {
    const index = new MemoryIndex(new FakeEmbedder());
    const m = await index.upsert({
      id: "stale",
      agentId: "a1",
      content: "momentum always works in semiconductors",
      updatedAtTick: 5,
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bull"],
        eventTypes: [],
        assets: ["SEMI"],
      },
    });
    index.invalidate("a1", m.id);

    const hits = await index.search({
      agentId: "a1",
      query: "semiconductor momentum",
      ctx: { tick: 50, sectors: ["Semiconductors"], regimeEstimate: "bear" },
    });
    expect(hits).toHaveLength(0);
  });

  it("consolidates a trade experience into a searchable memory", async () => {
    const engine = new MarketEngine({ seed: 11 });
    engine.registerAgent("a1");
    const obs = engine.observe();
    const fill = engine.submitOrder({
      agentId: "a1",
      symbol: "SEMI",
      side: "buy",
      quantity: 5,
    });
    expect(fill.status).toBe("filled");

    const store = new ExperienceStore();
    const exp = recordTradeExperience({
      store,
      agentId: "a1",
      simulationId: "sim-11",
      tick: obs.tick,
      market: marketContextFromObservation(obs),
      decision: {
        reasoning: "momentum in semis after ai news",
        strategy: "momentum",
        memoryReferences: [],
        orders: [{ symbol: "SEMI", side: "buy", quantity: 5 }],
      },
      results: [fill],
      sectorOf: new Map([["SEMI", "Semiconductors"]]),
    });

    const index = new MemoryIndex(new FakeEmbedder());
    const mem = await consolidateExperienceToMemory({ index, experience: exp });
    expect(mem.content).toContain("momentum");

    const hits = await index.search({
      agentId: "a1",
      query: "semiconductor momentum ai",
      ctx: {
        tick: obs.tick + 1,
        sectors: ["Semiconductors"],
        regimeEstimate: obs.regime,
      },
    });
    expect(hits.some((h) => h.memory.id === mem.id)).toBe(true);
  });
});
