import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "../../src/database/client.js";
import {
  MongoMemoryRepository,
  type MemoryDoc,
} from "../../src/memory/memories/mongo-memory-repository.js";

const live = process.env.RUN_MONGO_TESTS === "1" && Boolean(process.env.MONGODB_URI);

function baseDoc(overrides: Partial<MemoryDoc> & Pick<MemoryDoc, "agentId">): MemoryDoc {
  return {
    type: "semantic",
    content: "test lesson",
    sourceExperienceIds: [],
    createdAtTick: 1,
    updatedAtTick: 1,
    confidence: 0.5,
    reliability: 0.5,
    scope: { sectors: [], regimes: [], eventTypes: [], assets: [] },
    status: "active",
    version: 1,
    ...overrides,
  };
}

describe.skipIf(!live)("MongoMemoryRepository (live)", () => {
  const agentA = `mongo-test-a-${Date.now()}`;
  const agentB = `mongo-test-b-${Date.now()}`;

  afterAll(async () => {
    const db = await getDb();
    await db.collection("memories").deleteMany({ agentId: { $in: [agentA, agentB] } });
  });

  it("isolates active memories by agentId", async () => {
    const db = await getDb();
    const repo = new MongoMemoryRepository(db);
    await repo.insert(baseDoc({ agentId: agentA }));
    await repo.insert(baseDoc({ agentId: agentB }));
    await repo.insert(baseDoc({ agentId: agentA, status: "superseded" }));

    await expect(repo.listActiveForAgent(agentA)).resolves.toHaveLength(1);
    await expect(repo.listActiveForAgent("missing-agent")).resolves.toEqual([]);
  });

  it("updateForAgent only patches the owning agent's document", async () => {
    const db = await getDb();
    const repo = new MongoMemoryRepository(db);
    const inserted = await repo.insert(baseDoc({ agentId: agentA }));

    await repo.updateForAgent(agentB, inserted._id!, { content: "hijacked" });
    const [unchanged] = await repo.listActiveForAgent(agentA);
    expect(unchanged?.content).toBe("test lesson");

    await repo.updateForAgent(agentA, inserted._id!, { content: "revised" });
    const [changed] = await repo.listActiveForAgent(agentA);
    expect(changed?.content).toBe("revised");
  });
});
