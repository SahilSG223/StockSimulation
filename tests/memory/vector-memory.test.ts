import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { COLLECTIONS } from "../../src/database/collections.js";
import { EXPERIENCE_VECTOR_SEARCH_INDEX } from "../../src/database/indexes.js";
import type { Embedder } from "../../src/memory/embeddings/types.js";
import type { ExperienceRecord } from "../../src/memory/experiences/types.js";
import { MongoVectorMemory, experienceContent } from "../../src/memory/vector-memory.js";
import { DEFAULT_EXPERIENCE_RELIABILITY } from "../../src/memory/vector-schema.js";

const query = {
  agentId: "alice",
  simulationId: "current",
  tick: 10,
  content: "TECH rising after demand news",
  symbols: ["TECH"],
  eventTypes: ["news"],
};

const stored = {
  id: "past",
  agentId: "alice",
  simulationId: "current",
  tick: 1,
  content: "Previous entry after demand news; order filled, subsequent return unknown.",
  embedding: [1, 0, 0],
  embeddingModel: "test-embedding",
  decisionModel: "test-agent",
  contentVersion: "experience-v1",
  status: "active",
  reliability: 0.5,
  symbols: ["TECH"],
  sectors: ["Technology"],
  regimes: [],
  eventTypes: ["news"],
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
  scope: { symbols: ["TECH"], sectors: ["Technology"], regimes: ["bull"], eventTypes: ["news"] },
};

function setup() {
  const existing = vi.fn(async (): Promise<{ id: string }[]> => []);
  const searchRows = vi.fn(async (): Promise<unknown[]> => []);
  const find = vi.fn(() => ({ toArray: existing }));
  const aggregate = vi.fn(() => ({ toArray: searchRows }));
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const collection = vi.fn(() => ({ find, aggregate, updateOne }));
  const db = { collection } as unknown as Db;
  const embedder: Embedder = {
    model: "test-embedding",
    dimensions: 3,
    embed: vi.fn(async () => [1, 0, 0]),
    embedMany: vi.fn(async (texts: readonly string[]) => texts.map(() => [0, 1, 0])),
  };
  return { db, collection, find, existing, aggregate, searchRows, updateOne, embedder };
}

describe("experienceContent", () => {
  it("describes the decision and outcome without raw price records", () => {
    expect(experienceContent(experience)).toContain(experience.decision.reasoning);
    expect(experienceContent(experience)).not.toContain("123.456");
  });
});

describe("MongoVectorMemory.rememberMissing", () => {
  it("uses the registered collection and embeds only experiences without a vector, in one batch", async () => {
    const { db, collection, find, existing, updateOne, embedder } = setup();
    existing.mockResolvedValue([{ id: "already" }]);
    const memory = new MongoVectorMemory(db, embedder);

    const embedded = await memory.rememberMissing(
      "alice",
      [{ ...experience, id: "already" }, experience],
      "decision-model",
    );

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.experienceVectors);
    expect(find).toHaveBeenCalledWith(
      { agentId: "alice", id: { $in: ["already", "past"] } },
      { projection: { _id: 0, id: 1 } },
    );
    expect(embedded).toBe(1);
    expect(embedder.embedMany).toHaveBeenCalledTimes(1);
    expect(embedder.embedMany).toHaveBeenCalledWith([experienceContent(experience)]);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledWith(
      { agentId: "alice", id: "past" },
      {
        $setOnInsert: expect.objectContaining({
          embedding: [0, 1, 0],
          embeddingModel: "test-embedding",
          decisionModel: "decision-model",
          status: "active",
          reliability: DEFAULT_EXPERIENCE_RELIABILITY,
          sectors: ["Technology"],
          regimes: ["bull"],
        }),
      },
      { upsert: true },
    );
  });

  it("does nothing for an empty batch and refuses another agent's experience", async () => {
    const { db, find, embedder } = setup();
    const memory = new MongoVectorMemory(db, embedder);
    expect(await memory.rememberMissing("alice", [], "m")).toBe(0);
    expect(find).not.toHaveBeenCalled();
    await expect(memory.rememberMissing("bob", [experience], "m")).rejects.toThrow("another agent");
  });
});

describe("MongoVectorMemory.retrieve", () => {
  it("prefilters in $vectorSearch and ranks with rankWithEmbeddings", async () => {
    const { db, aggregate, searchRows, embedder } = setup();
    searchRows.mockResolvedValue([
      { ...stored, id: "unrelated", embedding: [0, 1, 0], symbols: ["OTHER"], eventTypes: [] },
      { ...stored, id: "relevant" },
    ]);
    const matches = await new MongoVectorMemory(db, embedder).retrieve(query);

    expect(aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          $vectorSearch: expect.objectContaining({
            index: EXPERIENCE_VECTOR_SEARCH_INDEX,
            queryVector: [1, 0, 0],
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
    expect(matches.map((m) => m.id)).toEqual(["relevant", "unrelated"]);
    expect(matches[0]).toMatchObject({ semanticSimilarity: 1, contextualApplicability: 1 });
    expect(matches[0]!.retrievalScore).toBeGreaterThan(matches[1]!.retrievalScore);
    expect(matches[0]).not.toHaveProperty("embedding");
  });

  it.each([
    { ...stored, agentId: "bob" },
    { ...stored, status: "invalidated" },
    { ...stored, tick: 10 },
    { ...stored, embeddingModel: "different-model" },
  ])("rejects out-of-scope search results", async (row) => {
    const { db, searchRows, embedder } = setup();
    searchRows.mockResolvedValue([row]);
    await expect(new MongoVectorMemory(db, embedder).retrieve(query)).rejects.toThrow(
      "out-of-scope",
    );
  });

  it("rejects a query vector of the wrong size instead of mixing embedding spaces", async () => {
    const { db, aggregate, embedder } = setup();
    vi.mocked(embedder.embed).mockResolvedValue([1, 0]);
    await expect(new MongoVectorMemory(db, embedder).retrieve(query)).rejects.toThrow("dimensions");
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("surfaces vector search failure without leaking driver details", async () => {
    const { db, searchRows, embedder } = setup();
    searchRows.mockRejectedValue(new Error("sensitive database details"));
    await expect(new MongoVectorMemory(db, embedder).retrieve(query)).rejects.toThrow(
      "MongoDB vector retrieval failed",
    );
  });
});
