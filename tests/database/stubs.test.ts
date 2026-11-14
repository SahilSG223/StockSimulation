import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../src/database/collections.js";
import { MongoExperienceStore } from "../../src/memory/experiences/mongo-store.js";
import { MongoMemoryRepository } from "../../src/memory/memories/mongo-memory-repository.js";

describe("mongo stubs (second laptop fills these in)", () => {
  it("exports collection names", () => {
    expect(COLLECTIONS.experiences).toBe("experiences");
    expect(COLLECTIONS.memories).toBe("memories");
  });

  it("mongo store stubs reject until implemented", async () => {
    const store = new MongoExperienceStore();
    await expect(store.listForAgent("a1")).rejects.toThrow(/not implemented/);
  });

  it("memory repo stubs reject until implemented", async () => {
    const repo = new MongoMemoryRepository();
    await expect(repo.listActiveForAgent("a1")).rejects.toThrow(/not implemented/);
  });
});
