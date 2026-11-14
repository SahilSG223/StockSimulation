/**
 * The evaluation uses the same regime estimate as the live run (MarketFeed /
 * estimateRegime), which is unknown until there is enough history. An unknown
 * estimate must never be treated as a regime (issue #23).
 */
import { describe, expect, it } from "vitest";
import { EvalMemoryStore } from "../../src/evaluation/memory-lab.js";
import { runOne } from "../../src/evaluation/runner.js";

function lessonStore(regimeEstimate: string | undefined) {
  const store = new EvalMemoryStore("governed");
  store.consolidate({
    agentId: "momentum",
    tick: 10,
    regimeEstimate,
    regimeTruth: "bull",
    sector: "Semiconductors",
    strategy: "momentum",
  });
  return store;
}

describe("evaluation memory with an unknown regime estimate", () => {
  it("lessons learned before the estimate exists are regime-agnostic", () => {
    expect(lessonStore(undefined).all()[0]!.scope.regimes).toEqual([]);
    expect(lessonStore("bull").all()[0]!.scope.regimes).toEqual(["bull"]);
  });

  it("governed retrieval does not filter by regime while the regime is unknown", () => {
    const store = lessonStore("bull");
    const args = { agentId: "momentum", tick: 11, sectors: ["Semiconductors"] };
    expect(store.retrieve({ ...args, regimeEstimate: undefined })).toHaveLength(1);
    expect(store.retrieve({ ...args, regimeEstimate: "bull" })).toHaveLength(1);
    expect(store.retrieve({ ...args, regimeEstimate: "bear" })).toHaveLength(0);
  });

  it("an unknown estimate can't contradict a lesson's regime; a known mismatch can", () => {
    const unknown = lessonStore("bull");
    const id = unknown.all()[0]!.id;
    for (let t = 12; t < 20; t++) {
      expect(
        unknown.recordOutcome({ memoryId: id, won: false, atTick: t, regimeEstimate: undefined }),
      ).toEqual([]);
    }
    expect(unknown.all()[0]!.status).toBe("active");

    const mismatched = lessonStore("bull");
    const events = [12, 13].flatMap((t) =>
      mismatched.recordOutcome({ memoryId: id, won: false, atTick: t, regimeEstimate: "bear" }),
    );
    expect(events).toEqual([expect.objectContaining({ from: "active", to: "invalidated" })]);
  });

  it("a full run uses memory both before and after the estimate appears (tick 21)", () => {
    const run = runOne({ scenario: "regime_reversal", seed: 3, memoryMode: "governed" });
    const early = run.decisions.filter((d) => d.tick < 21).flatMap((d) => d.retrieved);
    const late = run.decisions.filter((d) => d.tick >= 21);
    expect(run.decisions.some((d) => d.tick < 21)).toBe(true);
    // Early lessons exist (memory works before the estimate) …
    expect(early.length).toBeGreaterThan(0);
    // … and governance still acts later, once the estimate is known.
    expect(late.length).toBeGreaterThan(0);
  });
});
