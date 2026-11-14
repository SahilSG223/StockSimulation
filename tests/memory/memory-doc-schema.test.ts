import { describe, expect, it } from "vitest";
import { memoryDocSchema } from "../../src/memory/memories/memory-doc-schema.js";

function validDoc(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "a1",
    type: "semantic",
    content: "buy semis in bull",
    sourceExperienceIds: ["e1"],
    createdAtTick: 1,
    updatedAtTick: 2,
    confidence: 0.6,
    reliability: 0.7,
    scope: { sectors: ["Semiconductors"], regimes: ["bull"], eventTypes: [], assets: ["SEMI"] },
    status: "active",
    version: 1,
    ...overrides,
  };
}

describe("memoryDocSchema", () => {
  it("accepts a well-formed memory doc", () => {
    const parsed = memoryDocSchema.parse(validDoc({ _id: "mem-1" }));
    expect(parsed._id).toBe("mem-1");
    expect(parsed.agentId).toBe("a1");
  });

  it("rejects empty agentId and content", () => {
    expect(() => memoryDocSchema.parse(validDoc({ agentId: "  " }))).toThrow();
    expect(() => memoryDocSchema.parse(validDoc({ content: "" }))).toThrow();
  });

  it("rejects confidence / reliability outside [0,1]", () => {
    expect(() => memoryDocSchema.parse(validDoc({ confidence: 1.5 }))).toThrow();
    expect(() => memoryDocSchema.parse(validDoc({ reliability: -0.1 }))).toThrow();
  });

  it("rejects unknown top-level keys (strict)", () => {
    expect(() => memoryDocSchema.parse(validDoc({ extra: true }))).toThrow();
  });
});
