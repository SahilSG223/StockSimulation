/**
 * Writes one Memory Arena replay per memory mode for the regime_reversal scenario
 * at a fixed seed: `out/replay-<mode>.json` (the `app/` viewer serves copies of
 * these). It pivots the `RunRecord` decision log into contiguous per-tick frames
 * (tick 0 = the pre-trade opening; warm-up ticks = agents watching, flat), each
 * carrying every agent's authoritative snapshot, and computes the derived viewer
 * fields (marketHealth, volatility, trade line `style`, netPnl, cumulative fees,
 * per-run `summary`). The result is Zod-validated and fails closed on mismatch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeRunMetrics } from "./metrics.js";
import { runOne } from "./runner.js";
import {
  REPLAY_VERSION,
  replaySchema,
  type AgentFrame,
  type LineStyle,
  type MarketHealth,
  type Replay,
  type ReplayFrame,
} from "./replay-schema.js";
import type { DecisionLogEntry, MemoryMode, RunRecord } from "./types.js";
import { MEMORY_MODES } from "./types.js";

const REPLAY_SCENARIO = "regime_reversal" as const;
/**
 * Demo seed, picked by scanning seeds 1–100 with the shared regime estimate
 * (#23): only 18/100 seeds trip any invalidation, and only 97 and 76 combine
 * ≥5 invalidations with governed equity ≥ raw and lower stale influence. Seed 97:
 * 6 invalidations, mean equity 105,013 vs raw 104,280, stale 0.26 vs 0.89. This is
 * a chosen seed, not a typical one; see src/evaluation/out/report.md for the
 * 20-seed averages. Re-scan if the simulation version or governance changes.
 */
const REPLAY_SEED = 97;
const REASONING_MAX = 400;
/** Rolling windows for the per-tick market-health label and volatility estimate. */
const HEALTH_WINDOW = 5;
const HEALTH_THRESHOLD = 0.002;
const VOL_WINDOW = 10;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** zigzag = big bet, wavy = small, straight = mid; low confidence overrides to dashed. */
function lineStyle(notionalPctEquity: number, confidence: number): LineStyle {
  if (confidence < 0.4) return "dashed";
  if (notionalPctEquity >= 0.15) return "zigzag";
  if (notionalPctEquity < 0.05) return "wavy";
  return "straight";
}

/** Compound market return over the trailing HEALTH_WINDOW frames → coarse label. */
function marketHealth(returns: readonly number[], upTo: number): MarketHealth {
  const window = returns.slice(Math.max(0, upTo - HEALTH_WINDOW + 1), upTo + 1);
  const rolling = window.reduce((acc, r) => acc * (1 + r), 1) - 1;
  if (rolling > HEALTH_THRESHOLD) return "good";
  if (rolling < -HEALTH_THRESHOLD) return "bad";
  return "neutral";
}

/** Population std of market returns over the trailing VOL_WINDOW frames. */
function volatility(returns: readonly number[], upTo: number): number {
  const window = returns.slice(Math.max(0, upTo - VOL_WINDOW + 1), upTo + 1);
  if (window.length === 0) return 0;
  const mean = window.reduce((s, r) => s + r, 0) / window.length;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / window.length;
  return Math.sqrt(variance);
}

/** The filled order that moved the most money this tick (drives the animated line). */
function primaryFill(entry: DecisionLogEntry):
  | { symbol: string; side: "buy" | "sell"; quantity: number; notional: number }
  | undefined {
  let best: { symbol: string; side: "buy" | "sell"; quantity: number; notional: number } | undefined;
  for (const r of entry.results) {
    if (r.status !== "filled") continue;
    if (!best || r.notional > best.notional) {
      best = { symbol: r.order.symbol, side: r.order.side, quantity: r.order.quantity, notional: r.notional };
    }
  }
  return best;
}

function cfStatus(orders: readonly { symbol: string; side: "buy" | "sell" }[]): string {
  const o = orders[0];
  if (!o) return "Hold";
  return `${o.side === "buy" ? "Buy" : "Sell"} ${o.symbol}`;
}

