/**
 * Deterministic, memory-aware trading policies — the swappable `DecisionSource`.
 *
 * Each policy starts from the archetype config in `src/agents` (direction,
 * threshold, cash fraction) applied to a lookback return, then lets retrieved
 * memories change the action: an active "momentum works in <sector>" lesson
 * biases the agent to BUY that sector with a larger allocation. Withhold the
 * memories (counterfactual) and the base archetype action returns — that gap is
 * what the counterfactual flip-rate metric measures.
 *
 * No LLM calls. A model-backed `DecisionSource` can be swapped in later.
 */
import { ARCHETYPES } from "../agents/index.js";
import type { Decision, DecisionContext, DecisionSource, ProposedOrder } from "./types.js";

const LOOKBACK = 5;
/** Active lesson scales the archetype's cash fraction up, capped. The cap is
 * deliberately modest so repeated firing biases behaviour without draining all
 * cash in a few ticks (which would mask adaptation as a cash artifact). */
const MEMORY_SIZE_MULTIPLIER = 1.8;
const MEMORY_MAX_FRACTION = 0.15;

/** Rolling return over `lookback` ticks from history (oldest→newest). */
function lookbackReturn(history: readonly number[] | undefined, lookback: number): number | undefined {
  if (!history || history.length < lookback + 1) return undefined;
  const prev = history[history.length - 1 - lookback]!;
  const last = history[history.length - 1]!;
  if (prev <= 0) return undefined;
  return last / prev - 1;
}

type Scored = { symbol: string; price: number; ret: number };

function scoreSymbols(ctx: DecisionContext): Scored[] {
  return Object.entries(ctx.prices).flatMap(([symbol, price]) => {
    const ret = lookbackReturn(ctx.history.get(symbol), LOOKBACK);
    if (ret === undefined || price <= 0) return [];
    return [{ symbol, price, ret }];
  });
}

/** Archetype action with no memory influence — the counterfactual baseline. */
function baseDecision(ctx: DecisionContext, scored: Scored[]): Decision {
  const cfg = ARCHETYPES[ctx.archetype];
  const hold: Decision = {
    orders: [],
    reasoning: `${ctx.archetype}: no qualifying signal — hold.`,
    strategy: ctx.archetype,
    confidence: 0,
    firedMemoryIds: [],
  };
  if (scored.length === 0) return hold;

  // Adaptive infers direction from breadth of visible moves, like the archetype.
  let direction: number = cfg.direction;
  if (ctx.archetype === "adaptive") {
    const rising = scored.filter((s) => s.ret > 0).length;
    direction = rising / scored.length >= 0.5 ? 1 : -1;
  }

  const candidates = scored
    .map((s) => ({ ...s, signal: s.ret * direction }))
    .filter((s) => Math.abs(s.signal) >= cfg.threshold)
    .filter((s) => ctx.archetype !== "dip_buyer" || s.signal > 0)
    .sort((a, b) => Math.abs(b.signal) - Math.abs(a.signal) || a.symbol.localeCompare(b.symbol));

  for (const c of candidates) {
    const side = c.signal > 0 ? "buy" : "sell";
    const quantity =
      side === "buy"
        ? Math.floor((ctx.portfolio.cash * cfg.cashFraction) / c.price)
        : (ctx.portfolio.positions.find((p) => p.symbol === c.symbol)?.quantity ?? 0);
    if (quantity <= 0) continue;
    return {
      orders: [{ symbol: c.symbol, side, quantity }],
      reasoning: `${ctx.archetype}: ${side} ${c.symbol} on lookback${LOOKBACK} ${c.ret.toFixed(4)}.`,
      strategy: ctx.archetype,
      confidence: Math.min(1, Math.abs(c.signal)),
      firedMemoryIds: [],
    };
  }
  return hold;
}

/**
 * If an applicable memory exists, bias toward BUYING its sector with a boosted
 * allocation. "Applicable" = the memory's sector contains a priced symbol we can
 * afford. The memory fires only when it actually produces an order, so the
 * counterfactual (memories withheld) reliably differs.
 */
function memoryOverride(ctx: DecisionContext, scored: Scored[]): Decision | undefined {
  const cfg = ARCHETYPES[ctx.archetype];
  if (ctx.memories.length === 0 || ctx.portfolio.cash <= 0) return undefined;

  for (const retrieved of ctx.memories) {
    const sectors = retrieved.memory.scope.sectors;
    // Strongest-momentum priced symbol inside the lesson's sector(s).
    const inSector = scored
      .filter((s) => {
        const sec = ctx.sectorOf(s.symbol);
        return sec !== undefined && sectors.includes(sec);
      })
      .sort((a, b) => b.ret - a.ret || a.symbol.localeCompare(b.symbol));
    const target = inSector[0];
    if (!target) continue;

    const fraction = Math.min(MEMORY_MAX_FRACTION, cfg.cashFraction * MEMORY_SIZE_MULTIPLIER);
    const quantity = Math.floor((ctx.portfolio.cash * fraction) / target.price);
    if (quantity <= 0) continue;

    const order: ProposedOrder = { symbol: target.symbol, side: "buy", quantity };
    return {
      orders: [order],
      reasoning:
        `${ctx.archetype}: lesson "${retrieved.memory.content}" (score ${retrieved.retrievalScore.toFixed(3)}) ` +
        `→ buy ${quantity} ${target.symbol} at ${(fraction * 100).toFixed(0)}% cash.`,
      strategy: ctx.archetype,
      confidence: Math.min(1, 0.5 + retrieved.memory.reliability / 2),
      firedMemoryIds: [retrieved.memory.id],
    };
  }
  return undefined;
}

/**
 * The shipped deterministic policy. One `DecisionSource` serves all archetypes
 * (behaviour is driven by `ctx.archetype`); a model-backed source would
 * implement this same signature.
 */
export const memoryAwarePolicy: DecisionSource = (ctx: DecisionContext): Decision => {
  const scored = scoreSymbols(ctx);
  return memoryOverride(ctx, scored) ?? baseDecision(ctx, scored);
};
