import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  EXPERIENCE_INDEXES,
  EXPERIENCE_VECTOR_INDEXES,
  EXPERIENCE_VECTOR_SEARCH_INDEX,
  MEMORY_INDEXES,
  ensureExperienceVectorSearchIndex,
  ensureMemoryIndexes,
} from "../../src/database/indexes.js";
import { COLLECTIONS } from "../../src/database/collections.js";

describe("ensureMemoryIndexes", () => {
  it("creates experience, memory and experience-vector indexes on the canonical collections", async () => {
    const createIndexes = vi.fn(async () => []);
    const collection = vi.fn(() => ({ createIndexes }));
    const db = { collection } as unknown as Db;

    await ensureMemoryIndexes(db);

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.experiences);
    expect(collection).toHaveBeenCalledWith(COLLECTIONS.memories);
    expect(collection).toHaveBeenCalledWith(COLLECTIONS.experienceVectors);
    expect(createIndexes).toHaveBeenCalledWith([...EXPERIENCE_INDEXES]);
    expect(createIndexes).toHaveBeenCalledWith([...MEMORY_INDEXES]);
    expect(createIndexes).toHaveBeenCalledWith([...EXPERIENCE_VECTOR_INDEXES]);
  });
});

describe("ensureExperienceVectorSearchIndex", () => {
  function fakeDb(listed: unknown[][]) {
    const toArray = vi.fn();
    for (const rows of listed) toArray.mockResolvedValueOnce(rows);
    const createSearchIndex = vi.fn(async () => EXPERIENCE_VECTOR_SEARCH_INDEX);
    const collection = vi.fn(() => ({
      listSearchIndexes: vi.fn(() => ({ toArray })),
      createSearchIndex,
    }));
    return { db: { collection } as unknown as Db, collection, createSearchIndex };
  }

  it("creates a cosine index with ownership and lifecycle filters, then waits until queryable", async () => {
    const { db, collection, createSearchIndex } = fakeDb([
      [],
      [{ queryable: false }],
      [{ queryable: true }],
    ]);

    await ensureExperienceVectorSearchIndex(db, { dimensions: 1536, pollMs: 0 });

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.experienceVectors);
    expect(createSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        name: EXPERIENCE_VECTOR_SEARCH_INDEX,
        type: "vectorSearch",
        definition: {
          fields: expect.arrayContaining([
            { type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine" },
            { type: "filter", path: "agentId" },
            { type: "filter", path: "status" },
            { type: "filter", path: "embeddingModel" },
          ]),
        },
      }),
    );
  });

  it("does not recreate an existing index", async () => {
    const { db, createSearchIndex } = fakeDb([[{ queryable: true }], [{ queryable: true }]]);
    await ensureExperienceVectorSearchIndex(db, { dimensions: 1536, pollMs: 0 });
    expect(createSearchIndex).not.toHaveBeenCalled();
  });

  it("fails on a failed build or when the index never becomes queryable", async () => {
    const failed = fakeDb([[{ status: "FAILED" }], [{ status: "FAILED" }]]);
    await expect(
      ensureExperienceVectorSearchIndex(failed.db, { dimensions: 3, pollMs: 0 }),
    ).rejects.toThrow("build failed");

    const building = fakeDb([
      [{ queryable: false }],
      [{ queryable: false }],
      [{ queryable: false }],
    ]);
    await expect(
      ensureExperienceVectorSearchIndex(building.db, { dimensions: 3, attempts: 2, pollMs: 0 }),
    ).rejects.toThrow("still building");
  });
});
