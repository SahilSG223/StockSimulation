/**
 * Evidence-based lesson governance for MemoryIndex/MongoMemoryIndex. Same rule
 * as `EvalMemoryStore.recordOutcome` (src/evaluation/memory-lab.ts): a loss
 * decays reliability; a loss while the regime estimate no longer matches the
 * lesson's learned regime(s) advances a streak, and crossing the threshold
 * invalidates the lesson. A win reinforces reliability and resets the streak.
 *
 * Pure decision function — callers own persistence (index.upsert for
 * reinforce/decay, index.invalidate for the invalidated case) and the
 * per-lesson loss-streak counter, same division of responsibility as
 * EvalMemoryStore.
 */

/** Consecutive losing outcomes, with the regime mismatched, before invalidating. */
export const INVALIDATE_LOSS_STREAK = 2;

export type LessonOutcomeArgs = {
  reliability: number;
  /** The lesson's learned regime(s); empty means "no regime restriction". */
  scopeRegimes: readonly string[];
  regimeEstimate: string;
  won: boolean;
  /** Loss streak going into this outcome (0 if none, or after a win). */
  lossStreak: number;
  atTick: number;
};

export type LessonOutcomeResult =
  | { action: "reinforce"; reliability: number; lossStreak: number }
  | { action: "decay"; reliability: number; lossStreak: number }
  | { action: "invalidate"; reliability: number; lossStreak: number; reason: string };

/**
 * Fast, short-horizon regime label from one tick of observed index return.
 * Not a replacement for the calibrated estimator (src/market/regime-estimate.ts,
 * which needs 21 prices before it returns anything) — for a short run/demo
 * that never reaches that warmup, this is the only observed-only signal
 * available in time for `scoreLessonOutcome`'s regime-mismatch gate to matter.
 */
export function quickRegimeLabel(return1: number | undefined): string {
  if (return1 === undefined) return "";
  if (return1 < -0.01) return "bear";
  if (return1 > 0.01) return "bull";
  return "sideways";
}

export function scoreLessonOutcome(args: LessonOutcomeArgs): LessonOutcomeResult {
  if (args.won) {
    return { action: "reinforce", reliability: Math.min(0.95, args.reliability + 0.05), lossStreak: 0 };
  }

  const regimeMismatch =
    args.scopeRegimes.length > 0 && !args.scopeRegimes.includes(args.regimeEstimate);
  const lossStreak = regimeMismatch ? args.lossStreak + 1 : 0;
  const reliability = Math.max(0, args.reliability - 0.15);

  if (lossStreak < INVALIDATE_LOSS_STREAK) {
    return { action: "decay", reliability, lossStreak };
  }

  const reason = `lesson lost ${lossStreak} trades in ${args.regimeEstimate || "an unestimated"} regime (learned in ${args.scopeRegimes.join("/") || "no specific regime"}) at tick ${args.atTick}`;
  return { action: "invalidate", reliability, lossStreak, reason };
}
