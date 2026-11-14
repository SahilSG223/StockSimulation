import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  EXPERIENCE_INDEXES,
  MEMORY_INDEXES,
  ensureMemoryIndexes,
} from "../../src/database/indexes.js";
import { COLLECTIONS } from "../../src/database/collections.js";

describe("ensureMemoryIndexes", () => {
  it("creates experience and memory indexes on the canonical collections", async () => {
    const createIndexes = vi.fn(async () => []);
    const collection = vi.fn(() => ({ createIndexes }));
    const db = { collection } as unknown as Db;

    await ensureMemoryIndexes(db);

    expect(collection).toHaveBeenCalledWith(COLLECTIONS.experiences);
    expect(collection).toHaveBeenCalledWith(COLLECTIONS.memories);
    expect(createIndexes).toHaveBeenCalledWith([...EXPERIENCE_INDEXES]);
    expect(createIndexes).toHaveBeenCalledWith([...MEMORY_INDEXES]);
  });
});
