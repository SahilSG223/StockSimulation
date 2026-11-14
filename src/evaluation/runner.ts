/**
 * Runs one (scenario, seed, memoryMode) and returns a full run record.
 *
 * Per tick: step the engine → update the inferred regime → each agent resolves
 * the outcome of its previous memory-fired buy (governed invalidation), retrieves
 * memories, decides, and submits orders through the engine. The counterfactual
 * re-runs the same decision with memories withheld; it is a pure function of the
 * context and never touches the engine, so simulation state is identical with or
 * without it.
 */
import { DEFAULT_ASSETS, MarketEngine, toPublicInfo } from "../simulation/index.js";
import type { PortfolioSnapshot, RegimeId } from "../simulation/index.js";
import { SCENARIOS, type ScenarioId } from "../../experiments/scenarios.js";
import { EvalMemoryStore, RegimeEstimator } from "./memory-lab.js";
import { memoryAwarePolicy } from "./policies.js";
import {
  EVAL_ARCHETYPES,
  type DecisionContext,
  type DecisionLogEntry,
  type EvalLifecycleEvent,
  type MarketFrame,
  type MemoryMode,
  type MemorySnapshotAtDecision,
  type ProposedOrder,
  type RunRecord,
} from "./types.js";

/** Cash each agent starts with; the baseline for netPnl in metrics and replay. */
const STARTING_CASH = 100_000;

function ordersEqual(a: readonly ProposedOrder[], b: readonly ProposedOrder[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o, i) => {
    const other = b[i]!;
    return o.symbol === other.symbol && o.side === other.side && o.quantity === other.quantity;
  });
}

function crossSectionalMeanReturn(
  prev: Readonly<Record<string, number>>,
  next: Readonly<Record<string, number>>,
): number {
  const rs = Object.keys(next).flatMap((s) => {
    const p = prev[s];
    const n = next[s];
    return p !== undefined && p > 0 && n !== undefined ? [n / p - 1] : [];
  });
  return rs.length === 0 ? 0 : rs.reduce((sum, r) => sum + r, 0) / rs.length;
}

