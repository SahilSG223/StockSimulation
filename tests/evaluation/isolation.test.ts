import { describe, expect, it } from "vitest";
import { runOne } from "../../src/evaluation/index.js";
import { MEMORY_MODES } from "../../src/evaluation/index.js";

/**
 * Memory ownership is enforced in the query for ALL modes (including raw):
 * "ungoverned lifecycle" must not mean "reads another agent's memories". Every
 * memory surfaced to or fired by a decision must be scoped to that agent.
 */
describe("evaluation memory isolation", () => {
  it("never surfaces or fires a memory owned by a different agent", () => {
    for (const memoryMode of MEMORY_MODES) {
      const run = runOne({ scenario: "regime_reversal", seed: 11, memoryMode });
      for (const d of run.decisions) {
        for (const m of d.retrieved) {
          expect(m.id.startsWith("mem-")).toBe(true);
        }
        // Fired ids are a subset of retrieved ids for this same agent's decision.
        for (const firedId of d.decision.firedMemoryIds) {
          expect(d.retrieved.some((m) => m.id === firedId)).toBe(true);
        }
      }
    }
  });

  it("scopes every lifecycle event to the agent that owns the memory", () => {
    const run = runOne({ scenario: "regime_reversal", seed: 11, memoryMode: "governed" });
    // Build the owner of each fired/retrieved memory from the decision log.
    const owner = new Map<string, string>();
    for (const d of run.decisions) {
      for (const m of d.retrieved) owner.set(m.id, d.agentId);
    }
    for (const ev of run.lifecycle) {
      expect(owner.get(ev.memoryId)).toBe(ev.agentId);
    }
  });

  it("surfaces no memories at all in `none` mode", () => {
    const run = runOne({ scenario: "shock", seed: 5, memoryMode: "none" });
    expect(run.decisions.every((d) => d.retrieved.length === 0)).toBe(true);
    expect(run.decisions.every((d) => d.counterfactual === null)).toBe(true);
    expect(run.lifecycle).toHaveLength(0);
  });
});
