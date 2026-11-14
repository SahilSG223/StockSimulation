/** Acceptance tests for the second-laptop MongoMemoryIndex implementation. */
import type { Db } from "mongodb";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "../../src/database/client.js";
import {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "../../src/memory/experiences/index.js";
import {
  FakeEmbedder,
  MongoMemoryIndex,
  consolidateExperienceToMemory,
} from "../../src/memory/embeddings/index.js";
import { MarketEngine } from "../../src/simulation/index.js";

const live = process.env.RUN_MONGO_TESTS === "1" && Boolean(process.env.MONGODB_URI);

type FakeDoc = Record<string, unknown> & { _id?: string };

/** Minimal in-memory stand-in for the Mongo methods MongoMemoryRepository calls. */
function createFakeDb(): Db {
  const docs: FakeDoc[] = [];
  const matches = (doc: FakeDoc, filter: FakeDoc) =>
    Object.entries(filter).every(([k, v]) => doc[k] === v);

  const collection = {
    async insertOne(doc: FakeDoc) {
      docs.push({ ...doc });
      return { insertedId: doc._id };
    },
    find(filter: FakeDoc) {
      return { toArray: async () => docs.filter((d) => matches(d, filter)).map((d) => ({ ...d })) };
    },
    async findOne(filter: FakeDoc) {
      return docs.find((d) => matches(d, filter)) ?? null;
    },
    async updateOne(filter: FakeDoc, update: { $set: FakeDoc }) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  return { collection: () => collection } as unknown as Db;
}

describe("MongoMemoryIndex (offline)", () => {
  it("upsert writes a MemoryDoc with string _id, agentId, and embedding", async () => {
    const index = new MongoMemoryIndex(createFakeDb(), new FakeEmbedder());
    const record = await index.upsert({
      agentId: "a1",
      content: "buy semis in bull",
      updatedAtTick: 1,
    });

    expect(typeof record.id).toBe("string");
    expect(record.agentId).toBe("a1");
    expect(record.embedding.length).toBeGreaterThan(0);

    const fetched = await index.get("a1", record.id);
    expect(fetched?.content).toBe("buy semis in bull");
  });

  it("get / invalidate always include agentId in the Mongo filter", async () => {
    const index = new MongoMemoryIndex(createFakeDb(), new FakeEmbedder());
    const record = await index.upsert({ agentId: "a1", content: "x", updatedAtTick: 1 });

    await expect(index.get("a2", record.id)).resolves.toBeUndefined();
    await expect(index.invalidate("a2", record.id)).rejects.toThrow(/no memory/);

    const stillActive = await index.get("a1", record.id);
    expect(stillActive?.status).toBe("active");

    const invalidated = await index.invalidate("a1", record.id);
    expect(invalidated?.status).toBe("invalidated");
  });

  it("search filters agentId+active in Mongo before rankWithEmbeddings", async () => {
    const index = new MongoMemoryIndex(createFakeDb(), new FakeEmbedder());
    const record = await index.upsert({
      agentId: "a1",
      content: "buy semis in bull",
      updatedAtTick: 1,
    });
    await index.invalidate("a1", record.id);

    const results = await index.search({ agentId: "a1", query: "buy semis in bull", ctx: { tick: 5 } });
    expect(results).toHaveLength(0);
  });

  it("search never returns another agent's memories even if vectors are closer", async () => {
    const index = new MongoMemoryIndex(createFakeDb(), new FakeEmbedder());
    await index.upsert({ agentId: "a1", content: "bear market caution", updatedAtTick: 1 });
    await index.upsert({ agentId: "other", content: "buy semis in bull", updatedAtTick: 1 });

    const results = await index.search({
      agentId: "a1",
      query: "buy semis in bull",
      ctx: { tick: 5 },
    });

    expect(results.every((r) => r.memory.agentId === "a1")).toBe(true);
  });
});

describe.skipIf(!live)("MongoMemoryIndex (live Atlas)", () => {
  const agentId = `mongo-index-test-${Date.now()}`;

  afterAll(async () => {
    const db = await getDb();
    await db.collection("memories").deleteMany({ agentId });
  });

  it("consolidateExperience -> search round-trip", async () => {
    const db = await getDb();
    const index = new MongoMemoryIndex(db, new FakeEmbedder());

    const engine = new MarketEngine({ seed: 11 });
    engine.registerAgent(agentId);
    const obs = engine.observe();
    const fill = engine.submitOrder({ agentId, symbol: "SEMI", side: "buy", quantity: 5 });

    const store = new ExperienceStore();
    const exp = recordTradeExperience({
      store,
      agentId,
      simulationId: "sim-mongo-index-test",
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

    const mem = await consolidateExperienceToMemory({ index, experience: exp });
    const results = await index.search({
      agentId,
      query: "semiconductor momentum ai",
      ctx: { tick: obs.tick + 1, sectors: ["Semiconductors"], regimeEstimate: obs.regime },
    });

    expect(results.some((r) => r.memory.id === mem.id)).toBe(true);
  });
});
