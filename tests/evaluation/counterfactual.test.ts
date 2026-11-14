import { describe, expect, it } from "vitest";
import { runOne } from "../../src/evaluation/index.js";
import { memoryAwarePolicy } from "../../src/evaluation/policies.js";
import type { DecisionContext } from "../../src/evaluation/types.js";
import type { MemoryRecord } from "../../src/memory/governance/index.js";

/**
 * The counterfactual re-runs a decision with memories withheld. It must be a pure
 * function of the context — it never touches the engine — so simulation truth is
 * identical with or without it.
 */
describe("counterfactual has no simulation side effects", () => {
  it("leaves the market trajectory identical across all memory modes (same seed)", () => {
    const none = runOne({ scenario: "regime_reversal", seed: 9, memoryMode: "none" });
    const raw = runOne({ scenario: "regime_reversal", seed: 9, memoryMode: "raw" });
    const governed = runOne({ scenario: "regime_reversal", seed: 9, memoryMode: "governed" });
    const frames = (r: typeof none) => r.market.map((f) => ({ tick: f.tick, prices: f.prices }));
    expect(frames(raw)).toEqual(frames(none));
    expect(frames(governed)).toEqual(frames(none));
  });

  it("records a counterfactual exactly when a memory fired", () => {
    const run = runOne({ scenario: "regime_reversal", seed: 9, memoryMode: "governed" });
    for (const d of run.decisions) {
      const fired = d.decision.firedMemoryIds.length > 0;
      expect(d.counterfactual !== null).toBe(fired);
      if (d.counterfactual) {
        expect(typeof d.counterfactual.changed).toBe("boolean");
      }
    }
  });

  it("does not mutate the decision context and is deterministic", () => {
    const memory: MemoryRecord = {
      id: "mem-1",
      agentId: "momentum",
      type: "semantic",
      content: "momentum momentum profitable in Semiconductors",
      sourceExperienceIds: [],
      createdAtTick: 5,
      updatedAtTick: 5,
      confidence: 0.6,
      reliability: 0.7,
      scope: { sectors: ["Semiconductors"], regimes: ["bull"], eventTypes: [], assets: [] },
      status: "active",
      version: 1,
    };
    const ctx: DecisionContext = {
      agentId: "momentum",
      archetype: "momentum",
      tick: 10,
      prices: { SEMI: 100, TECH: 50 },
      history: new Map([
        ["SEMI", [90, 92, 95, 97, 99, 100]],
        ["TECH", [48, 49, 49, 50, 50, 50]],
      ]),
      portfolio: {
        agentId: "momentum",
        cash: 100_000,
        positions: [],
        realizedPnl: 0,
        unrealizedPnl: 0,
        equity: 100_000,
      },
      sectorOf: (s) => (s === "SEMI" ? "Semiconductors" : "Technology"),
      regimeEstimate: "bull",
      memories: [{ memory, retrievalScore: 0.9 }],
    };
    const snapshot = JSON.stringify({ ...ctx, history: [...ctx.history], sectorOf: undefined });

    const withMem = memoryAwarePolicy(ctx);
    const withMemAgain = memoryAwarePolicy(ctx);
    const withheld = memoryAwarePolicy({ ...ctx, memories: [] });

    // Pure: same input → same output; context untouched by either call.
    expect(withMem).toEqual(withMemAgain);
    expect(JSON.stringify({ ...ctx, history: [...ctx.history], sectorOf: undefined })).toBe(snapshot);
    // The lesson fired, so withholding it changes the action (this is the flip).
    expect(withMem.firedMemoryIds).toEqual(["mem-1"]);
    expect(withheld.firedMemoryIds).toEqual([]);
  });
});
