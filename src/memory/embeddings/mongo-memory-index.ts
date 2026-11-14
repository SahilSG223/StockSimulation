/**
 * Mongo-backed semantic memory index. Mirrors `MemoryIndex`'s call shape so
 * callers can swap: `new MemoryIndex(embedder)` -> `new MongoMemoryIndex(db, embedder)`.
 *
 * Isolation (`.claude/rules/memory.md`) is enforced in every Mongo filter via
 * `MongoMemoryRepository`, which always includes `agentId` — never post-filtered
 * only in JS.
 */

import type { Db } from "mongodb";
import { MongoMemoryRepository } from "../memories/mongo-memory-repository.js";
import { embedMemoryContent } from "./embed-memory.js";
import { toEmbeddedMemory, toMemoryDoc } from "./embedded-memory-mapper.js";
import type { UpsertMemoryInput } from "./memory-index.js";
import { rankWithEmbeddings, type RankedEmbeddedMemory, type RetrievalContext } from "./rank-with-embeddings.js";
import type { EmbeddedMemory, Embedder } from "./types.js";

export class MongoMemoryIndex {
  private readonly repo: MongoMemoryRepository;

  constructor(
    db: Db,
    private readonly embedder: Embedder,
  ) {
    this.repo = new MongoMemoryRepository(db);
  }

  async upsert(input: UpsertMemoryInput): Promise<EmbeddedMemory> {
    const id = input.id ?? crypto.randomUUID();
    const embedding =
      input.embedding ?? (await embedMemoryContent(this.embedder, input.content)).embedding;
    const record: EmbeddedMemory = {
      id,
      agentId: input.agentId,
      content: input.content,
      embedding,
      status: input.status ?? "active",
      reliability: input.reliability ?? 0.7,
      updatedAtTick: input.updatedAtTick,
      scope: input.scope ?? { sectors: [], regimes: [], eventTypes: [], assets: [] },
    };

    // One lookup serves both the insert-vs-update decision and, on update,
    // preserving the original createdAtTick/version (ponytail: check-then-act,
    // fine at this scale — add a findOneAndUpdate upsert if concurrent upserts
    // of the same id become a real scenario).
    const existing = input.id ? await this.repo.findForAgent(input.agentId, input.id) : undefined;
    const doc = toMemoryDoc(
      record,
      existing
        ? {
            type: existing.type,
            sourceExperienceIds: existing.sourceExperienceIds,
            createdAtTick: existing.createdAtTick,
            version: existing.version + 1,
          }
        : undefined,
    );

    if (existing) {
      await this.repo.updateForAgent(input.agentId, id, doc);
    } else {
      await this.repo.insert(doc);
    }
    return record;
  }

  /** Mongo filter always includes agentId; returns any status, like `MemoryIndex.get`. */
  async get(agentId: string, id: string): Promise<EmbeddedMemory | undefined> {
    const doc = await this.repo.findForAgent(agentId, id);
    return doc ? toEmbeddedMemory(doc) : undefined;
  }

  /** Fail closed: throws (via `updateForAgent`) if `id` doesn't belong to `agentId`. */
  async invalidate(agentId: string, id: string): Promise<EmbeddedMemory | undefined> {
    await this.repo.updateForAgent(agentId, id, { status: "invalidated" });
    return this.get(agentId, id);
  }

  async search(args: {
    agentId: string;
    query: string;
    ctx: Omit<RetrievalContext, "agentId">;
    limit?: number;
  }): Promise<RankedEmbeddedMemory[]> {
    const queryEmbedding = await this.embedder.embed(args.query);
    // agentId + status: "active" is enforced here, in Mongo. Scope is left to
    // rankWithEmbeddings' soft contextual scoring, matching MemoryIndex exactly
    // (scope narrows relevance, it never hard-excludes a memory).
    const docs = await this.repo.listActiveForAgent(args.agentId);
    const memories = docs.filter((d) => d.embedding && d.embedding.length > 0).map(toEmbeddedMemory);
    const ranked = rankWithEmbeddings({
      memories,
      queryEmbedding,
      ctx: { ...args.ctx, agentId: args.agentId },
    });
    return ranked.slice(0, args.limit ?? 5);
  }
}
