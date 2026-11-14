import { describe, expect, it, vi } from "vitest";
import {
  AgentRuntime,
  retrieveForDecision,
  type DecisionContext,
} from "../../src/agents/index.js";
import { FakeEmbedder, MemoryIndex } from "../../src/memory/embeddings/index.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";

describe("memory-influenced decisions (this-laptop bridge)", () => {
  it("changes order size when MemoryIndex lessons are retrieved and cited", async () => {
    const index = new MemoryIndex(new FakeEmbedder());
    const lesson = await index.upsert({
      agentId: "alice",
      content:
        "A similar TECH entry was rejected for insufficient cash. Prefer a smaller allocation next time.",
      updatedAtTick: 0,
      scope: {
        sectors: ["Technology"],
        regimes: [],
        eventTypes: [],
        assets: ["TECH"],
      },
    });

    async function runWithRetrieve(enabled: boolean) {
      const simulation = new MarketEngine({ seed: 42, initialCash: 10_000 });
      simulation.registerAgent("alice");
      const runtime = new AgentRuntime({
        agentId: "alice",
        simulation,
        ...(enabled
          ? {
              retrieveMemories: (ctx: Omit<DecisionContext, "memories">) =>
                retrieveForDecision({ index, agentId: "alice", ctx }),
            }
          : {}),
        decide: (ctx: DecisionContext) => {
          const memories = ctx.memories ?? [];
          const useMemory = memories.length > 0;
          return {
            orders: [{ symbol: "TECH", side: "buy", quantity: useMemory ? 1 : 5 }],
            reasoning: useMemory
              ? "Past cash rejection supports a smaller order."
              : "No past evidence supplied.",
            strategy: "momentum",
            confidence: 0.5,
            memoryReferences: useMemory ? [memories[0]!.id] : [],
          };
        },
      });
      return runtime.runCycle();
    }

    const withMemory = await runWithRetrieve(true);
    const withoutMemory = await runWithRetrieve(false);

    expect(withMemory.decision.orders[0]!.quantity).toBe(1);
    expect(withoutMemory.decision.orders[0]!.quantity).toBe(5);
    expect(withMemory.decision.memoryReferences).toEqual([lesson.id]);
    expect(withMemory.memories.some((m) => m.id === lesson.id)).toBe(true);
    expect(withoutMemory.memories).toEqual([]);
  });

  it("rejects hallucinated memory references before any engine submission", async () => {
    const index = new MemoryIndex(new FakeEmbedder());
    await index.upsert({
      agentId: "alice",
      content: "size down after cash rejection",
      updatedAtTick: 0,
    });
    const simulation = new MarketEngine({ seed: 42 });
    simulation.registerAgent("alice");
    const submit = vi.spyOn(simulation, "submitOrder");
    const before = simulation.getPortfolio("alice");

    const runtime = new AgentRuntime({
      agentId: "alice",
      simulation,
      retrieveMemories: (ctx) => retrieveForDecision({ index, agentId: "alice", ctx }),
      decide: () => ({
        orders: [{ symbol: "TECH", side: "buy", quantity: 1 }],
        reasoning: "cite a memory that was never retrieved",
        strategy: "momentum",
        confidence: 0.5,
        memoryReferences: ["not-retrieved"],
      }),
    });

    await expect(runtime.runCycle()).rejects.toThrow(/not retrieved/);
    expect(submit).not.toHaveBeenCalled();
    expect(simulation.getPortfolio("alice")).toEqual(before);
  });

  it("never surfaces another agent's memories through retrieveForDecision", async () => {
    const index = new MemoryIndex(new FakeEmbedder());
    await index.upsert({
      agentId: "bob",
      content: "buy TECH aggressively after rally",
      updatedAtTick: 0,
      reliability: 0.99,
    });
    await index.upsert({
      agentId: "alice",
      content: "caution on TECH after cash rejection",
      updatedAtTick: 0,
    });

    const simulation = new MarketEngine({ seed: 7 });
    simulation.registerAgent("alice");
    const runtime = new AgentRuntime({
      agentId: "alice",
      simulation,
      retrieveMemories: (ctx) => retrieveForDecision({ index, agentId: "alice", ctx, limit: 10 }),
      decide: (ctx) => {
        const memories = ctx.memories ?? [];
        return {
          orders: [],
          reasoning: "hold",
          strategy: "conservative",
          confidence: 0.1,
          memoryReferences: memories.map((m) => m.id),
        };
      },
    });

    const record = await runtime.runCycle();
    expect(record.memories.every((m) => m.agentId === "alice")).toBe(true);
    expect(record.memories.some((m) => m.content.includes("caution"))).toBe(true);
  });
});
