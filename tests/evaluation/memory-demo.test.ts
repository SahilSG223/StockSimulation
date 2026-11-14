import { describe, expect, it } from "vitest";
import { runMemoryDemo } from "../../src/evaluation/run-memory-demo.js";
import { demoResultSchema, DEMO_FRAME_PHASES } from "../../src/evaluation/demo-frame.js";

describe("runMemoryDemo", () => {
  it("produces a result matching demoResultSchema with all five phases in order", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    expect(() => demoResultSchema.parse(result)).not.toThrow();
    expect(result.frames.map((f) => f.phase)).toEqual(DEMO_FRAME_PHASES);
  });

  it("is deterministic: same seed+scenario -> deep-equal result", async () => {
    const a = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    const b = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    expect(a).toEqual(b);
  });

  it("act_with_memory cites the lesson and buys SEMI", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    const frame = result.frames.find((f) => f.phase === "act_with_memory")!;
    expect(frame.decision?.memoryReferences).toEqual(["lesson-semi-momentum"]);
    expect(frame.decision?.orders).toEqual([{ symbol: "SEMI", side: "buy", quantity: 5 }]);
    expect(frame.memoriesFired.some((m) => m.status === "active")).toBe(true);
  });

  it("shock reveals the scheduled chaos event", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    const frame = result.frames.find((f) => f.phase === "shock")!;
    expect(frame.events.length).toBeGreaterThan(0);
    expect(result.chaosPlan.length).toBeGreaterThan(0);
  });

  it("govern invalidates the lesson once evidence (losses in a mismatched regime) supports it", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    const frame = result.frames.find((f) => f.phase === "govern")!;
    expect(frame.memoriesFired).toEqual([
      {
        id: "lesson-semi-momentum",
        content: expect.any(String),
        retrievalScore: 0,
        status: "invalidated",
        reason: expect.any(String),
      },
    ]);
    expect(frame.memoriesFired[0]?.reason).toContain("bull");
  });

  it("stable scenario: nothing contradicts the lesson, so it stays active and still fires", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "stable" });
    const govern = result.frames.find((f) => f.phase === "govern")!;
    expect(govern.memoriesFired[0]?.status).toBe("active");
    const afterGovern = result.frames.find((f) => f.phase === "act_after_govern")!;
    expect(afterGovern.decision?.memoryReferences).toEqual(["lesson-semi-momentum"]);
    expect(afterGovern.decision?.orders.length).toBeGreaterThan(0);
  });

  it("act_after_govern holds with no memory citations (stale lesson must not fire)", async () => {
    const result = await runMemoryDemo({ seed: 42, scenarioId: "shock_mid" });
    const frame = result.frames.find((f) => f.phase === "act_after_govern")!;
    expect(frame.decision?.memoryReferences).toEqual([]);
    expect(frame.decision?.orders).toEqual([]);
    expect(frame.memoriesFired).toEqual([]);
  });

  it("stable scenario: no chaos events, still runs the full 5-phase story", async () => {
    const result = await runMemoryDemo({ seed: 1, scenarioId: "stable" });
    expect(result.chaosPlan).toEqual([]);
    expect(result.frames.map((f) => f.phase)).toEqual(DEMO_FRAME_PHASES);
    const shock = result.frames.find((f) => f.phase === "shock")!;
    expect(shock.events).toEqual([]);
  });
});
