import { afterEach, describe, expect, it, vi } from "vitest";
import { MongoClient, MongoServerError, ObjectId } from "mongodb";
import { MongoExperienceStore } from "../../src/memory/experiences/mongo-store.js";
import { connectMongoMemory } from "../../src/memory/connect.js";
import { recordTradeExperience } from "../../src/memory/experiences/recorder.js";
import type { ExperienceRecord } from "../../src/memory/experiences/types.js";

function record(id = "exp-1", tick = 1): ExperienceRecord {
  return {
    id,
    tick,
    createdAtTick: tick,
    agentId: "alice",
    simulationId: "sim-1",
    market: { regime: "", prices: { TECH: 100 }, eventIds: [], eventTypes: [] },
    decision: { reasoning: "hold", memoryReferences: [], orders: [] },
    outcome: { fills: [], rejections: [], cashDelta: 0, summary: "no fills" },
    scope: { symbols: ["TECH"], sectors: ["Technology"], regimes: [], eventTypes: [] },
  };
}

function setup() {
  const client = new MongoClient("mongodb://localhost:27017");
  const collection = client.db("test").collection<ExperienceRecord>("experiences");
  const cursor = collection.find({});
  const sort = vi.spyOn(cursor, "sort").mockReturnThis();
  const limit = vi.spyOn(cursor, "limit").mockReturnThis();
  const toArray = vi.spyOn(cursor, "toArray").mockResolvedValue([]);
  const find = vi.spyOn(collection, "find").mockReturnValue(cursor);
  const insert = vi
    .spyOn(collection, "insertOne")
    .mockResolvedValue({ acknowledged: true, insertedId: new ObjectId() });
  const index = vi.spyOn(collection, "createIndex").mockResolvedValue("test-index");
  return {
    client,
    collection,
    store: new MongoExperienceStore(collection),
    sort,
    limit,
    toArray,
    find,
    insert,
    index,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("MongoExperienceStore", () => {
  it("validates writes, preserves optional absence, and creates unique and scoped indexes", async () => {
    const { store, insert, index } = setup();
    await store.initialize();
    expect(index).toHaveBeenCalledWith({ id: 1 }, { unique: true });
    expect(index).toHaveBeenCalledWith({ agentId: 1, simulationId: 1, tick: -1, id: -1 });
    expect(await store.create(record())).toEqual(record());
    expect(insert).toHaveBeenCalledWith(record());
    await expect(store.create({ ...record(), agentId: "" })).rejects.toThrow();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("includes ownership and all requested filters in the database query", async () => {
    const { store, find, sort, limit, toArray } = setup();
    toArray.mockResolvedValue([
      { ...record("new", 5), _id: new ObjectId() },
      { ...record("old", 2), _id: new ObjectId() },
    ]);
    const result = await store.query({
      agentId: "alice",
      simulationId: "sim-1",
      fromTick: 2,
      toTick: 5,
      symbols: ["TECH"],
      sectors: ["Technology"],
      regimes: ["bull"],
      eventTypes: ["news"],
      limit: 2,
    });
    expect(find).toHaveBeenCalledWith({
      agentId: "alice",
      simulationId: "sim-1",
      tick: { $gte: 2, $lte: 5 },
      "scope.symbols": { $in: ["TECH"] },
      "scope.sectors": { $in: ["Technology"] },
      "scope.regimes": { $in: ["bull"] },
      "scope.eventTypes": { $in: ["news"] },
    });
    expect(sort).toHaveBeenCalledWith({ tick: -1, id: -1 });
    expect(limit).toHaveBeenCalledWith(2);
    expect(result.map((r) => r.id)).toEqual(["old", "new"]);
    expect(result[0]).not.toHaveProperty("_id");
  });

  it("scopes direct id lookups and preserves requested id order", async () => {
    const { store, find, toArray } = setup();
    toArray.mockResolvedValue([
      { ...record("first"), _id: new ObjectId() },
      { ...record("second"), _id: new ObjectId() },
    ]);
    expect((await store.getMany(["second", "missing", "first"], "alice")).map((r) => r.id)).toEqual(
      ["second", "first"],
    );
    expect(find).toHaveBeenCalledWith({
      agentId: "alice",
      id: { $in: ["second", "missing", "first"] },
    });
    toArray.mockResolvedValue([]);
    expect(await store.get("private-id", "bob")).toBeUndefined();
    expect(find).toHaveBeenLastCalledWith({ agentId: "bob", id: { $in: ["private-id"] } });
  });

  it("rejects invalid query input and handles zero limits without an unbounded Mongo read", async () => {
    const { store, find } = setup();
    await expect(store.query({ agentId: "" })).rejects.toThrow();
    await expect(store.query({ agentId: "alice", limit: -1 })).rejects.toThrow();
    await expect(store.query({ agentId: "alice", fromTick: 5, toTick: 2 })).rejects.toThrow();
    expect(await store.query({ agentId: "alice", limit: 0 })).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it("surfaces malformed persisted data instead of returning it", async () => {
    const { store, toArray } = setup();
    toArray.mockResolvedValue([{ ...record(), tick: -1, _id: new ObjectId() }]);
    await expect(store.listForAgent("alice")).rejects.toThrow();
  });

  it("surfaces duplicate ids and sanitizes driver errors", async () => {
    const { store, insert, toArray } = setup();
    insert.mockRejectedValue(new MongoServerError({ message: "sensitive", code: 11000 }));
    await expect(store.create(record())).rejects.toThrow("Experience already exists");
    insert.mockRejectedValue(new Error("sensitive URI"));
    await expect(store.create(record())).rejects.toThrow("MongoDB experience write failed");
    toArray.mockRejectedValue(new Error("sensitive URI"));
    await expect(store.query({ agentId: "alice" })).rejects.toThrow(
      "MongoDB experience query failed",
    );
  });

  it("awaits Mongo persistence when recording authoritative engine results", async () => {
    const { store, insert } = setup();
    const saved = await recordTradeExperience({
      store,
      agentId: "alice",
      simulationId: "sim-1",
      tick: 1,
      market: record().market,
      decision: { ...record().decision, orders: [{ symbol: "TECH", side: "buy", quantity: 2 }] },
      results: [
        {
          status: "filled",
          tick: 1,
          order: { agentId: "alice", symbol: "TECH", side: "buy", quantity: 2 },
          fillPrice: 100,
          notional: 200,
          fee: 1,
        },
      ],
    });
    expect(saved.outcome.cashDelta).toBe(-201);
    expect(saved.outcome.fills).toHaveLength(1);
    expect(insert).toHaveBeenCalledTimes(1);
    insert.mockRejectedValue(new Error("write failed"));
    await expect(
      recordTradeExperience({
        store,
        agentId: "alice",
        simulationId: "sim-1",
        tick: 2,
        market: record().market,
        decision: record().decision,
        results: [],
      }),
    ).rejects.toThrow("MongoDB experience write failed");
  });
});

describe("Mongo memory connection", () => {
  it("requires a URI without attempting a connection", async () => {
    await expect(connectMongoMemory({})).rejects.toThrow("MONGODB_URI is required");
  });

  it("connects to the configured database and closes the owned client", async () => {
    const client = new MongoClient("mongodb://localhost:27017");
    const db = client.db("configured-db");
    const collection = db.collection("experiences");
    const index = vi.spyOn(collection, "createIndex").mockResolvedValue("test-index");
    vi.spyOn(db, "collection").mockReturnValue(collection);
    const selectDb = vi.spyOn(MongoClient.prototype, "db").mockReturnValue(db);
    vi.spyOn(MongoClient.prototype, "connect").mockResolvedValue(client);
    const close = vi.spyOn(MongoClient.prototype, "close").mockResolvedValue();
    const memory = await connectMongoMemory({
      MONGODB_URI: "mongodb://localhost:27017",
      MONGODB_DB_NAME: "configured-db",
    });
    expect(selectDb).toHaveBeenCalledWith("configured-db");
    expect(index).toHaveBeenCalledTimes(3);
    await memory.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes on connection failure and does not expose the URI", async () => {
    vi.spyOn(MongoClient.prototype, "connect").mockRejectedValue(new Error("sensitive URI"));
    const close = vi.spyOn(MongoClient.prototype, "close").mockResolvedValue();
    await expect(connectMongoMemory({ MONGODB_URI: "mongodb://localhost:27017" })).rejects.toThrow(
      "MongoDB memory connection failed; check URI, credentials, network access, and index permissions",
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
