import { describe, expect, it } from "vitest";
import { runOne } from "../../src/evaluation/index.js";
import { MEMORY_MODES } from "../../src/evaluation/index.js";

describe("evaluation determinism", () => {
  it("produces byte-identical run records for the same (scenario, seed, mode)", () => {
    for (const memoryMode of MEMORY_MODES) {
      const a = runOne({ scenario: "regime_reversal", seed: 7, memoryMode });
      const b = runOne({ scenario: "regime_reversal", seed: 7, memoryMode });
      expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    }
  });

  it("gives a stable runId derived from inputs (no random UUIDs)", () => {
    const run = runOne({ scenario: "shock", seed: 3, memoryMode: "governed" });
    expect(run.runId).toBe("shock-governed-seed3");
  });

  it("changes the market trajectory when the seed changes", () => {
    const a = runOne({ scenario: "stable", seed: 1, memoryMode: "none" });
    const b = runOne({ scenario: "stable", seed: 2, memoryMode: "none" });
    expect(a.market.map((f) => f.prices)).not.toEqual(b.market.map((f) => f.prices));
  });
});
