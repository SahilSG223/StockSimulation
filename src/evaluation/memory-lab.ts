/**
 * Local memory adapter for the three evaluation modes. It stores semantic
 * lessons as `MemoryRecord`s (the governance type) and differs only in how it
 * retrieves and governs them:
 *
 *   none      — never stores or retrieves; pure observation-only baseline.
 *   raw       — stores lessons, retrieves top-k by content similarity ALONE,
 *               ignoring lifecycle status, reliability, and scope. Lessons carry
 *               no regime in their text, so raw is regime-blind: it keeps firing a
 *               bull lesson in a bear market. Stale lessons keep firing.
 *   governed  — a retrieval pipeline: a metadata filter drops lessons whose
 *               learned regime is incompatible with the estimated regime, then
 *               `rankMemories` (active-only, reliability/temporal weighted) ranks
 *               the survivors. In parallel, when a lesson's fired trades keep
 *               losing in a regime different from the one it was learned in,
 *               reliability decays and `handleContradiction` invalidates/narrows it.
 *
 * Two guards keep this honest. The regime estimate (see `RegimeEstimator`) gates
 * the filter; it reads high_vol from variance (strong signal) and bull/bear from a
 * hysteretic mean (weak signal). Invalidation is additionally outcome-gated — a
 * lesson must actually lose in a mismatched regime — so a low-SNR mean estimate
 * alone can't retire a still-good lesson.
 *
 * Agent isolation is enforced in the query for ALL modes (a hard rule): raw is
 * "ungoverned lifecycle", not "can read another agent's memories".
 */
import {
  handleContradiction,
  rankMemories,
  roughSemanticSimilarity,
  type MemoryRecord,
} from "../memory/governance/index.js";
import type { RegimeId } from "../simulation/index.js";
import type { EvalLifecycleEvent, MemoryMode, RetrievedMemory } from "./types.js";

const MEMORY_TOP_K = 3;
/**
 * Consecutive losing fired trades — while the estimated regime no longer matches
 * the lesson's learned regime — before a governed lesson is invalidated. Gating
 * on regime mismatch is what keeps noise during a stable regime (where a lesson
 * can lose a few single-tick trades by chance) from invalidating a still-good
 * lesson: there, est == scope regime, so the streak never advances.
 */
const INVALIDATE_LOSS_STREAK = 2;

/**
 * Lesson text deliberately carries sector/strategy but NOT the regime: the regime
 * lives only in `scope.regimes`. This is what separates the modes — raw retrieves
 * on content similarity alone, so it is regime-blind and keeps firing a bull
 * lesson in a bear market; governed reads `scope` and filters by regime context.
 */
function lessonContent(strategy: string, sector: string): string {
  return `${strategy} momentum profitable in ${sector}`;
}
function retrievalQuery(sectors: readonly string[]): string {
  return `momentum ${sectors.join(" ")}`;
}

export class EvalMemoryStore {
  private readonly memories: MemoryRecord[] = [];
  /** dedupe key (agent|sector|regime) → id of the active lesson, so we reinforce. */
  private readonly activeByKey = new Map<string, string>();
  /** Ground-truth regime at creation — metrics only; never shown to agents. */
  private readonly creationRegime = new Map<string, RegimeId>();
  /** Consecutive losing fired trades per memory (governed reliability signal). */
  private readonly lossStreak = new Map<string, number>();
  private counter = 0;

  constructor(private readonly mode: MemoryMode) {}

  all(): readonly MemoryRecord[] {
    return this.memories;
  }

  creationRegimeOf(id: string): RegimeId | undefined {
    return this.creationRegime.get(id);
  }

  private indexOf(id: string): number {
    return this.memories.findIndex((m) => m.id === id);
  }

  /**
   * Consolidate a profitable buy into a semantic lesson (scoped to the inferred
   * regime). Reinforces an existing active lesson for the same agent/sector/regime
   * instead of spamming one memory per trade.
   */
  consolidate(args: {
    agentId: string;
    tick: number;
    regimeEstimate: string;
    regimeTruth: RegimeId;
    sector: string;
    strategy: string;
  }): void {
    if (this.mode === "none") return;
    const key = `${args.agentId}|${args.sector}|${args.regimeEstimate}`;
    const existingId = this.activeByKey.get(key);
    if (existingId !== undefined) {
      const i = this.indexOf(existingId);
      const prev = this.memories[i]!;
      this.memories[i] = {
        ...prev,
        confidence: Math.min(0.95, prev.confidence + 0.05),
        reliability: Math.min(0.95, prev.reliability + 0.08),
        updatedAtTick: args.tick,
        version: prev.version + 1,
      };
      return;
    }
    const id = `mem-${(this.counter += 1)}`;
    this.memories.push({
      id,
      agentId: args.agentId,
      type: "semantic",
      content: lessonContent(args.strategy, args.sector),
      sourceExperienceIds: [],
      createdAtTick: args.tick,
      updatedAtTick: args.tick,
      confidence: 0.5,
      reliability: 0.55,
      scope: { sectors: [args.sector], regimes: [args.regimeEstimate], eventTypes: [], assets: [] },
      status: "active",
      version: 1,
    });
    this.activeByKey.set(key, id);
    this.creationRegime.set(id, args.regimeTruth);
  }

