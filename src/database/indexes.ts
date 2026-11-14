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

/** Atlas Vector Search index on `memories.embedding`, queried by `MongoMemoryIndex.search`. */
export const MEMORY_VECTOR_SEARCH_INDEX = "lesson_similarity";
export const MEMORY_VECTOR_FILTER_PATHS = [
  "agentId",
  "status",
  "scope.sectors",
  "scope.regimes",
  "scope.assets",
] as const;

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
 * Create an Atlas Vector Search index if missing, then wait until it is
 * queryable. Requires an Atlas deployment and search-index permissions.
 * `dimensions` must match the embedder.
 */
async function ensureVectorSearchIndex(
  db: Db,
  args: {
    collectionName: string;
    indexName: string;
    path: string;
    filterPaths: readonly string[];
    dimensions: number;
    attempts?: number;
    pollMs?: number;
  },
): Promise<void> {
  const collection = db.collection(args.collectionName);
  const listIndex = () => collection.listSearchIndexes(args.indexName).toArray();

  if ((await listIndex()).length === 0) {
    await collection.createSearchIndex({
      name: args.indexName,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: args.path,
            numDimensions: args.dimensions,
            similarity: "cosine",
          },
          ...args.filterPaths.map((path) => ({ type: "filter", path })),
        ],
      },
    });
  }

  for (let attempt = 0; attempt < (args.attempts ?? 30); attempt++) {
    const indexes = (await listIndex()) as { queryable?: boolean; status?: string }[];
    if (indexes.some((index) => index.queryable === true)) return;
    if (indexes.some((index) => index.status === "FAILED")) {
      throw new Error("Vector search index build failed; check the Atlas UI for details");
    }
    await setTimeout(args.pollMs ?? 2000);
  }
  throw new Error("Vector search index is still building; retry after it is queryable");
}

export function ensureExperienceVectorSearchIndex(
  db: Db,
  options: { dimensions: number; attempts?: number; pollMs?: number },
): Promise<void> {
  return ensureVectorSearchIndex(db, {
    collectionName: COLLECTIONS.experienceVectors,
    indexName: EXPERIENCE_VECTOR_SEARCH_INDEX,
    path: "embedding",
    filterPaths: EXPERIENCE_VECTOR_FILTER_PATHS,
    ...options,
  });
}

/** Lessons' vector search index — same mechanics, `memories` collection. */
export function ensureMemoryVectorSearchIndex(
  db: Db,
  options: { dimensions: number; attempts?: number; pollMs?: number },
): Promise<void> {
  return ensureVectorSearchIndex(db, {
    collectionName: COLLECTIONS.memories,
    indexName: MEMORY_VECTOR_SEARCH_INDEX,
    path: "embedding",
    filterPaths: MEMORY_VECTOR_FILTER_PATHS,
    ...options,
  });
}
