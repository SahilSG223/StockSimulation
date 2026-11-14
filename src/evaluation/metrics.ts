/**
 * Metrics over one run record. Evaluation may read ground truth (regime labels,
 * event ticks); agents may not. All five metrics are documented inline.
 */
import type { DecisionLogEntry, RunRecord } from "./types.js";

export type AgentMetrics = {
  /** Financial. */
  finalEquity: number;
  /** Largest peak-to-trough equity drop as a fraction of the peak (0..1). */
  maxDrawdown: number;
  feesPaid: number;
  /**
   * Adaptation. Ticks from the change point (shock tick or first regime change)
   * to the first decision where the agent's behaviour in the affected sector
   * changes direction (a sell) or its buy size drops below half its pre-change
   * average. `undefined` when there is no change point, or the agent had no
   * pre-change exposure to adapt. Censored to (ticks − changeTick) if it never
   * adapts within the run.
   */
  ticksToAdapt: number | undefined;
  /** Share of post-change memory-firing decisions citing a now-stale-regime lesson. */
  staleInfluenceRate: number;
  /** Losing buys that cited the same memory after that memory's first losing buy. */
  repeatedMistakes: number;
  /** Core metric: of decisions that fired memories, share whose action changed when memory was withheld. */
  flipRate: number;
};

const PRE_CHANGE_WINDOW = 10;

function filledBuyNotional(entry: DecisionLogEntry, sectorOf: (s: string) => string | undefined, sectors: readonly string[]): number {
  return entry.results.reduce((sum, r) => {
    if (r.status !== "filled" || r.order.side !== "buy") return sum;
    const sec = sectorOf(r.order.symbol);
    return sec !== undefined && sectors.includes(sec) ? sum + r.notional : sum;
  }, 0);
}

function hasFilledSell(entry: DecisionLogEntry, sectorOf: (s: string) => string | undefined, sectors: readonly string[]): boolean {
  return entry.results.some((r) => {
    if (r.status !== "filled" || r.order.side !== "sell") return false;
    const sec = sectorOf(r.order.symbol);
    return sec !== undefined && sectors.includes(sec);
  });
}

function changePoint(run: RunRecord): { tick: number; eventSectors: string[] } | undefined {
  const eventTick = run.events.length > 0 ? Math.min(...run.events.map((e) => e.tick)) : undefined;
  const regimeTick = run.regimeChanges.find((c) => c.tick > 0)?.tick;
  const ticks = [eventTick, regimeTick].filter((t): t is number => t !== undefined);
  if (ticks.length === 0) return undefined;
  const tick = Math.min(...ticks);
  const eventSectors =
    run.events.find((e) => e.tick === tick)?.affectedSectors?.map((s) => s as string) ?? [];
  return { tick, eventSectors };
}

function computeOne(run: RunRecord, agentId: string, change: ReturnType<typeof changePoint>): AgentMetrics {
  const sectorBySymbol = new Map(run.assets.map((a) => [a.symbol, a.sector]));
  const sectorOf = (s: string): string | undefined => sectorBySymbol.get(s);
  const entries = run.decisions.filter((d) => d.agentId === agentId).sort((a, b) => a.tick - b.tick);

  // Financial
  let peak = -Infinity;
  let maxDrawdown = 0;
  let feesPaid = 0;
  for (const e of entries) {
    const eq = e.portfolioAfter.equity;
    peak = Math.max(peak, eq);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - eq) / peak);
    for (const r of e.results) if (r.status === "filled") feesPaid += r.fee;
  }
  const finalEquity = entries.at(-1)?.portfolioAfter.equity ?? 0;

  // Adaptation
  let ticksToAdapt: number | undefined;
  if (change) {
    const pre = entries.filter((e) => e.tick < change.tick);
    let sectors = change.eventSectors;
    if (sectors.length === 0) {
      // Regime shift: the sector the agent built the most buy exposure in pre-change.
      const bySector = new Map<string, number>();
      for (const e of pre) {
        for (const r of e.results) {
          if (r.status === "filled" && r.order.side === "buy") {
            const sec = sectorOf(r.order.symbol);
            if (sec) bySector.set(sec, (bySector.get(sec) ?? 0) + r.notional);
          }
        }
      }
      const top = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0];
      sectors = top ? [top[0]] : [];
    }
    if (sectors.length > 0) {
      const window = pre.filter((e) => e.tick >= change.tick - PRE_CHANGE_WINDOW);
      const preBuys = window.map((e) => filledBuyNotional(e, sectorOf, sectors));
      const preAvg = preBuys.reduce((s, n) => s + n, 0) / Math.max(1, window.length);
      if (preAvg > 0) {
        const post = entries.filter((e) => e.tick >= change.tick);
        const adapted = post.find(
          (e) =>
            hasFilledSell(e, sectorOf, sectors) ||
            filledBuyNotional(e, sectorOf, sectors) < 0.5 * preAvg,
        );
        ticksToAdapt = adapted ? adapted.tick - change.tick : run.ticks - change.tick;
      }
    }
  }

  // Stale influence
  const post = change ? entries.filter((e) => e.tick >= change.tick) : [];
  const fired = post.filter((e) => e.retrieved.some((m) => m.fired));
  const stale = fired.filter((e) =>
    e.retrieved.some((m) => m.fired && m.creationRegime !== e.regime),
  );
  const staleInfluenceRate = fired.length === 0 ? 0 : stale.length / fired.length;

  // Repeated mistakes
  const endPrices = run.market.at(-1)?.prices ?? {};
  const citations = new Map<string, boolean[]>();
  for (const e of entries) {
    const firedIds = e.retrieved.filter((m) => m.fired).map((m) => m.id);
    if (firedIds.length === 0) continue;
    for (const r of e.results) {
      if (r.status !== "filled" || r.order.side !== "buy") continue;
      const end = endPrices[r.order.symbol];
      const losing = end !== undefined && end < r.fillPrice;
      for (const id of firedIds) {
        const list = citations.get(id) ?? [];
        list.push(losing);
        citations.set(id, list);
      }
    }
  }
  let repeatedMistakes = 0;
  for (const losses of citations.values()) {
    const firstLoss = losses.indexOf(true);
    if (firstLoss >= 0) repeatedMistakes += losses.slice(firstLoss + 1).filter(Boolean).length;
  }

  // Counterfactual flip rate (core)
  const cf = entries.filter((e) => e.counterfactual !== null);
  const flipRate = cf.length === 0 ? 0 : cf.filter((e) => e.counterfactual!.changed).length / cf.length;

  return { finalEquity, maxDrawdown, feesPaid, ticksToAdapt, staleInfluenceRate, repeatedMistakes, flipRate };
}

export function computeRunMetrics(run: RunRecord): Record<string, AgentMetrics> {
  const change = changePoint(run);
  const out: Record<string, AgentMetrics> = {};
  for (const agentId of run.agents) out[agentId] = computeOne(run, agentId, change);
  return out;
}
