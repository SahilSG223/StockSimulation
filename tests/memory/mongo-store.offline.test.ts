import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { MongoExperienceStore } from "../../src/memory/experiences/mongo-store.js";
import { MongoMemoryRepository } from "../../src/memory/memories/mongo-memory-repository.js";
import type { CreateExperienceInput } from "../../src/memory/experiences/types.js";
import type { MemoryDoc } from "../../src/memory/memories/memory-doc-schema.js";

function baseExperience(
  overrides: Partial<CreateExperienceInput> & Pick<CreateExperienceInput, "agentId" | "tick">,
): CreateExperienceInput {
  return {
    simulationId: "sim-offline",
    market: { regime: "bull", prices: { SEMI: 80 }, eventIds: [], eventTypes: [] },
    decision: { reasoning: "test", memoryReferences: [], orders: [] },
    outcome: { fills: [], rejections: [], cashDelta: 0, summary: "noop" },
    scope: { symbols: ["SEMI"], sectors: ["Semiconductors"], regimes: ["bull"], eventTypes: [] },
    ...overrides,
  };
}

function baseMemory(overrides: Partial<MemoryDoc> & Pick<MemoryDoc, "agentId">): MemoryDoc {
  return {
    type: "semantic",
    content: "test lesson",
    sourceExperienceIds: [],
    createdAtTick: 1,
    updatedAtTick: 1,
    confidence: 0.5,
    reliability: 0.5,
    scope: { sectors: [], regimes: [], eventTypes: [], assets: [] },
    status: "active",
    version: 1,
    ...overrides,
  };
}

describe("MongoExperienceStore (offline mocks)", () => {
  it("create inserts string _id matching record.id and always queries with agentId", async () => {
    const insertOne = vi.fn(async () => ({ acknowledged: true, insertedId: "x" }));
    const toArray = vi.fn(async () => []);
    const limit = vi.fn(() => ({ toArray }));
    const sort = vi.fn(() => ({ limit, toArray }));
    const find = vi.fn(() => ({ sort, toArray, limit }));
    const collection = {
      insertOne,
      findOne: vi.fn(),
      find,
    };
    const db = { collection: vi.fn(() => collection) } as unknown as Db;
    const store = new MongoExperienceStore(db);

    const created = await store.create(baseExperience({ agentId: "a1", tick: 3, id: "exp-1" }));
    expect(created.id).toBe("exp-1");
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "exp-1", id: "exp-1", agentId: "a1" }),
    );

    await store.listForAgent("a1");
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1" }));
  });
});

describe("MongoMemoryRepository (offline mocks)", () => {
  it("insert assigns a string _id and parses with zod", async () => {
    const insertOne = vi.fn(async () => ({ acknowledged: true, insertedId: "ignored" }));
    const collection = {
      insertOne,
      find: vi.fn(),
      updateOne: vi.fn(),
    };
    const db = { collection: vi.fn(() => collection) } as unknown as Db;
    const repo = new MongoMemoryRepository(db);

    const saved = await repo.insert(baseMemory({ agentId: "a1", _id: "mem-1" }));
    expect(saved._id).toBe("mem-1");
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "mem-1", agentId: "a1" }));
  });

  it("updateForAgent filters by agentId+_id and throws when nothing matches", async () => {
    const updateOne = vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 }));
    const collection = {
      insertOne: vi.fn(),
      find: vi.fn(),
      updateOne,
    };
    const db = { collection: vi.fn(() => collection) } as unknown as Db;
    const repo = new MongoMemoryRepository(db);

    await expect(
      repo.updateForAgent("wrong-agent", "mem-1", { content: "hijack" }),
    ).rejects.toThrow(/no memory/);

    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "mem-1", agentId: "wrong-agent" }),
      expect.objectContaining({ $set: { content: "hijack" } }),
    );
  });

  it("listActiveForAgent queries agentId + status active", async () => {
    const toArray = vi.fn(async () => []);
    const find = vi.fn(() => ({ toArray }));
    const collection = { insertOne: vi.fn(), find, updateOne: vi.fn() };
    const db = { collection: vi.fn(() => collection) } as unknown as Db;
    const repo = new MongoMemoryRepository(db);

    await repo.listActiveForAgent("a1");
    expect(find).toHaveBeenCalledWith({ agentId: "a1", status: "active" });
  });
});
