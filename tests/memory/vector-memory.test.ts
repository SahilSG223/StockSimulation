import { afterEach, describe, expect, it, vi } from "vitest";
import { Collection, MongoClient, ObjectId } from "mongodb";
import { createEmbeddingProvider, type EmbeddingProvider } from "../../src/memory/embedding.js";
import { MongoVectorMemory, experienceContent } from "../../src/memory/vector-memory.js";
import type { ExperienceRecord } from "../../src/memory/experiences/types.js";

const query = {
  agentId: "alice",
  simulationId: "current",
  tick: 10,
  content: "TECH rising after demand news",
  symbols: ["TECH"],
  eventTypes: ["news"],
};
const candidate = {
  id: "past",
  agentId: "alice",
  simulationId: "current",
  tick: 1,
  content: "Previous entry after demand news; order filled, subsequent return unknown.",
  embeddingModel: "test-embedding",
  decisionModel: "test-agent",
  contentVersion: "experience-v1",
  status: "active",
  symbols: ["TECH"],
  eventTypes: ["news"],
  similarity: 0.9,
};
const experience: ExperienceRecord = {
  id: "past",
  agentId: "alice",
  simulationId: "previous",
  tick: 1,
  createdAtTick: 1,
  market: { regime: "", prices: { TECH: 123.456 }, eventIds: [], eventTypes: ["news"] },
  decision: {
    reasoning: "Demand news supports a modest entry",
    strategy: "momentum",
    memoryReferences: [],
    orders: [{ symbol: "TECH", side: "buy", quantity: 1 }],
  },
  outcome: { fills: [], rejections: [], cashDelta: 0, summary: "no fills" },
  scope: { symbols: ["TECH"], sectors: ["Technology"], regimes: [], eventTypes: ["news"] },
};

function setup() {
  const db = new MongoClient("mongodb://localhost:27017").db("test");
  const collection = db.collection("test");
  const indexes = collection.listSearchIndexes();
  const ready = { name: "experience_similarity", queryable: true };
  const indexRows = vi.spyOn(indexes, "toArray").mockResolvedValue([ready]);
  vi.spyOn(Collection.prototype, "listSearchIndexes").mockReturnValue(indexes);
  vi.spyOn(Collection.prototype, "createIndex").mockResolvedValue("unique");
  const createIndex = vi
    .spyOn(Collection.prototype, "createSearchIndex")
    .mockResolvedValue("experience_similarity");
  const findOne = vi.spyOn(Collection.prototype, "findOne").mockResolvedValue(null);
  const upsert = vi
    .spyOn(Collection.prototype, "updateOne")
    .mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
      upsertedId: new ObjectId(),
    });
  const cursor = collection.aggregate([]);
  const rows = vi.spyOn(cursor, "toArray").mockResolvedValue([]);
  const aggregate = vi.spyOn(Collection.prototype, "aggregate").mockReturnValue(cursor);
  const embed = vi.fn<EmbeddingProvider["embed"]>().mockResolvedValue([1, 0, 0]);
  return {
    db,
    embeddings: { model: "test-embedding", embed },
    embed,
    rows,
    aggregate,
    upsert,
    findOne,
    indexRows,
    createIndex,
    ready,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("OpenAI embeddings", () => {
  it("uses EMBEDDING_MODEL rather than AGENT_MODEL and validates the vector", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [0.2, 0.8] }] }));
    const provider = createEmbeddingProvider(
      {
        EMBEDDING_MODEL: "embedding-choice",
        AGENT_MODEL: "decision-choice",
        OPENAI_API_KEY: "test",
      },
      request,
    );
    expect(await provider.embed("Experience narrative")).toEqual([0.2, 0.8]);
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual({
      model: "embedding-choice",
      input: "Experience narrative",
      encoding_format: "float",
    });
    request.mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [0, 0] }] }));
    await expect(provider.embed("Experience")).rejects.toThrow("invalid vector data");
  });

  it("requires configuration and sanitizes provider failures", async () => {
    expect(() => createEmbeddingProvider({})).toThrow("EMBEDDING_MODEL");
    expect(() => createEmbeddingProvider({ EMBEDDING_MODEL: "model" })).toThrow("OPENAI_API_KEY");
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive body", { status: 401 }));
    const provider = createEmbeddingProvider(
      { EMBEDDING_MODEL: "model", OPENAI_API_KEY: "test" },
      request,
    );
    await expect(provider.embed("experience")).rejects.toThrow(
      "Embedding request failed (HTTP 401)",
    );
    await expect(provider.embed("")).rejects.toThrow("empty text");
  });
});

