/**
 * Writes one demo replay file per memory mode for the regime_reversal scenario at
 * a fixed seed: `out/replay-<mode>.json`. The schema in `replay-schema.ts` is a
 * contract the frontend consumes; this module computes the derived presentation
 * fields (style, marketHealth, netPnl, cumulative feesPaid) so the UI doesn't
 * have to, validates the result with Zod, and fails closed if it doesn't match.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOne } from "./runner.js";
import {
  REPLAY_VERSION,
  replaySchema,
  type LineStyle,
  type MarketHealth,
  type Replay,
} from "./replay-schema.js";
import { MEMORY_MODES, type MemoryMode, type RunRecord } from "./types.js";

const REPLAY_SCENARIO = "regime_reversal" as const;
const REPLAY_SEED = 42;
const REASONING_MAX = 400;
/** Rolling window and threshold for the per-tick market-health label. */
const HEALTH_WINDOW = 5;
const HEALTH_THRESHOLD = 0.002;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

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

export function buildReplay(run: RunRecord): Replay {
  const marketReturns = run.market.map((f) => f.marketReturn);
  const frames = run.market.map((f, i) => ({
    tick: f.tick,
    regime: f.regime,
    marketReturn: f.marketReturn,
    marketHealth: marketHealth(marketReturns, i),
    prices: { ...f.prices },
  }));

  const agents = run.agents.map((agentId) => {
    const entries = run.decisions
      .filter((d) => d.agentId === agentId)
      .sort((a, b) => a.tick - b.tick);
    let cumulativeFees = 0;
    const decisions = entries.map((e) => {
      const filledNotional = e.results.reduce(
        (sum, r) => (r.status === "filled" ? sum + r.notional : sum),
        0,
      );
      cumulativeFees += e.results.reduce((sum, r) => (r.status === "filled" ? sum + r.fee : sum), 0);
      const equity = e.portfolioAfter.equity;
      const notionalPctEquity = equity > 0 ? filledNotional / equity : 0;
      return {
        tick: e.tick,
        regime: e.regime,
        orders: e.results.map((r) =>
          r.status === "filled"
            ? {
                symbol: r.order.symbol,
                side: r.order.side,
                quantity: r.order.quantity,
                status: "filled" as const,
                fillPrice: r.fillPrice,
                notional: r.notional,
                fee: r.fee,
              }
            : {
                symbol: r.order.symbol,
                side: r.order.side,
                quantity: r.order.quantity,
                status: "rejected" as const,
                rejectReason: r.reason,
              },
        ),
        equity,
        netPnl: equity - run.startingCash,
        feesPaid: cumulativeFees,
        confidence: e.decision.confidence,
        style: lineStyle(notionalPctEquity, e.decision.confidence),
        reasoning: e.decision.reasoning.slice(0, REASONING_MAX),
        firedMemories: e.retrieved
          .filter((m) => m.fired)
          .map((m) => ({
            id: m.id,
            content: m.content,
            status: m.status,
            reliability: m.reliability,
            creationRegime: m.creationRegime,
          })),
        counterfactualChanged: e.counterfactual === null ? null : e.counterfactual.changed,
      };
    });
    return { agentId, archetype: entries[0]?.archetype ?? agentId, decisions };
  });

  const replay: Replay = {
    version: REPLAY_VERSION,
    scenario: run.scenario,
    seed: run.seed,
    memoryMode: run.memoryMode,
    ticks: run.ticks,
    warmup: run.warmup,
    startingCash: run.startingCash,
    assets: run.assets,
    events: run.events.map((ev) => ({
      tick: ev.tick,
      type: ev.type,
      headline: ev.headline,
      affectedSectors: [...(ev.affectedSectors ?? [])],
    })),
    regimeChanges: run.regimeChanges,
    frames,
    agents,
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
