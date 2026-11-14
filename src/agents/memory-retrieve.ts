import type { MemoryIndex } from "../memory/embeddings/memory-index.js";
import type { MongoMemoryIndex } from "../memory/embeddings/mongo-memory-index.js";
import { retrievedFromRanked, type RetrievedMemory } from "./retrieved-memory.js";
import type { DecisionContext } from "./runtime.js";

/** Satisfied by both in-memory and Mongo indexes. */
export type MemorySearcher = Pick<MemoryIndex, "search"> | Pick<MongoMemoryIndex, "search">;

/**
 * Build a retrieval query from public observation data (moves + headlines).
 * Does not embed raw prices as a vector of numbers — lesson text only downstream.
 */
export function memoryQueryFromObservation(
  ctx: Pick<DecisionContext, "observation" | "previousObservation">,
): string {
  const { observation, previousObservation } = ctx;
  const moves = Object.entries(observation.prices).map(([symbol, price]) => {
    const previous = previousObservation?.prices[symbol];
    if (previous === undefined) return `${symbol}: no prior observation`;
    if (price > previous) return `${symbol}: rising`;
    if (price < previous) return `${symbol}: falling`;
    return `${symbol}: unchanged`;
  });
  const events =
    observation.events
      .slice(0, 5)
      .map((e) => `${e.type}: ${e.headline} ${e.summary}`.slice(0, 240))
      .join("; ") || "no events";
  return [
    "Considering a trading decision.",
    `Observed conditions: ${moves.join("; ")}.`,
    `Owned assets: ${observation.portfolio.positions.map((p) => p.symbol).join(", ") || "none"}.`,
    `Public context: ${events}.`,
    "Find relevant past lessons about sizing, regime, or similar events.",
  ].join("\n");
}

export async function retrieveForDecision(args: {
  index: MemorySearcher;
  agentId: string;
  ctx: Pick<DecisionContext, "observation" | "previousObservation">;
  limit?: number;
}): Promise<RetrievedMemory[]> {
  const query = memoryQueryFromObservation(args.ctx);
  const eventTypes = [...new Set(args.ctx.observation.events.map((e) => e.type))];
  const ranked = await args.index.search({
    agentId: args.agentId,
    query,
    ctx: {
      tick: args.ctx.observation.tick,
      assets: Object.keys(args.ctx.observation.prices),
      ...(args.ctx.observation.regimeEstimate !== undefined
        ? { regimeEstimate: args.ctx.observation.regimeEstimate }
        : {}),
      ...(eventTypes.length > 0 ? { eventTypes } : {}),
    },
    limit: args.limit ?? 5,
  });
  return retrievedFromRanked(ranked);
}
