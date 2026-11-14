import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  rankWithEmbeddings,
  type EmbeddedMemory,
} from "../../src/memory/embeddings/index.js";

function unit(n: number, dim = 4): number[] {
  const v = Array.from({ length: dim }, () => 0);
  v[0] = n;
  return v;
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("rankWithEmbeddings", () => {
  const base: EmbeddedMemory = {
    id: "1",
    agentId: "a1",
    content: "buy semis in bull",
    embedding: unit(1),
    status: "active",
    reliability: 0.8,
    updatedAtTick: 10,
    scope: {
      sectors: ["Semiconductors"],
      regimes: ["bull"],
      eventTypes: [],
      assets: ["SEMI"],
    },
  };

  it("filters other agents and inactive memories", () => {
    const memories: EmbeddedMemory[] = [
      base,
      { ...base, id: "2", agentId: "other", embedding: unit(1) },
      { ...base, id: "3", status: "invalidated", embedding: unit(1) },
    ];
    const ranked = rankWithEmbeddings({
      memories,
      queryEmbedding: unit(1),
      ctx: { agentId: "a1", tick: 20, sectors: ["Semiconductors"], regimeEstimate: "bull" },
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.memory.id).toBe("1");
  });

  it("prefers higher cosine when context ties", () => {
    const close: EmbeddedMemory = { ...base, id: "close", embedding: unit(1) };
    const far: EmbeddedMemory = {
      ...base,
      id: "far",
      embedding: [0.1, 0.9, 0, 0],
      reliability: 0.95,
    };
    const ranked = rankWithEmbeddings({
      memories: [far, close],
      queryEmbedding: unit(1),
      ctx: { agentId: "a1", tick: 20 },
      weights: {
        semantic: 2,
        contextual: 0.1,
        temporal: 0.1,
        reliability: 0.1,
        lambda: 0.001,
      },
    });
    expect(ranked[0]?.memory.id).toBe("close");
  });
});
