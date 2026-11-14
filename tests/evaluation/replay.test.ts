import { describe, expect, it } from "vitest";
import { buildReplay, runOne, replaySchema, MEMORY_MODES } from "../../src/evaluation/index.js";

const SEED = 97; // the demo seed (REPLAY_SEED in src/evaluation/replay.ts)
const SCENARIO = "regime_reversal" as const;

describe("replay contract (Memory Arena viewer)", () => {
  it("emits a schema-valid document for every memory mode", () => {
    for (const memoryMode of MEMORY_MODES) {
      const run = runOne({ scenario: SCENARIO, seed: SEED, memoryMode });
      const replay = buildReplay(run);
      // buildReplay parses internally; re-parsing asserts the contract explicitly.
      expect(() => replaySchema.parse(replay)).not.toThrow();
      expect(replay.memoryMode).toBe(memoryMode);
    }
  });

  it("has contiguous frames 0..ticks, each with every agent, and a summary per agent", () => {
    const run = runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "governed" });
    const replay = buildReplay(run);
    const agentSet = [...run.agents].sort();

    expect(replay.frames).toHaveLength(run.ticks + 1);
    replay.frames.forEach((f, i) => {
      expect(f.tick).toBe(i);
      expect(f.agents.map((a) => a.agentId).sort()).toEqual(agentSet);
    });
    expect(Object.keys(replay.summary).sort()).toEqual(agentSet);
  });

  it("couples the counterfactual to a fired memory, and `none` withholds memory entirely", () => {
    const governed = buildReplay(runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "governed" }));
    for (const f of governed.frames) {
      for (const a of f.agents) {
        const fired = a.memories.some((m) => m.fired);
        // A counterfactual exists precisely when a memory changed the action.
        expect(a.counterfactual !== null).toBe(fired);
      }
    }

    const none = buildReplay(runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "none" }));
    for (const f of none.frames) {
      for (const a of f.agents) {
        expect(a.memories).toHaveLength(0);
        expect(a.counterfactual).toBeNull();
      }
    }
  });

  it("surfaces every lifecycle event in its tick's frame", () => {
    const run = runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "governed" });
    const replay = buildReplay(run);
    const inFrames = replay.frames.flatMap((f) =>
      f.lifecycleEvents.map((e) => `${e.atTick}|${e.agentId}|${e.memoryId}|${e.to}`),
    );
    const expected = run.lifecycle.map((e) => `${e.atTick}|${e.agentId}|${e.memoryId}|${e.to}`);
    expect(inFrames.sort()).toEqual(expected.sort());
    // Each lifecycle event is filed under the frame whose tick matches.
    for (const f of replay.frames) {
      for (const e of f.lifecycleEvents) expect(e.atTick).toBe(f.tick);
    }
  });

  it("is deterministic for a fixed (scenario, seed, mode)", () => {
    const a = buildReplay(runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "governed" }));
    const b = buildReplay(runOne({ scenario: SCENARIO, seed: SEED, memoryMode: "governed" }));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