export function runOne(args: {
  scenario: ScenarioId;
  seed: number;
  memoryMode: MemoryMode;
}): RunRecord {
  const spec = SCENARIOS[args.scenario];
  const assets = DEFAULT_ASSETS;
  const sectorBySymbol = new Map(assets.map((a) => [a.symbol, a.sector as string]));
  const sectorOf = (symbol: string): string | undefined => sectorBySymbol.get(symbol);
  const universeSectors = [...new Set(assets.map((a) => a.sector as string))];

  const engine = new MarketEngine({ seed: args.seed, assets, initialCash: STARTING_CASH });
  spec.setup(engine);

  const store = new EvalMemoryStore(args.memoryMode);
  const estimator = new RegimeEstimator(engine.currentRegime);

  const market: MarketFrame[] = [];
  const decisions: DecisionLogEntry[] = [];
  const lifecycle: EvalLifecycleEvent[] = [];
  const regimeChanges: { tick: number; regime: RegimeId }[] = [
    { tick: 0, regime: engine.currentRegime },
  ];

  let prevPrices = engine.getPrices();
  const history = new Map<string, number[]>();
  for (const [symbol, price] of Object.entries(prevPrices)) history.set(symbol, [price]);

  let lastRegimeTruth = engine.currentRegime;
  // A memory-fired buy awaiting its next-tick outcome, per agent.
  const pending = new Map<string, { memoryId: string; symbol: string; entryPrice: number }>();

  for (let t = 1; t <= spec.ticks; t++) {
    const snap = engine.step();
    for (const [symbol, price] of Object.entries(snap.prices)) history.get(symbol)!.push(price);
    const regimeEstimate = estimator.update(crossSectionalMeanReturn(prevPrices, snap.prices));
    prevPrices = snap.prices;

    market.push({ tick: snap.tick, regime: snap.regime, marketReturn: snap.marketReturn, prices: { ...snap.prices } });
    if (snap.regime !== lastRegimeTruth) {
      regimeChanges.push({ tick: snap.tick, regime: snap.regime });
      lastRegimeTruth = snap.regime;
    }

    if (t <= spec.warmup) continue;

    for (const archetype of EVAL_ARCHETYPES) {
      if (t === spec.warmup + 1) engine.registerAgent(archetype);

      // Resolve the outcome of last tick's memory-fired buy (governed governance).
      const prior = pending.get(archetype);
      if (prior) {
        const now = snap.prices[prior.symbol];
        lifecycle.push(
          ...store.recordOutcome({
            memoryId: prior.memoryId,
            won: now !== undefined && now >= prior.entryPrice,
            atTick: snap.tick,
            regimeEstimate,
          }),
        );
        pending.delete(archetype);
      }

      const portfolio: PortfolioSnapshot = engine.getPortfolio(archetype);
      const retrieved = store.retrieve({
        agentId: archetype,
        tick: snap.tick,
        regimeEstimate,
        sectors: universeSectors,
      });

      const ctx: DecisionContext = {
        agentId: archetype,
        archetype,
        tick: snap.tick,
        prices: snap.prices,
        history,
        portfolio,
        sectorOf,
        regimeEstimate,
        memories: retrieved,
      };
      const decision = memoryAwarePolicy(ctx);

      // Counterfactual: identical context, memories withheld. Pure — no engine call.
      let counterfactual: DecisionLogEntry["counterfactual"] = null;
      if (decision.firedMemoryIds.length > 0) {
        const without = memoryAwarePolicy({ ...ctx, memories: [] });
        counterfactual = {
          withoutOrders: without.orders,
          changed: !ordersEqual(decision.orders, without.orders),
        };
      }

      const results = decision.orders.map((o) => engine.submitOrder({ ...o, agentId: archetype }));

      // Consolidate buy fills into lessons (no-op in `none` mode).
      const boughtSectors = new Set(
        results.flatMap((r) =>
          r.status === "filled" && r.order.side === "buy"
            ? [sectorOf(r.order.symbol)].filter((s): s is string => s !== undefined)
            : [],
        ),
      );
      for (const sector of boughtSectors) {
        store.consolidate({
          agentId: archetype,
          tick: snap.tick,
          regimeEstimate,
          regimeTruth: snap.regime,
          sector,
          strategy: archetype,
        });
      }

      // Track a fired memory's resulting buy so its outcome is scored next tick.
      if (decision.firedMemoryIds.length > 0) {
        const firedMem = retrieved.find((r) => decision.firedMemoryIds.includes(r.memory.id));
        const firedSectors = firedMem?.memory.scope.sectors ?? [];
        const firedBuy = results.find(
          (r) =>
            r.status === "filled" &&
            r.order.side === "buy" &&
            firedSectors.includes(sectorOf(r.order.symbol) ?? ""),
        );
        if (firedMem && firedBuy && firedBuy.status === "filled") {
          pending.set(archetype, {
            memoryId: firedMem.memory.id,
            symbol: firedBuy.order.symbol,
            entryPrice: firedBuy.fillPrice,
          });
        }
      }

      const retrievedSnapshots: MemorySnapshotAtDecision[] = retrieved.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        status: r.memory.status,
        confidence: r.memory.confidence,
        reliability: r.memory.reliability,
        retrievalScore: r.retrievalScore,
        createdAtTick: r.memory.createdAtTick,
        creationRegime: store.creationRegimeOf(r.memory.id) ?? snap.regime,
        fired: decision.firedMemoryIds.includes(r.memory.id),
      }));

      decisions.push({
        tick: snap.tick,
        agentId: archetype,
        archetype,
        regime: snap.regime,
        decision,
        results,
        portfolioAfter: engine.getPortfolio(archetype),
        retrieved: retrievedSnapshots,
        counterfactual,
      });
    }
  }

  return {
    runId: `${args.scenario}-${args.memoryMode}-seed${args.seed}`,
    scenario: args.scenario,
    seed: args.seed,
    memoryMode: args.memoryMode,
    ticks: spec.ticks,
    warmup: spec.warmup,
    startingCash: STARTING_CASH,
    assets: assets.map((a) => ({ symbol: a.symbol, sector: a.sector })),
    regimeChanges,
    events: engine.getEvents().map(toPublicInfo),
    market,
    decisions,
    lifecycle,
    agents: [...EVAL_ARCHETYPES],
  };
}
