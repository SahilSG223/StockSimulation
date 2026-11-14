import type { Collection, Db } from "mongodb";
import { COLLECTIONS } from "../database/collections.js";
import { EXPERIENCE_VECTOR_SEARCH_INDEX } from "../database/indexes.js";
import { rankWithEmbeddings } from "./embeddings/rank-with-embeddings.js";
import type { EmbeddedMemory, Embedder } from "./embeddings/types.js";
import type { ExperienceRecord } from "./experiences/types.js";
import {
  DEFAULT_EXPERIENCE_RELIABILITY,
  MEMORY_CONTENT_VERSION,
  embeddingVectorSchema,
  retrievedExperienceSchema,
  vectorMemorySchema,
  vectorQuerySchema,
  type RetrievedExperience,
  type VectorMemoryDocument,
  type VectorMemoryQuery,
} from "./vector-schema.js";

const RETURNED_MEMORIES = 5;

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

/**
 * Experience vectors in `COLLECTIONS.experienceVectors`, searched with Atlas
 * `$vectorSearch` and ranked by `rankWithEmbeddings`. Indexes are created by
 * `ensureMemoryIndexes` + `ensureExperienceVectorSearchIndex` (`pnpm
 * ensure-indexes` / `pnpm memory:prepare`), never ad hoc here.
 */
export class MongoVectorMemory {
  private readonly collection: Collection<VectorMemoryDocument>;

  constructor(
    db: Db,
    private readonly embedder: Embedder,
  ) {
    this.collection = db.collection<VectorMemoryDocument>(COLLECTIONS.experienceVectors);
  }

  /**
   * Embed and store the given experiences of one agent that have no vector yet
   * (one batched embedding call). Existing vectors are never overwritten, so an
   * invalidated memory is never reactivated. Returns how many were embedded.
   */
  async rememberMissing(
    agentId: string,
    experiences: readonly ExperienceRecord[],
    decisionModel: string,
  ): Promise<number> {
    if (experiences.some((experience) => experience.agentId !== agentId)) {
      throw new Error("Cannot embed another agent's experience");
    }
    if (experiences.length === 0) return 0;

    let existing: Set<string>;
    try {
      const rows = await this.collection
        .find(
          { agentId, id: { $in: experiences.map((e) => e.id) } },
          { projection: { _id: 0, id: 1 } },
        )
        .toArray();
      existing = new Set(rows.map((row) => row.id));
    } catch {
      throw new Error("MongoDB vector memory lookup failed");
    }

    const missing = experiences.filter((experience) => !existing.has(experience.id));
    if (missing.length === 0) return 0;

    const contents = missing.map(experienceContent);
    const embeddings = await this.embedder.embedMany(contents);
    for (const [i, experience] of missing.entries()) {
      const document = vectorMemorySchema.parse({
        id: experience.id,
        agentId,
        simulationId: experience.simulationId,
        tick: experience.tick,
        content: contents[i],
        embedding: this.validVector(embeddings[i]),
        embeddingModel: this.embedder.model,
        decisionModel,
        contentVersion: MEMORY_CONTENT_VERSION,
        status: "active",
        reliability: DEFAULT_EXPERIENCE_RELIABILITY,
        symbols: experience.scope.symbols,
        sectors: experience.scope.sectors,
        regimes: experience.scope.regimes,
        eventTypes: experience.market.eventTypes,
      });
      try {
        await this.collection.updateOne(
          { agentId, id: experience.id },
          { $setOnInsert: document },
          { upsert: true },
        );
      } catch {
        throw new Error("MongoDB vector memory write failed");
      }
    }
    return missing.length;
  }

  async remember(experience: ExperienceRecord, decisionModel: string): Promise<void> {
    await this.rememberMissing(experience.agentId, [experience], decisionModel);
  }

  async retrieve(input: VectorMemoryQuery): Promise<RetrievedExperience[]> {
    const query = vectorQuerySchema.parse(input);
    const queryEmbedding = this.validVector(await this.embedder.embed(query.content));
    let docs: unknown[];
    try {
      docs = await this.collection
        .aggregate([
          {
            $vectorSearch: {
              index: EXPERIENCE_VECTOR_SEARCH_INDEX,
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: 400,
              limit: 20,
              // Ownership, lifecycle and embedding space are enforced in the database query.
              filter: {
                agentId: query.agentId,
                status: "active",
                embeddingModel: this.embedder.model,
                contentVersion: MEMORY_CONTENT_VERSION,
                $or: [{ simulationId: { $ne: query.simulationId } }, { tick: { $lt: query.tick } }],
              },
            },
          },
          { $project: { _id: 0 } },
        ])
        .toArray();
    } catch {
      throw new Error("MongoDB vector retrieval failed; check index readiness and filters");
    }

    const candidates = docs.map((doc) => {
      const candidate = vectorMemorySchema.parse(doc);
      if (
        candidate.agentId !== query.agentId ||
        candidate.status !== "active" ||
        candidate.embeddingModel !== this.embedder.model ||
        (candidate.simulationId === query.simulationId && candidate.tick >= query.tick)
      ) {
        throw new Error("Vector retrieval returned an out-of-scope experience");
      }
      return candidate;
    });
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    // Note: across runs, tick clocks are not comparable; the ranker clamps
    // negative ages to 0, so a memory from another run is never penalised for age.
    return rankWithEmbeddings({
      memories: candidates.map(toEmbeddedMemory),
      queryEmbedding,
      ctx: {
        agentId: query.agentId,
        tick: query.tick,
        assets: query.symbols,
        eventTypes: query.eventTypes,
      },
    })
      .slice(0, RETURNED_MEMORIES)
      .map((ranked) => {
        const { embedding: _embedding, ...stored } = byId.get(ranked.memory.id)!;
        return retrievedExperienceSchema.parse({
          ...stored,
          semanticSimilarity: ranked.semanticSimilarity,
          contextualApplicability: ranked.contextualApplicability,
          temporalRelevance: ranked.temporalRelevance,
          retrievalScore: ranked.retrievalScore,
        });
      });
  }

  private validVector(vector: unknown): number[] {
    const parsed = embeddingVectorSchema.parse(vector);
    if (parsed.length !== this.embedder.dimensions) {
      throw new Error("Embedding dimensions do not match the configured embedder");
    }
    return parsed;
  }
}

function toEmbeddedMemory(doc: VectorMemoryDocument): EmbeddedMemory {
  return {
    id: doc.id,
    agentId: doc.agentId,
    content: doc.content,
    embedding: doc.embedding,
    status: doc.status,
    reliability: doc.reliability,
    updatedAtTick: doc.tick,
    scope: {
      sectors: doc.sectors,
      regimes: doc.regimes,
      eventTypes: doc.eventTypes,
      assets: doc.symbols,
    },
  };
}
