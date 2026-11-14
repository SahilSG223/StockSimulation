/**
 * Mongo-backed semantic memory index — **implement on second laptop**.
 *
 * Mirror `MemoryIndex` call shape so call sites can swap:
 *   new MemoryIndex(embedder)  →  new MongoMemoryIndex(db, embedder)
 *
 * Non-negotiables (see `.claude/rules/memory.md`):
 * - EVERY Mongo filter includes `agentId` (never post-filter only)
 * - Prefer metadata filters in the query, then rank with `rankWithEmbeddings`
 * - Do not embed raw prices — only lesson `content`
 * - String `_id`s (UUID), same as `MongoMemoryRepository`
 *
 * Suggested implementation order (also in PR body):
 * 1. `upsert` — embed → `toMemoryDoc` → `MongoMemoryRepository.insert` / update
 * 2. `invalidate` — `updateForAgent` status=invalidated
 * 3. `search` — query `{ agentId, status: "active", ...scope }` THEN
 *    `rankWithEmbeddings` (Atlas Vector Search optional stretch)
 * 4. Live tests under `RUN_MONGO_TESTS=1`
 */

import type { Db } from "mongodb";
import type { UpsertMemoryInput } from "./memory-index.js";
import type { RankedEmbeddedMemory, RetrievalContext } from "./rank-with-embeddings.js";
import type { EmbeddedMemory, Embedder } from "./types.js";

const NOT_IMPL =
  "MongoMemoryIndex not implemented — second laptop: see PR body / this file header";

export class MongoMemoryIndex {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
  ) {
    void this.db;
    void this.embedder;
  }

  async upsert(_input: UpsertMemoryInput): Promise<EmbeddedMemory> {
    return Promise.reject(new Error(`MongoMemoryIndex.upsert: ${NOT_IMPL}`));
  }

  async get(_agentId: string, _id: string): Promise<EmbeddedMemory | undefined> {
    return Promise.reject(new Error(`MongoMemoryIndex.get: ${NOT_IMPL}`));
  }

  async invalidate(_agentId: string, _id: string): Promise<EmbeddedMemory | undefined> {
    return Promise.reject(new Error(`MongoMemoryIndex.invalidate: ${NOT_IMPL}`));
  }

  async search(_args: {
    agentId: string;
    query: string;
    ctx: Omit<RetrievalContext, "agentId">;
    limit?: number;
  }): Promise<RankedEmbeddedMemory[]> {
    return Promise.reject(new Error(`MongoMemoryIndex.search: ${NOT_IMPL}`));
  }
}
