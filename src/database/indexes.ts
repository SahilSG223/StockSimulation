/** Ensure indexes for memory collections. */

import { setTimeout } from "node:timers/promises";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export const EXPERIENCE_INDEXES = [
  { key: { agentId: 1, simulationId: 1, tick: 1 }, name: "agent_sim_tick" },
] as const;

export const MEMORY_INDEXES = [
  { key: { agentId: 1, status: 1 }, name: "agent_status" },
  { key: { agentId: 1, "scope.sectors": 1 }, name: "agent_sectors" },
  { key: { agentId: 1, "scope.regimes": 1 }, name: "agent_regimes" },
] as const;

/**
 * Laptop-2 stretch: Atlas Vector Search index on `memories.embedding`
 * (filterable fields: agentId, status, scope.*). Not created by ensureMemoryIndexes —
 * define in Atlas UI or atlas CLI, then query from MongoMemoryIndex.search.
 */
export const MEMORY_VECTOR_INDEX_HINT = {
  collection: COLLECTIONS.memories,
  path: "embedding",
  numDimensions: 1536,
  similarity: "cosine",
  filterPaths: ["agentId", "status", "scope.sectors", "scope.regimes", "scope.assets"],
} as const;

/** One vector per (agent, experience): makes embedding backfill idempotent. */
export const EXPERIENCE_VECTOR_INDEXES = [
  { key: { agentId: 1, id: 1 }, name: "agent_experience", unique: true },
] as const;

export const EXPERIENCE_VECTOR_SEARCH_INDEX = "experience_similarity";

/** Fields `$vectorSearch` may prefilter on. Ownership and lifecycle are always applied. */
export const EXPERIENCE_VECTOR_FILTER_PATHS = [
  "agentId",
  "status",
  "embeddingModel",
  "contentVersion",
  "simulationId",
  "tick",
] as const;

/** Call once at app startup or via `pnpm exec tsx scripts/ensure-indexes.ts`. */
export async function ensureMemoryIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.experiences).createIndexes([...EXPERIENCE_INDEXES]);
  await db.collection(COLLECTIONS.memories).createIndexes([...MEMORY_INDEXES]);
  await db.collection(COLLECTIONS.experienceVectors).createIndexes([...EXPERIENCE_VECTOR_INDEXES]);
}

/**
 * Create the Atlas Vector Search index on `experience_vectors` if missing, then
 * wait until it is queryable. Requires an Atlas deployment and search-index
 * permissions. `dimensions` must match the embedder.
 */
export async function ensureExperienceVectorSearchIndex(
  db: Db,
  options: { dimensions: number; attempts?: number; pollMs?: number },
): Promise<void> {
  const collection = db.collection(COLLECTIONS.experienceVectors);
  const listIndex = () => collection.listSearchIndexes(EXPERIENCE_VECTOR_SEARCH_INDEX).toArray();

  if ((await listIndex()).length === 0) {
    await collection.createSearchIndex({
      name: EXPERIENCE_VECTOR_SEARCH_INDEX,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: options.dimensions,
            similarity: "cosine",
          },
          ...EXPERIENCE_VECTOR_FILTER_PATHS.map((path) => ({ type: "filter", path })),
        ],
      },
    });
  }

  for (let attempt = 0; attempt < (options.attempts ?? 30); attempt++) {
    const indexes = (await listIndex()) as { queryable?: boolean; status?: string }[];
    if (indexes.some((index) => index.queryable === true)) return;
    if (indexes.some((index) => index.status === "FAILED")) {
      throw new Error("Vector search index build failed; check the Atlas UI for details");
    }
    await setTimeout(options.pollMs ?? 2000);
  }
  throw new Error("Vector search index is still building; retry after it is queryable");
}
