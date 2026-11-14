/**
 * Extensive correctness experiment for MongoMemoryIndex: many agents, many
 * memories, many searches/invalidations — checking isolation, fail-closed
 * writes, and determinism hold at scale, not just in a 2-agent unit test.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MongoMemoryIndex } from "../../src/memory/embeddings/index.js";
import { FakeEmbedder } from "../../src/memory/embeddings/fake-embedder.js";
import { MongoMemoryRepository } from "../../src/memory/memories/mongo-memory-repository.js";
import { SeededRng } from "../../src/simulation/index.js";
import { createFakeDb } from "./fake-mongo-db.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "../../experiments/out");

const AGENTS = Array.from({ length: 25 }, (_, i) => `agent-${i}`);
const MEMORIES_PER_AGENT = 20;
const SECTORS = ["Semiconductors", "Energy", "Technology", "Consumer"] as const;
const REGIMES = ["bull", "bear", "sideways"] as const;
const LESSON_WORDS = [
  "momentum",
  "contrarian",
  "caution",
  "demand",
  "shock",
  "rally",
  "crash",
  "hold",
  "rotation",
  "breakout",
] as const;

function pick<T>(rng: SeededRng, xs: readonly T[]): T {
  return xs[Math.floor(rng.nextFloat() * xs.length)]!;
}

function buildIndex(rng: SeededRng) {
  const index = new MongoMemoryIndex(createFakeDb(), new FakeEmbedder());
  const ids: { agentId: string; id: string }[] = [];
  return (async () => {
    for (const agentId of AGENTS) {
      for (let m = 0; m < MEMORIES_PER_AGENT; m++) {
        const words = Array.from({ length: 4 }, () => pick(rng, LESSON_WORDS));
        const record = await index.upsert({
          id: `${agentId}-m${m}`,
          agentId,
          content: `${words.join(" ")} in ${pick(rng, REGIMES)}`,
          updatedAtTick: Math.floor(rng.nextFloat() * 500),
          reliability: rng.nextFloat(),
          scope: {
            sectors: [pick(rng, SECTORS)],
            regimes: [pick(rng, REGIMES)],
            eventTypes: [],
            assets: [],
          },
        });
        ids.push({ agentId, id: record.id });
      }
    }
    return { index, ids };
  })();
}

describe("MongoMemoryIndex extensive correctness experiment", () => {
  it(
    "holds isolation, fail-closed writes, and determinism across many agents/memories",
    async () => {
      const started = Date.now();
      const rng = new SeededRng(7);
      const { index, ids } = await buildIndex(rng);

      // --- Isolation: every agent's search results belong only to that agent ---
      let searchIsolationBreaches = 0;
      let searchesRun = 0;
      for (const agentId of AGENTS) {
        for (const word of LESSON_WORDS) {
          const results = await index.search({ agentId, query: word, ctx: { tick: 250 }, limit: 10 });
          searchesRun += 1;
          if (results.some((r) => r.memory.agentId !== agentId)) searchIsolationBreaches += 1;
        }
      }

      // --- get(): never returns another agent's memory by id ---
      let getIsolationBreaches = 0;
      let getChecks = 0;
      for (const target of ids) {
        const otherAgent = AGENTS[(AGENTS.indexOf(target.agentId) + 7) % AGENTS.length]!;
        if (otherAgent === target.agentId) continue;
        getChecks += 1;
        const got = await index.get(otherAgent, target.id);
        if (got !== undefined) getIsolationBreaches += 1;
      }

      // --- invalidate(): owner always succeeds, non-owner always throws (fail closed) ---
      let wrongAgentSucceeded = 0;
      let ownerFailed = 0;
      let invalidateChecks = 0;
      for (const target of ids.slice(0, 100)) {
        const wrongAgent = AGENTS[(AGENTS.indexOf(target.agentId) + 3) % AGENTS.length]!;
        if (wrongAgent !== target.agentId) {
          invalidateChecks += 1;
          try {
            await index.invalidate(wrongAgent, target.id, "attempted by wrong agent", 250);
            wrongAgentSucceeded += 1;
          } catch {
            // expected
          }
        }
      }
      for (const target of ids.slice(100, 120)) {
        try {
          await index.invalidate(target.agentId, target.id, "stress test cleanup", 250);
        } catch {
          ownerFailed += 1;
        }
      }

      // --- determinism: same seed -> identical ranked ids for every agent/query ---
      const rng2 = new SeededRng(7);
      const { index: index2 } = await buildIndex(rng2);
      let determinismMismatches = 0;
      let determinismChecks = 0;
      for (const agentId of AGENTS.slice(0, 5)) {
        for (const word of LESSON_WORDS.slice(0, 3)) {
          determinismChecks += 1;
          const a = await index.search({ agentId, query: word, ctx: { tick: 250 }, limit: 10 });
          const b = await index2.search({ agentId, query: word, ctx: { tick: 250 }, limit: 10 });
          const sameOrder = a.map((r) => r.memory.id).join(",") === b.map((r) => r.memory.id).join(",");
          if (!sameOrder) determinismMismatches += 1;
        }
      }

      const report = {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        config: { agents: AGENTS.length, memoriesPerAgent: MEMORIES_PER_AGENT, totalMemories: ids.length },
        search: { searchesRun, searchIsolationBreaches },
        get: { getChecks, getIsolationBreaches },
        invalidate: { invalidateChecks, wrongAgentSucceeded, ownerFailed },
        determinism: { determinismChecks, determinismMismatches },
      };
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, "mongo-memory-index-report.json"), JSON.stringify(report, null, 2));

      expect(searchIsolationBreaches).toBe(0);
      expect(getIsolationBreaches).toBe(0);
      expect(wrongAgentSucceeded).toBe(0);
      expect(ownerFailed).toBe(0);
      expect(determinismMismatches).toBe(0);
      expect(invalidateChecks).toBeGreaterThan(0);
      expect(searchesRun).toBeGreaterThan(0);
    },
    30_000,
  );

  it("upsert on an existing id preserves createdAtTick and increments version monotonically", async () => {
    const db = createFakeDb();
    const repo = new MongoMemoryRepository(db);
    const index = new MongoMemoryIndex(db, new FakeEmbedder());
    const first = await index.upsert({ agentId: "a1", content: "v1 lesson", updatedAtTick: 1 });

    const firstDoc = await repo.findForAgent("a1", first.id);
    expect(firstDoc?.version).toBe(1);
    const createdAtTick = firstDoc?.createdAtTick;

    let previousVersion = firstDoc!.version;
    for (let i = 2; i <= 10; i++) {
      await index.upsert({ id: first.id, agentId: "a1", content: `v${i} lesson`, updatedAtTick: i });
      const doc = await repo.findForAgent("a1", first.id);
      expect(doc?.content).toBe(`v${i} lesson`);
      expect(doc?.createdAtTick).toBe(createdAtTick);
      expect(doc!.version).toBeGreaterThan(previousVersion);
      previousVersion = doc!.version;
    }
  });
});
