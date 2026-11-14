import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "../../src/database/client.js";
import { MongoExperienceStore } from "../../src/memory/experiences/mongo-store.js";
import type { CreateExperienceInput } from "../../src/memory/experiences/types.js";

const live = process.env.RUN_MONGO_TESTS === "1" && Boolean(process.env.MONGODB_URI);

function baseInput(
  overrides: Partial<CreateExperienceInput> & Pick<CreateExperienceInput, "agentId" | "tick">,
): CreateExperienceInput {
  return {
    simulationId: "sim-mongo-test",
    market: { regime: "bull", prices: { SEMI: 80 }, eventIds: [], eventTypes: [] },
    decision: { reasoning: "test", memoryReferences: [], orders: [] },
    outcome: { fills: [], rejections: [], cashDelta: 0, summary: "noop" },
    scope: { symbols: ["SEMI"], sectors: ["Semiconductors"], regimes: ["bull"], eventTypes: [] },
    ...overrides,
  };
}

describe.skipIf(!live)("MongoExperienceStore (live)", () => {
  const agentA = `mongo-test-a-${Date.now()}`;
  const agentB = `mongo-test-b-${Date.now()}`;

  afterAll(async () => {
    const db = await getDb();
    await db.collection("experiences").deleteMany({ agentId: { $in: [agentA, agentB] } });
  });

  it("isolates experiences by agentId", async () => {
    const db = await getDb();
    const store = new MongoExperienceStore(db);
    await store.create(baseInput({ agentId: agentA, tick: 1 }));
    await store.create(baseInput({ agentId: agentB, tick: 1 }));

    await expect(store.listForAgent(agentA)).resolves.toHaveLength(1);
    await expect(store.listForAgent("missing-agent")).resolves.toEqual([]);
  });
});
