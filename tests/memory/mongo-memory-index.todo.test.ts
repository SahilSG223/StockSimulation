/**
 * Acceptance criteria for second-laptop MongoMemoryIndex implementation.
 * Flip `it.todo` → real tests (prefer offline mocks + optional RUN_MONGO_TESTS=1).
 */
import { describe, expect, it } from "vitest";
import { MongoMemoryIndex } from "../../src/memory/embeddings/mongo-memory-index.js";
import { FakeEmbedder } from "../../src/memory/embeddings/fake-embedder.js";
import type { Db } from "mongodb";

describe("MongoMemoryIndex (second laptop)", () => {
  it("stub rejects until implemented", async () => {
    const index = new MongoMemoryIndex({} as Db, new FakeEmbedder());
    await expect(
      index.upsert({ agentId: "a1", content: "x", updatedAtTick: 1 }),
    ).rejects.toThrow(/not implemented/);
  });

  it.todo("upsert writes MemoryDoc with string _id, agentId, and embedding");
  it.todo("get / invalidate always include agentId in the Mongo filter");
  it.todo("search filters agentId+active in Mongo before rankWithEmbeddings");
  it.todo("search never returns another agent's memories even if vectors are closer");
  it.todo("live Atlas: consolidateExperience → MongoMemoryIndex.search round-trip");
});