function buildAgentFrame(args: {
  run: RunRecord;
  agentId: string;
  entry: DecisionLogEntry | undefined;
  feesSoFar: number;
  firstAsset: string;
}): { frame: AgentFrame; feesThisTick: number } {
  const { run, agentId, entry, firstAsset } = args;
  const startingCash = run.startingCash;

  if (!entry) {
    return {
      feesThisTick: 0,
      frame: {
        agentId,
        status: `Watching ${firstAsset}`,
        reasoning: `Warm-up: observing the market; no trades before tick ${run.warmup + 1}.`,
        strategy: agentId,
        confidence: 0.3,
        interaction: null,
        portfolio: {
          startingCash,
          cash: startingCash,
          equity: startingCash,
          realizedPnl: 0,
          unrealizedPnl: 0,
          feesPaid: args.feesSoFar,
          netPnl: 0,
          holdings: [],
        },
        memories: [],
        counterfactual: null,
      },
    };
  }

  const pf = entry.portfolioAfter;
  const equity = pf.equity;
  const feesThisTick = entry.results.reduce((s, r) => (r.status === "filled" ? s + r.fee : s), 0);
  const feesPaid = args.feesSoFar + feesThisTick;
  const primary = primaryFill(entry);
  const confidence = entry.decision.confidence;

  const topHolding = [...pf.positions].sort((a, b) => b.quantity - a.quantity)[0];
  const status = primary
    ? `${primary.side === "buy" ? "Buying" : "Selling"} ${primary.symbol}`
    : pf.positions.length > 0
      ? `Holding ${topHolding?.symbol ?? firstAsset}`
      : `Watching ${firstAsset}`;

  const interaction = primary
    ? {
        kind: primary.side,
        style: lineStyle(equity > 0 ? primary.notional / equity : 0, confidence),
        symbol: primary.symbol,
        quantity: primary.quantity,
        notional: r2(primary.notional),
        notionalPctEquity: r4(equity > 0 ? primary.notional / equity : 0),
      }
    : null;

  const counterfactual = entry.counterfactual
    ? {
        withoutMemory: {
          status: cfStatus(entry.counterfactual.withoutOrders),
          orders: entry.counterfactual.withoutOrders.map((o) => ({
            symbol: o.symbol,
            side: o.side,
            quantity: o.quantity,
          })),
        },
        changed: entry.counterfactual.changed,
      }
    : null;

  return {
    feesThisTick,
    frame: {
      agentId,
      status,
      reasoning: entry.decision.reasoning.slice(0, REASONING_MAX),
      strategy: entry.archetype,
      confidence,
      interaction,
      portfolio: {
        startingCash,
        cash: r2(pf.cash),
        equity: r2(equity),
        realizedPnl: r2(pf.realizedPnl),
        unrealizedPnl: r2(pf.unrealizedPnl),
        feesPaid: r2(feesPaid),
        netPnl: r2(equity - startingCash),
        holdings: pf.positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity })),
      },
      memories: entry.retrieved.map((m) => ({
        id: m.id,
        content: m.content,
        status: m.status,
        confidence: r2(m.confidence),
        reliability: r2(m.reliability),
        retrievalScore: r2(m.retrievalScore),
        createdAtTick: m.createdAtTick,
        fired: m.fired,
      })),
      counterfactual,
    },
  };
}

