import { describe, expect, it, vi } from "vitest";
import { createAgent } from "../../src/agents/create-agent.js";
import { memoryQuery } from "../../src/agents/memory-query.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { RetrievedMemory } from "../../src/memory/vector-schema.js";
import { observationSchema } from "../../src/agents/observation-schema.js";

const memory: RetrievedMemory = {
  id: "experience-1",
  agentId: "alice",
  simulationId: "previous",
  tick: 2,
  content:
    "A similar entry was rejected because cash was insufficient. Consider a smaller allocation.",
  embeddingModel: "embedding-test",
  decisionModel: "agent-test",
  contentVersion: "experience-v1",
  status: "active",
  symbols: ["TECH"],
  eventTypes: [],
  similarity: 0.9,
  contextualRelevance: 0.75,
  temporalRelevance: 0.5,
  rankingScore: 0.3375,
};

function setup(retrieved: RetrievedMemory[], references = ["experience-1"]) {
  const simulation = new MarketEngine({ seed: 42 });
  simulation.registerAgent("alice");
  const retrieveMemories = vi.fn().mockResolvedValue(retrieved);
  const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options!.body));
    const data = JSON.parse(body.messages[1].content);
    // Model stub changes its proposed size in response to the supplied memory.
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              orders: [{ symbol: "TECH", side: "buy", quantity: data.memories.length ? 1 : 5 }],
              reasoning: data.memories.length
                ? "Similar past cash rejection supports a smaller order."
                : "No past evidence supplied.",
              strategy: "momentum",
              confidence: 0.5,
              memoryReferences: data.memories.length ? references : [],
            }),
          },
        },
      ],
    });
  });
  const agent = createAgent({
    agentId: "alice",
    archetype: "momentum",
    simulation,
    env: { AGENT_MODEL: "test-model", OPENAI_API_KEY: "test" },
    fetch: request,
    retrieveMemories,
  });
  return { simulation, retrieveMemories, request, agent };
}

describe("memory-influenced decisions", () => {
  it("supplies retrieved experience as USER data, validates citations, and records changed behavior", async () => {
    const withMemory = setup([memory]);
    const withoutMemory = setup([]);
    const record = await withMemory.agent.runCycle();
    expect(record.decision.orders[0]!.quantity).toBe(1);
    expect((await withoutMemory.agent.runCycle()).decision.orders[0]!.quantity).toBe(5);
    expect(record.decision.memoryReferences).toEqual([memory.id]);
    expect(record.memories).toEqual([memory]);
    const body = JSON.parse(String(withMemory.request.mock.calls[0]![1]!.body));
    expect(body.messages[0].content).not.toContain(memory.content);
    expect(JSON.parse(body.messages[1].content).memories[0].content).toBe(memory.content);
  });

  it("rejects hallucinated memory references before engine submission", async () => {
    const { simulation, agent } = setup([memory], ["not-retrieved"]);
    const submit = vi.spyOn(simulation, "submitOrder");
    await expect(agent.runCycle()).rejects.toThrow("not retrieved");
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects another agent's memory before model generation", async () => {
    const { request, agent } = setup([{ ...memory, agentId: "bob" }]);
    await expect(agent.runCycle()).rejects.toThrow("does not belong");
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks orders on retrieval failure", async () => {
    const { simulation, retrieveMemories, agent } = setup([]);
    retrieveMemories.mockRejectedValue(new Error("retrieval unavailable"));
    const submit = vi.spyOn(simulation, "submitOrder");
    await expect(agent.runCycle()).rejects.toThrow("retrieval unavailable");
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps explicit deterministic baselines independent of memory retrieval", async () => {
    const simulation = new MarketEngine({ seed: 42 });
    simulation.registerAgent("alice");
    const retrieveMemories = vi.fn().mockResolvedValue([memory]);
    const agent = createAgent({
      agentId: "alice",
      archetype: "momentum",
      simulation,
      mode: "baseline",
      env: {},
      retrieveMemories,
    });
    expect((await agent.runCycle()).memories).toEqual([]);
    expect(retrieveMemories).not.toHaveBeenCalled();
  });

  it("rejects excessive memory context before model generation", async () => {
    const { agent, request } = setup(
      Array.from({ length: 6 }, (_, i) => ({ ...memory, id: `memory-${i}` })),
    );
    await expect(agent.runCycle()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("builds a query from direction and public context rather than raw price history", () => {
    const simulation = new MarketEngine({ seed: 42 });
    simulation.registerAgent("alice");
    const observation = {
      tick: 0,
      prices: { TECH: 123.456 },
      events: [],
      portfolio: simulation.getPortfolio("alice"),
    };
    const query = memoryQuery(
      { observation: observationSchema.parse(observation) },
      "sim-1",
      "momentum",
    );
    expect(query.content).toContain("no prior observation");
    expect(query.content).not.toContain("123.456");
    expect(query.agentId).toBe("alice");
  });
});
