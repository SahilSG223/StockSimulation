import { describe, expect, it } from "vitest";
import {
  toEmbeddedMemory,
  toMemoryDoc,
} from "../../src/memory/embeddings/embedded-memory-mapper.js";
import type { EmbeddedMemory } from "../../src/memory/embeddings/types.js";

const embedded: EmbeddedMemory = {
  id: "mem-1",
  agentId: "a1",
  content: "buy semis in bull",
  embedding: [0.1, 0.2, 0.3],
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

describe("embedded-memory-mapper", () => {
  it("round-trips EmbeddedMemory ↔ MemoryDoc", () => {
    const doc = toMemoryDoc(embedded, { confidence: 0.7, version: 2 });
    expect(doc._id).toBe("mem-1");
    expect(doc.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(toEmbeddedMemory(doc)).toEqual(embedded);
  });

  it("rejects docs without embedding or _id", () => {
    const doc = toMemoryDoc(embedded);
    expect(() => toEmbeddedMemory({ ...doc, embedding: undefined })).toThrow(/embedding/);
    expect(() => toEmbeddedMemory({ ...doc, _id: undefined })).toThrow(/_id/);
  });
});
