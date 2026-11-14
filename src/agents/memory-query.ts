import type { VectorMemoryQuery } from "../memory/vector-schema.js";
import type { DecisionContext } from "./runtime.js";
import type { Archetype } from "./archetypes.js";

/** Semantic context from public events and derived direction, not raw price vectors. */
export function memoryQuery(
  context: DecisionContext,
  simulationId: string,
  archetype: Archetype,
): VectorMemoryQuery {
  const { observation, previousObservation } = context;
  const moves = Object.entries(observation.prices).map(([symbol, price]) => {
    const previous = previousObservation?.prices[symbol];
    return `${symbol}: ${previous === undefined ? "no prior observation" : price > previous ? "rising" : price < previous ? "falling" : "unchanged"}`;
  });
  return {
    agentId: observation.portfolio.agentId,
    simulationId,
    tick: observation.tick,
    symbols: Object.keys(observation.prices),
    eventTypes: [...new Set(observation.events.map((event) => event.type))],
    content: [
      `Strategy: ${archetype}. Considering a trading decision.`,
      `Observed conditions: ${moves.join("; ")}.`,
      `Owned assets: ${observation.portfolio.positions.map((position) => position.symbol).join(", ") || "none"}.`,
      `Public context: ${
        observation.events
          .slice(0, 5)
          .map((event) => `${event.type}: ${event.headline} ${event.summary}`.slice(0, 1000))
          .join("; ") || "no events"
      }.`,
      "Find relevant past decisions, execution outcomes, and reasons to act or hold.",
    ]
      .join("\n")
      .slice(0, 12_000),
  };
}