export function buildReplay(run: RunRecord): Replay {
  const metrics = computeRunMetrics(run);
  const firstAsset = run.assets[0]?.symbol ?? "TECH";
  const openingRegime = run.regimeChanges[0]?.regime ?? run.market[0]?.regime ?? "bull";
  const openingPrices = run.market[0]?.prices ?? {};

  // Index decisions and lifecycle events by tick for O(1) per-frame assembly.
  const entryByTickAgent = new Map<string, DecisionLogEntry>();
  for (const d of run.decisions) entryByTickAgent.set(`${d.tick}|${d.agentId}`, d);
  const lifecycleByTick = new Map<number, RunRecord["lifecycle"]>();
  for (const ev of run.lifecycle) {
    (lifecycleByTick.get(ev.atTick) ?? lifecycleByTick.set(ev.atTick, []).get(ev.atTick)!).push(ev);
  }

  // Scaffold contiguous frames 0..ticks (frame index === tick). Tick 0 is the
  // pre-trade opening; ticks 1..N come from the recorded market frames.
  const scaffold = Array.from({ length: run.ticks + 1 }, (_, t) => {
    const mf = t === 0 ? undefined : run.market[t - 1];
    return {
      tick: t,
      regime: mf?.regime ?? openingRegime,
      marketReturn: mf?.marketReturn ?? 0,
      prices: mf?.prices ?? openingPrices,
    };
  });
  const returns = scaffold.map((s) => s.marketReturn);

  const feesByAgent = new Map<string, number>();
  const frames: ReplayFrame[] = scaffold.map((s, i) => {
    const agents = run.agents.map((agentId) => {
      const entry = entryByTickAgent.get(`${s.tick}|${agentId}`);
      const { frame, feesThisTick } = buildAgentFrame({
        run,
        agentId,
        entry,
        feesSoFar: feesByAgent.get(agentId) ?? 0,
        firstAsset,
      });
      feesByAgent.set(agentId, (feesByAgent.get(agentId) ?? 0) + feesThisTick);
      return frame;
    });
    return {
      tick: s.tick,
      regime: s.regime,
      marketReturn: s.marketReturn,
      marketHealth: i === 0 ? marketHealth(returns, 1) : marketHealth(returns, i),
      volatility: r4(i === 0 ? volatility(returns, 1) : volatility(returns, i)),
      prices: { ...s.prices },
      agents,
      lifecycleEvents: (lifecycleByTick.get(s.tick) ?? []).map((ev) => ({
        agentId: ev.agentId,
        memoryId: ev.memoryId,
        from: ev.from,
        to: ev.to,
        reason: ev.reason,
        atTick: ev.atTick,
      })),
    };
  });

  const summary: Replay["summary"] = {};
  for (const agentId of run.agents) {
    const m = metrics[agentId];
    if (!m) continue;
    summary[agentId] = {
      ticksToAdapt: m.ticksToAdapt ?? run.ticks,
      staleInfluenceRate: r4(m.staleInfluenceRate),
      repeatedMistakes: m.repeatedMistakes,
      flipRate: r4(m.flipRate),
      finalEquity: r2(m.finalEquity),
    };
  }

  const replay: Replay = {
    version: REPLAY_VERSION,
    runId: run.runId,
    scenario: run.scenario,
    seed: run.seed,
    memoryMode: run.memoryMode,
    ticks: run.ticks,
    warmup: run.warmup,
    startingCash: run.startingCash,
    assets: run.assets,
    regimeTimeline: run.regimeChanges,
    events: run.events.map((ev) => ({
      tick: ev.tick,
      id: ev.id,
      type: ev.type,
      headline: ev.headline,
      affectedSectors: [...(ev.affectedSectors ?? [])],
    })),
    frames,
    summary,
  };
  // Fail closed: a replay that doesn't match the contract must not be written.
  return replaySchema.parse(replay);
}

export function writeReplays(): string[] {
  mkdirSync(OUT_DIR, { recursive: true });
  const paths: string[] = [];
  for (const mode of MEMORY_MODES) {
    const run = runOne({ scenario: REPLAY_SCENARIO, seed: REPLAY_SEED, memoryMode: mode });
    const replay = buildReplay(run);
    const path = join(OUT_DIR, `replay-${mode}.json`);
    writeFileSync(path, JSON.stringify(replay));
    paths.push(path);
  }
  return paths;
}

export type { MemoryMode };

// Direct-run entrypoint: `pnpm tsx src/evaluation/replay.ts`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const path of writeReplays()) console.log(`wrote ${path}`);
}
