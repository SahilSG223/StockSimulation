import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Collection, Db } from "mongodb";
import { embeddingVectorSchema, type EmbeddingProvider } from "./embedding.js";
import { experienceRecordSchema } from "./experiences/experience-schema.js";
import type { ExperienceRecord } from "./experiences/types.js";
import {
  MEMORY_CONTENT_VERSION,
  retrievedMemorySchema,
  vectorMemorySchema,
  vectorQuerySchema,
  vectorCandidateSchema,
  searchIndexStatusSchema,
  type RetrievedMemory,
  type VectorMemoryDocument,
  type VectorMemoryQuery,
} from "./vector-schema.js";

/** Experience narrative, not an embedding of raw prices or balances. */
export function experienceContent(experience: ExperienceRecord): string {
  return [
    `Strategy: ${experience.decision.strategy ?? "unspecified"}.`,
    `Reasoning: ${experience.decision.reasoning}`,
    `Assets: ${experience.scope.symbols.join(", ") || "none"}.`,
    `Public event types: ${experience.market.eventTypes.join(", ") || "none"}.`,
    `Actions: ${experience.decision.orders.map((order) => `${order.side} ${order.symbol}`).join(", ") || "hold"}.`,
    `Executed: ${experience.outcome.fills.map((fill) => `${fill.side} ${fill.symbol}`).join(", ") || "no fills"}.`,
    `Rejected: ${experience.outcome.rejections.map((rejection) => `${rejection.symbol}: ${rejection.reason}`).join(", ") || "none"}.`,
    `Immediate cash movement: ${experience.outcome.cashDelta < 0 ? "deployed cash" : experience.outcome.cashDelta > 0 ? "received cash" : "unchanged"}.`,
    `Realized P&L change: ${experience.outcome.realizedPnlDelta === undefined ? "not supplied" : experience.outcome.realizedPnlDelta > 0 ? "positive" : experience.outcome.realizedPnlDelta < 0 ? "negative" : "unchanged"}. This is immediate execution evidence, not a long-term strategy verdict.`,
  ].join("\n");
}

export class MongoVectorMemory {
  private constructor(
    private readonly collection: Collection<VectorMemoryDocument>,
    private readonly embeddings: EmbeddingProvider,
    readonly dimensions: number,
  ) {}

  static async open(database: Db, embeddings: EmbeddingProvider): Promise<MongoVectorMemory> {
    const probe = embeddingVectorSchema.parse(
      await embeddings.embed("Agent decision context and execution experience."),
    );
    const space = createHash("sha256")
      .update(`${embeddings.model}:${probe.length}:${MEMORY_CONTENT_VERSION}`)
      .digest("hex")
      .slice(0, 16);
    const memory = new MongoVectorMemory(
      database.collection<VectorMemoryDocument>(`experience_vectors_${space}`),
      embeddings,
      probe.length,
    );
    await memory.initialize();
    return memory;
  }

  private async initialize(): Promise<void> {
    try {
      await this.collection.createIndex({ agentId: 1, id: 1 }, { unique: true });
      const existing = await this.collection.listSearchIndexes("experience_similarity").toArray();
      if (existing.length === 0) {
        await this.collection.createSearchIndex({
          name: "experience_similarity",
          type: "vectorSearch",
          definition: {
            fields: [
              {
                type: "vector",
                path: "embedding",
                numDimensions: this.dimensions,
                similarity: "cosine",
              },
              ...[
                "agentId",
                "status",
                "embeddingModel",
                "contentVersion",
                "simulationId",
                "tick",
              ].map((path) => ({ type: "filter", path })),
            ],
          },
        });
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        const indexes = searchIndexStatusSchema.parse(
          await this.collection.listSearchIndexes("experience_similarity").toArray(),
        );
        if (indexes.some((index) => index.queryable === true)) return;
        if (indexes.some((index) => index.status === "FAILED")) throw new Error("index failed");
        await setTimeout(2000);
      }
    } catch {
      throw new Error(
        "MongoDB vector index setup failed; verify Vector Search support and search-index permissions",
      );
    }
    throw new Error("MongoDB vector index is still building; retry after the index is queryable");
  }

