import type { MemoryRecord, RankedMemory, RetrievalContext } from "./types.js";
import { isRetrievable } from "./lifecycle.js";

export type RankingWeights = {
  semantic: number;
  contextual: number;
  temporal: number;
  reliability: number;
};

export const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 1,
  contextual: 1,
  temporal: 1,
  reliability: 1,
};

/**
 * Floor applied to semantic/contextual scores before multiplying, so a single
 * weak-but-plausible signal can't veto an otherwise strong match to a literal
 * zero (e.g. the placeholder token-overlap semantic score hits 0 whenever the
 * query is worded differently from the stored content). Reliability is
 * excluded on purpose: zero reliability should suppress retrieval.
 */
const MIN_SIGNAL = 0.05;

/** Simple exponential decay; λ by memory type can come later. */
export function temporalRelevance(ageTicks: number, lambda = 0.02): number {
  return Math.exp(-lambda * Math.max(0, ageTicks));
}

export function contextualApplicability(
  memory: MemoryRecord,
  ctx: RetrievalContext,
): number {
  let hits = 0;
  let checks = 0;
  const bump = (ok: boolean) => {
    checks += 1;
    if (ok) hits += 1;
  };
  if (ctx.regimeEstimate && memory.scope.regimes.length > 0) {
    bump(memory.scope.regimes.includes(ctx.regimeEstimate));
  }
  if (ctx.sectors && ctx.sectors.length > 0 && memory.scope.sectors.length > 0) {
    bump(ctx.sectors.some((s) => memory.scope.sectors.includes(s)));
  }
  if (ctx.assets && ctx.assets.length > 0 && memory.scope.assets.length > 0) {
    bump(ctx.assets.some((a) => memory.scope.assets.includes(a)));
  }
  if (ctx.eventTypes && ctx.eventTypes.length > 0 && memory.scope.eventTypes.length > 0) {
    bump(ctx.eventTypes.some((e) => memory.scope.eventTypes.includes(e)));
  }
  if (checks === 0) return 0.5;
  return hits / checks;
}

/**
 * Placeholder semantic score — replace with vector similarity once embeddings land.
 * For now: crude token overlap so ranking plumbing is testable offline.
 */
export function roughSemanticSimilarity(content: string, query: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const a = tok(content);
  const b = tok(query);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

export function rankMemories(args: {
  memories: MemoryRecord[];
  ctx: RetrievalContext;
  query: string;
  weights?: RankingWeights;
}): RankedMemory[] {
  const w = args.weights ?? DEFAULT_WEIGHTS;
  return args.memories
    .filter((m) => m.agentId === args.ctx.agentId && isRetrievable(m))
    .map((memory) => {
      const semanticSimilarity = roughSemanticSimilarity(memory.content, args.query);
      const contextualApplicabilityScore = contextualApplicability(memory, args.ctx);
      const temporal = temporalRelevance(args.ctx.tick - memory.updatedAtTick);
      const retrievalScore =
        Math.pow(Math.max(MIN_SIGNAL, semanticSimilarity), w.semantic) *
        Math.pow(Math.max(MIN_SIGNAL, contextualApplicabilityScore), w.contextual) *
        Math.pow(temporal, w.temporal) *
        Math.pow(Math.max(0, memory.reliability), w.reliability);
      return {
        memory,
        retrievalScore,
        semanticSimilarity,
        contextualApplicability: contextualApplicabilityScore,
        temporalRelevance: temporal,
      };
    })
    .sort((a, b) => b.retrievalScore - a.retrievalScore);
}
