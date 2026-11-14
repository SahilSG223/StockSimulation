import { describe, expect, it } from "vitest";
import {
  handleContradiction,
  isRetrievable,
  rankMemories,
  type MemoryRecord,
} from "../../src/memory/governance/index.js";

function mem(partial: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "content">): MemoryRecord {
  return {
    agentId: "a1",
    type: "semantic",
    sourceExperienceIds: [],
    createdAtTick: 0,
    updatedAtTick: 0,
    confidence: 0.8,
    reliability: 0.8,
    scope: {
      sectors: ["semiconductors"],
      regimes: ["bull"],
      eventTypes: [],
      assets: ["SEMI"],
    },
    status: "active",
    version: 1,
    ...partial,
  };
}

describe("memory governance ranking", () => {
  it("filters other agents and non-active memories", () => {
    const memories = [
      mem({ id: "1", content: "momentum works in semiconductors bull" }),
      mem({ id: "2", content: "momentum works", agentId: "other" }),
      mem({ id: "3", content: "momentum works", status: "invalidated" }),
    ];
    const ranked = rankMemories({
      memories,
      query: "semiconductor momentum",
      ctx: { agentId: "a1", tick: 10, sectors: ["semiconductors"], regimeEstimate: "bull" },
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.memory.id).toBe("1");
  });

  it("deprioritizes regime mismatch via contextual score", () => {
    const bull = mem({
      id: "bull",
      content: "buy semiconductors on ai news",
      scope: {
        sectors: ["semiconductors"],
        regimes: ["bull"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
    });
    const bear = mem({
      id: "bear",
      content: "buy semiconductors on ai news",
      scope: {
        sectors: ["semiconductors"],
        regimes: ["bear"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
      reliability: 0.9,
    });
    const ranked = rankMemories({
      memories: [bull, bear],
      query: "ai semiconductors",
      ctx: {
        agentId: "a1",
        tick: 5,
        sectors: ["semiconductors"],
        regimeEstimate: "bear",
        eventTypes: ["positive_ai_demand"],
      },
    });
    expect(ranked[0]?.memory.id).toBe("bear");
  });
});

describe("contradiction handling", () => {
  it("invalidates when contradiction is in the same regime", () => {
    const m = mem({ id: "1", content: "lesson" });
    const result = handleContradiction({
      memory: m,
      newRegime: "bull",
      atTick: 20,
      reason: "repeated losses after ai news",
    });
    expect(result.action).toBe("invalidate");
    expect(isRetrievable(result.memory)).toBe(false);
  });

  it("narrows scope when regime differs", () => {
    const m = mem({
      id: "1",
      content: "lesson",
      scope: {
        sectors: ["semiconductors"],
        regimes: ["bull", "low_vol"],
        eventTypes: [],
        assets: [],
      },
    });
    const result = handleContradiction({
      memory: m,
      newRegime: "bear",
      atTick: 20,
      reason: "failed under bear",
    });
    expect(result.action).toBe("narrow_scope");
    expect(result.memory.scope.regimes).toEqual(["bull", "low_vol"]);
    expect(result.memory.reliability).toBeLessThan(m.reliability);
  });
});
