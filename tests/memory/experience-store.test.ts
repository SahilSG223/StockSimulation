import { describe, expect, it } from "vitest";
import { ExperienceStore } from "../../src/memory/experiences/index.js";
import type { CreateExperienceInput } from "../../src/memory/experiences/index.js";

function baseInput(
  overrides: Partial<CreateExperienceInput> & Pick<CreateExperienceInput, "agentId" | "tick">,
): CreateExperienceInput {
  return {
    simulationId: "sim-1",
    market: {
      regime: "bull",
      prices: { SEMI: 80 },
      eventIds: [],
      eventTypes: [],
    },
    decision: {
      reasoning: "test",
      memoryReferences: [],
      orders: [{ symbol: "SEMI", side: "buy", quantity: 1 }],
    },
    outcome: {
      fills: [],
      rejections: [],
      cashDelta: 0,
      summary: "noop",
    },
    scope: {
      symbols: ["SEMI"],
      sectors: ["Semiconductors"],
      regimes: ["bull"],
      eventTypes: [],
    },
    ...overrides,
  };
}

describe("ExperienceStore", () => {
  it("isolates experiences by agentId", () => {
    const store = new ExperienceStore();
    store.create(baseInput({ agentId: "a1", tick: 1 }));
    store.create(
      baseInput({
        agentId: "a2",
        tick: 1,
        scope: {
          symbols: ["TECH"],
          sectors: ["Technology"],
          regimes: ["bull"],
          eventTypes: [],
        },
      }),
    );

    expect(store.listForAgent("a1")).toHaveLength(1);
    expect(store.listForAgent("a1")[0]?.agentId).toBe("a1");
    expect(store.listForAgent("a2")).toHaveLength(1);
    expect(store.listForAgent("missing")).toHaveLength(0);
  });

  it("filters by simulation, tick range, and scope", () => {
    const store = new ExperienceStore();
    store.create(baseInput({ agentId: "a1", tick: 1, simulationId: "sim-1" }));
    store.create(
      baseInput({
        agentId: "a1",
        tick: 5,
        simulationId: "sim-1",
        scope: {
          symbols: ["TECH"],
          sectors: ["Technology"],
          regimes: ["bear"],
          eventTypes: ["rate_hike"],
        },
        market: {
          regime: "bear",
          prices: { TECH: 100 },
          eventIds: ["e1"],
          eventTypes: ["rate_hike"],
        },
      }),
    );
    store.create(baseInput({ agentId: "a1", tick: 3, simulationId: "sim-2" }));

    expect(store.listForAgentInSimulation("a1", "sim-1")).toHaveLength(2);
    expect(store.query({ agentId: "a1", fromTick: 4 })).toHaveLength(1);
    expect(store.query({ agentId: "a1", symbols: ["TECH"] })[0]?.tick).toBe(5);
    expect(store.query({ agentId: "a1", regimes: ["bear"] })).toHaveLength(1);
    expect(store.query({ agentId: "a1", eventTypes: ["rate_hike"] })).toHaveLength(1);
    expect(store.query({ agentId: "a1", simulationId: "sim-1", limit: 1 })).toHaveLength(1);
  });

  it("getMany returns only known ids in request order of hits", () => {
    const store = new ExperienceStore();
    const a = store.create(baseInput({ agentId: "a1", tick: 1, id: "exp-a" }));
    const b = store.create(baseInput({ agentId: "a1", tick: 2, id: "exp-b" }));
    expect(store.getMany(["exp-b", "missing", "exp-a"], "a1").map((e) => e.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it("get / getMany never return another agent's experience", () => {
    const store = new ExperienceStore();
    store.create(baseInput({ agentId: "a1", tick: 1, id: "private" }));
    expect(store.get("private", "a1")?.id).toBe("private");
    expect(store.get("private", "a2")).toBeUndefined();
    expect(store.getMany(["private"], "a2")).toEqual([]);
  });
});
