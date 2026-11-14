import type { AgentDecision } from "./decision-schema.js";
import type { DecisionProvider } from "./runtime.js";

/** Starting parameters, not constraints on subsequent model decisions. */
export const ARCHETYPES = {
  momentum: { direction: 1, threshold: 0.001, cashFraction: 0.1 },
  contrarian: { direction: -1, threshold: 0.001, cashFraction: 0.1 },
  conservative: { direction: 1, threshold: 0.01, cashFraction: 0.02 },
  aggressive: { direction: 1, threshold: 0.0005, cashFraction: 0.25 },
  adaptive: { direction: 1, threshold: 0.002, cashFraction: 0.08 },
  breakout: { direction: 1, threshold: 0.03, cashFraction: 0.15 },
  dip_buyer: { direction: -1, threshold: 0.02, cashFraction: 0.05 },
} as const;

export type Archetype = keyof typeof ARCHETYPES;

/** Deterministic baseline: trade the strongest qualifying observed price change. */
export function createArchetypeProvider(archetype: Archetype): DecisionProvider {
  const config = ARCHETYPES[archetype];
  return ({ observation, previousObservation }) => {
    const decision: AgentDecision = {
      orders: [],
      reasoning: "Hold until a qualifying observed price change is available.",
      strategy: archetype,
      confidence: 0,
      memoryReferences: [],
    };
    if (!previousObservation) return decision;

    const changes = Object.entries(observation.prices).flatMap(([symbol, price]) => {
      const previous = previousObservation.prices[symbol];
      if (previous === undefined) return [];
      return [{ symbol, price, change: price / previous - 1 }];
    });

    let direction: number = config.direction;
    let cashFraction: number = config.cashFraction;
    let mode = "observed price change";
    if (archetype === "adaptive" && changes.length > 0) {
      const rising = changes.filter(({ change }) => change > 0).length;
      const falling = changes.filter(({ change }) => change < 0).length;
      const breadth = Math.max(rising, falling) / changes.length;
      const meanAbsoluteChange =
        changes.reduce((sum, { change }) => sum + Math.abs(change), 0) / changes.length;
      // Infer conditions from public prices, never the engine's regime label.
      direction = breadth >= 0.75 ? 1 : -1;
      mode = direction === 1 ? "broad market trend" : "mixed market reversal";
      if (meanAbsoluteChange >= 0.03) {
        cashFraction = 0.02;
        mode += " with reduced allocation after large price moves";
      }
    }

    const candidates = changes
      .map(({ symbol, price, change }) => ({ symbol, price, signal: change * direction }))
      .filter(({ signal }) => Math.abs(signal) >= config.threshold)
      .filter(({ signal }) => archetype !== "dip_buyer" || signal > 0)
      .sort((a, b) => Math.abs(b.signal) - Math.abs(a.signal) || a.symbol.localeCompare(b.symbol));

    for (const { symbol, price, signal } of candidates) {
      const side = signal > 0 ? "buy" : "sell";
      const quantity =
        side === "buy"
          ? Math.floor((observation.portfolio.cash * cashFraction) / price)
          : (observation.portfolio.positions.find((p) => p.symbol === symbol)?.quantity ?? 0);
      if (quantity <= 0) continue;
      decision.orders.push({ symbol, side, quantity });
      decision.reasoning = `${archetype}: ${side} ${symbol} after its ${mode}.`;
      // A heuristic signal strength, not a calibrated probability.
      decision.confidence = Math.min(1, Math.abs(signal));
      break;
    }
    return decision;
  };
}