describe("MongoDB vector memory", () => {
  it("creates a cosine index with ownership and lifecycle filter fields", async () => {
    const { db, embeddings, indexRows, ready, createIndex } = setup();
    indexRows.mockResolvedValueOnce([]).mockResolvedValue([ready]);
    await MongoVectorMemory.open(db, embeddings);
    expect(createIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "vectorSearch",
        definition: {
          fields: expect.arrayContaining([
            { type: "vector", path: "embedding", numDimensions: 3, similarity: "cosine" },
            { type: "filter", path: "agentId" },
            { type: "filter", path: "status" },
            { type: "filter", path: "embeddingModel" },
          ]),
        },
      }),
    );
  });

  it("embeds experience narratives without raw price records and makes backfill idempotent", async () => {
    const { db, embeddings, embed, upsert, findOne } = setup();
    const memory = await MongoVectorMemory.open(db, embeddings);
    await memory.remember(experience, "decision-model");
    expect(experienceContent(experience)).toContain(experience.decision.reasoning);
    expect(experienceContent(experience)).not.toContain("123.456");
    expect(upsert).toHaveBeenCalledWith(
      { agentId: "alice", id: "past" },
      {
        $setOnInsert: expect.objectContaining({
          embedding: [1, 0, 0],
          embeddingModel: "test-embedding",
          decisionModel: "decision-model",
          status: "active",
        }),
      },
      { upsert: true },
    );
    findOne.mockResolvedValue({ _id: new ObjectId() });
    await memory.remember(experience, "decision-model");
    expect(embed).toHaveBeenCalledTimes(2); // Dimension probe plus first experience.
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("prefilters by owner, status, model, and past time before ranking by context and age", async () => {
    const { db, embeddings, rows, aggregate } = setup();
    const memory = await MongoVectorMemory.open(db, embeddings);
    rows.mockResolvedValue([
      { ...candidate, id: "unrelated", symbols: ["OTHER"], eventTypes: [], similarity: 0.99 },
      { ...candidate, id: "relevant" },
    ]);
    const matches = await memory.retrieve(query);
    expect(matches.map((match) => match.id)).toEqual(["relevant", "unrelated"]);
    expect(aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          $vectorSearch: expect.objectContaining({
            queryVector: [1, 0, 0],
            numCandidates: 400,
            limit: 20,
            filter: {
              agentId: "alice",
              status: "active",
              embeddingModel: "test-embedding",
              contentVersion: "experience-v1",
              $or: [{ simulationId: { $ne: "current" } }, { tick: { $lt: 10 } }],
            },
          }),
        },
      ]),
    );
    expect(matches[0]).not.toHaveProperty("embedding");
  });

  it.each([
    { ...candidate, agentId: "bob" },
    { ...candidate, status: "invalidated" },
    { ...candidate, tick: 10 },
    { ...candidate, embeddingModel: "different-model" },
  ])("rejects out-of-scope search results", async (row) => {
    const { db, embeddings, rows } = setup();
    const memory = await MongoVectorMemory.open(db, embeddings);
    rows.mockResolvedValue([row]);
    await expect(memory.retrieve(query)).rejects.toThrow("out-of-scope");
  });

  it("rejects changed dimensions instead of mixing embedding spaces", async () => {
    const { db, embeddings, embed, aggregate } = setup();
    const memory = await MongoVectorMemory.open(db, embeddings);
    embed.mockResolvedValue([1, 0]);
    await expect(memory.retrieve(query)).rejects.toThrow("dimensions changed");
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("surfaces vector search failure without silently returning no memories", async () => {
    const { db, embeddings, rows } = setup();
    const memory = await MongoVectorMemory.open(db, embeddings);
    rows.mockRejectedValue(new Error("sensitive database details"));
    await expect(memory.retrieve(query)).rejects.toThrow("MongoDB vector retrieval failed");
  });
});
