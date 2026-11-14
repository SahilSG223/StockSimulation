import { describe, expect, it } from "vitest";
import { scoreLessonOutcome } from "../../src/memory/embeddings/lesson-outcome.js";

describe("scoreLessonOutcome", () => {
  it("reinforces on a win and resets the streak", () => {
    const r = scoreLessonOutcome({
      reliability: 0.5,
      scopeRegimes: ["bull"],
      regimeEstimate: "bear",
      won: true,
      lossStreak: 1,
      atTick: 5,
    });
    expect(r).toEqual({ action: "reinforce", reliability: 0.55, lossStreak: 0 });
  });

  it("decays but stays active on a loss with regime match", () => {
    const r = scoreLessonOutcome({
      reliability: 0.5,
      scopeRegimes: ["bull"],
      regimeEstimate: "bull",
      won: false,
      lossStreak: 0,
      atTick: 5,
    });
    expect(r).toEqual({ action: "decay", reliability: 0.35, lossStreak: 0 });
  });

  it("decays but stays active below the invalidate threshold on regime-mismatched loss", () => {
    const r = scoreLessonOutcome({
      reliability: 0.5,
      scopeRegimes: ["bull"],
      regimeEstimate: "bear",
      won: false,
      lossStreak: 0,
      atTick: 5,
    });
    expect(r.action).toBe("decay");
    expect(r.lossStreak).toBe(1);
  });

  it("invalidates once the regime-mismatched loss streak crosses the threshold", () => {
    const r = scoreLessonOutcome({
      reliability: 0.35,
      scopeRegimes: ["bull"],
      regimeEstimate: "bear",
      won: false,
      lossStreak: 1,
      atTick: 7,
    });
    expect(r.action).toBe("invalidate");
    if (r.action === "invalidate") {
      expect(r.reason).toContain("bear");
      expect(r.reason).toContain("bull");
      expect(r.reason).toContain("7");
    }
  });

  it("a regime-agnostic lesson (empty scopeRegimes) never mismatches, so it only decays", () => {
    const r = scoreLessonOutcome({
      reliability: 0.5,
      scopeRegimes: [],
      regimeEstimate: "bear",
      won: false,
      lossStreak: 5,
      atTick: 5,
    });
    expect(r.action).toBe("decay");
    expect(r.lossStreak).toBe(0);
  });

  it("reliability never goes below 0 or above 0.95", () => {
    const low = scoreLessonOutcome({
      reliability: 0.05,
      scopeRegimes: [],
      regimeEstimate: "bear",
      won: false,
      lossStreak: 0,
      atTick: 1,
    });
    expect(low.reliability).toBe(0);
    const high = scoreLessonOutcome({
      reliability: 0.93,
      scopeRegimes: [],
      regimeEstimate: "bear",
      won: true,
      lossStreak: 0,
      atTick: 1,
    });
    expect(high.reliability).toBe(0.95);
  });
});