  /** Mode-specific retrieval. Always isolated to `agentId`. */
  retrieve(args: {
    agentId: string;
    tick: number;
    regimeEstimate: string;
    sectors: readonly string[];
  }): RetrievedMemory[] {
    if (this.mode === "none") return [];
    const query = retrievalQuery(args.sectors);

    if (this.mode === "governed") {
      // Governed retrieval is a pipeline: metadata filter THEN semantic ranking.
      // The filter drops lessons whose learned regime is incompatible with the
      // current estimate (a regime-agnostic lesson — empty scope — passes), so a
      // bull lesson simply isn't a candidate in an estimated bear market.
      // `rankMemories` already excludes non-active (invalidated/superseded) memories.
      return rankMemories({
        memories: this.memories,
        ctx: {
          agentId: args.agentId,
          tick: args.tick,
          regimeEstimate: args.regimeEstimate,
          sectors: [...args.sectors],
        },
        query,
      })
        .filter(
          (r) =>
            r.memory.scope.regimes.length === 0 ||
            r.memory.scope.regimes.includes(args.regimeEstimate),
        )
        .slice(0, MEMORY_TOP_K)
        .map((r) => ({ memory: r.memory, retrievalScore: r.retrievalScore }));
    }

    // raw: similarity only, status/scope/reliability ignored — stale lessons fire.
    return this.memories
      .filter((m) => m.agentId === args.agentId)
      .map((m) => ({ memory: m, retrievalScore: roughSemanticSimilarity(m.content, query) }))
      .filter((r) => r.retrievalScore > 0)
      .sort((a, b) => b.retrievalScore - a.retrievalScore || a.memory.id.localeCompare(b.memory.id))
      .slice(0, MEMORY_TOP_K);
  }

  /**
   * Governed-only: feed back the outcome of a trade a lesson fired, in the regime
   * estimated at the time. Winning trades bump reliability and reset the loss
   * streak; losing trades decay it. The invalidation streak only advances on a
   * loss while the estimated regime differs from the lesson's learned regime —
   * the signature of a lesson outliving the conditions it was learned in. Once it
   * crosses the threshold the lesson is treated as contradicted and invalidated
   * (single-regime) or narrowed (multi-regime). Returns any status transition.
   */
  recordOutcome(args: {
    memoryId: string;
    won: boolean;
    atTick: number;
    regimeEstimate: string;
  }): EvalLifecycleEvent[] {
    if (this.mode !== "governed") return [];
    const i = this.indexOf(args.memoryId);
    if (i < 0) return [];
    const m = this.memories[i]!;
    if (m.status !== "active") return [];

    if (args.won) {
      this.lossStreak.set(m.id, 0);
      this.memories[i] = {
        ...m,
        reliability: Math.min(0.95, m.reliability + 0.05),
        updatedAtTick: args.atTick,
      };
      return [];
    }

    const regimeMismatch = !m.scope.regimes.includes(args.regimeEstimate);
    const streak = regimeMismatch ? (this.lossStreak.get(m.id) ?? 0) + 1 : 0;
    this.lossStreak.set(m.id, streak);
    const decayed: MemoryRecord = {
      ...m,
      reliability: Math.max(0, m.reliability - 0.15),
      updatedAtTick: args.atTick,
    };
    if (streak < INVALIDATE_LOSS_STREAK) {
      this.memories[i] = decayed;
      return [];
    }

    const reason = `lesson lost ${streak} trades in ${args.regimeEstimate} regime (learned in ${m.scope.regimes.join("/")})`;
    const result = handleContradiction({
      memory: decayed,
      ...(decayed.scope.regimes[0] !== undefined ? { newRegime: decayed.scope.regimes[0] } : {}),
      atTick: args.atTick,
      reason,
    });
    this.memories[i] = result.memory;
    if (result.memory.status === m.status) return [];
    // Drop from the active dedupe index so it is not reinforced later.
    for (const [k, id] of this.activeByKey) if (id === m.id) this.activeByKey.delete(k);
    return [
      { agentId: m.agentId, memoryId: m.id, from: m.status, to: result.memory.status, reason, atTick: args.atTick },
    ];
  }
}

/**
 * Regime label estimated from visible cross-sectional returns — an estimate,
 * never the engine's ground-truth label. Used to tag a lesson's scope and to
 * filter/rank retrieval.
 *
 * Two signals, in order of signal-to-noise:
 *   1. Variance — high_vol's realized spread (~7e-4 EWMA) separates cleanly from
 *      bull/bear (~1e-4/2e-4), so a variance gate detects it reliably even though
 *      its mean drift is ~0. Checked first.
 *   2. Mean — bull vs bear from a sticky EMA with a hysteresis band, so a run of
 *      noise doesn't flap the label. Low SNR (drift ±0.0008 vs vol ~0.01), hence
 *      the band; this is why invalidation is outcome-gated, not estimate-gated.
 */
export class RegimeEstimator {
  private ema = 0;
  private varEma = 0;
  private current: string;
  constructor(
    initial = "bull",
    private readonly alpha = 0.12,
    private readonly threshold = 0.0012,
    private readonly varAlpha = 0.3,
    private readonly varThreshold = 3.2e-4,
  ) {
    this.current = initial;
  }
  update(crossSectionalMeanReturn: number): string {
    this.ema = this.alpha * crossSectionalMeanReturn + (1 - this.alpha) * this.ema;
    this.varEma =
      this.varAlpha * crossSectionalMeanReturn * crossSectionalMeanReturn +
      (1 - this.varAlpha) * this.varEma;
    if (this.varEma > this.varThreshold) this.current = "high_vol";
    else if (this.ema > this.threshold) this.current = "bull";
    else if (this.ema < -this.threshold) this.current = "bear";
    // within the band: keep the previous estimate (sticky).
    return this.current;
  }
  get estimate(): string {
    return this.current;
  }
}