  async remember(input: ExperienceRecord, decisionModel: string): Promise<void> {
    const experience = experienceRecordSchema.parse(input);
    const identity = { agentId: experience.agentId, id: experience.id };
    try {
      if (await this.collection.findOne(identity, { projection: { _id: 1 } })) return;
    } catch {
      throw new Error("MongoDB vector memory lookup failed");
    }
    const content = experienceContent(experience);
    const embedding = await this.embed(content);
    const document = vectorMemorySchema.parse({
      ...identity,
      simulationId: experience.simulationId,
      tick: experience.tick,
      content,
      embedding,
      embeddingModel: this.embeddings.model,
      decisionModel,
      contentVersion: MEMORY_CONTENT_VERSION,
      status: "active",
      symbols: experience.scope.symbols,
      eventTypes: experience.market.eventTypes,
    });
    try {
      // Idempotent backfill; never reactivate an existing invalidated memory.
      await this.collection.updateOne(identity, { $setOnInsert: document }, { upsert: true });
    } catch {
      throw new Error("MongoDB vector memory write failed");
    }
  }

  private async embed(content: string): Promise<number[]> {
    const vector = embeddingVectorSchema.parse(await this.embeddings.embed(content));
    if (vector.length !== this.dimensions)
      throw new Error("Embedding dimensions changed; reopen vector memory with a compatible model");
    return vector;
  }

  async retrieve(input: VectorMemoryQuery): Promise<RetrievedMemory[]> {
    const query = vectorQuerySchema.parse(input);
    const embedding = await this.embed(query.content);
    let docs: unknown[];
    try {
      docs = await this.collection
        .aggregate([
          {
            $vectorSearch: {
              index: "experience_similarity",
              path: "embedding",
              queryVector: embedding,
              numCandidates: 400,
              limit: 20,
              filter: {
                agentId: query.agentId,
                status: "active",
                embeddingModel: this.embeddings.model,
                contentVersion: MEMORY_CONTENT_VERSION,
                $or: [{ simulationId: { $ne: query.simulationId } }, { tick: { $lt: query.tick } }],
              },
            },
          },
          { $set: { similarity: { $meta: "vectorSearchScore" } } },
          { $project: { embedding: 0, _id: 0 } },
        ])
        .toArray();
    } catch {
      throw new Error("MongoDB vector retrieval failed; check index readiness and filters");
    }
    return docs
      .map((doc) => {
        const candidate = vectorCandidateSchema.parse(doc);
        if (
          candidate.agentId !== query.agentId ||
          candidate.status !== "active" ||
          candidate.embeddingModel !== this.embeddings.model ||
          (candidate.simulationId === query.simulationId && candidate.tick >= query.tick)
        ) {
          throw new Error("Vector retrieval returned an out-of-scope experience");
        }
        const symbolOverlap = candidate.symbols.some((symbol) => query.symbols.includes(symbol));
        const eventOverlap = candidate.eventTypes.some((type) => query.eventTypes.includes(type));
        const contextualRelevance = 0.25 + (symbolOverlap ? 0.5 : 0) + (eventOverlap ? 0.25 : 0);
        // Cross-run tick clocks are incomparable, so use a neutral prior rather than inventing age.
        const temporalRelevance =
          candidate.simulationId === query.simulationId
            ? 1 / (1 + (query.tick - candidate.tick) / 100)
            : 0.5;
        return retrievedMemorySchema.parse({
          ...candidate,
          contextualRelevance,
          temporalRelevance,
          rankingScore: candidate.similarity * contextualRelevance * temporalRelevance,
        });
      })
      .sort((a, b) => b.rankingScore - a.rankingScore || a.id.localeCompare(b.id))
      .slice(0, 5);
  }
}
