import { cosineSimilarity } from "./cosine.js";
import type { EmbeddedMemory } from "./types.js";

export type RetrievalContext = {
  agentId: string;
  tick: number;
  regimeEstimate?: string;
  sectors?: string[];
  assets?: string[];
  eventTypes?: string[];
};

export type EmbeddingRankWeights = {
  semantic: number;
  contextual: number;
  temporal: number;
  reliability: number;
  lambda: number;
};

export const DEFAULT_EMBEDDING_WEIGHTS: EmbeddingRankWeights = {
  semantic: 1,
  contextual: 1.5,
  temporal: 1,
  reliability: 1,
  lambda: 0.02,
};

function temporalRelevance(ageTicks: number, lambda: number): number {
  return Math.exp(-lambda * Math.max(0, ageTicks));
}

function contextualApplicability(memory: EmbeddedMemory, ctx: RetrievalContext): number {
  let hits = 0;
  let checks = 0;
  const bump = (ok: boolean) => {
    checks += 1;
    if (ok) hits += 1;
  };
  if (ctx.regimeEstimate && memory.scope.regimes.length > 0) {
    bump(memory.scope.regimes.includes(ctx.regimeEstimate));
  }
  if (ctx.sectors?.length && memory.scope.sectors.length > 0) {
    bump(ctx.sectors.some((s) => memory.scope.sectors.includes(s)));
  }
  if (ctx.assets?.length && memory.scope.assets.length > 0) {
    bump(ctx.assets.some((a) => memory.scope.assets.includes(a)));
  }
  if (ctx.eventTypes?.length && memory.scope.eventTypes.length > 0) {
    bump(ctx.eventTypes.some((e) => memory.scope.eventTypes.includes(e)));
  }
  if (checks === 0) return 0.5;
  return hits / checks;
}

export type RankedEmbeddedMemory = {
  memory: EmbeddedMemory;
  retrievalScore: number;
  semanticSimilarity: number;
  contextualApplicability: number;
  temporalRelevance: number;
};

/**
 * Rank memories using a precomputed query embedding (from OpenAIEmbedder).
 * Enforces agentId + active status before scoring.
 */
export function rankWithEmbeddings(args: {
  memories: EmbeddedMemory[];
  queryEmbedding: number[];
  ctx: RetrievalContext;
  weights?: EmbeddingRankWeights;
}): RankedEmbeddedMemory[] {
  const w = args.weights ?? DEFAULT_EMBEDDING_WEIGHTS;
  return args.memories
    .filter((m) => m.agentId === args.ctx.agentId && m.status === "active")
    .map((memory) => {
      const semanticSimilarity = cosineSimilarity(args.queryEmbedding, memory.embedding);
      // Shift cosine from [-1,1] to (0,1] for multiplicative ranking
      const semantic01 = Math.max(1e-6, (semanticSimilarity + 1) / 2);
      const contextual = contextualApplicability(memory, args.ctx);
      const temporal = temporalRelevance(args.ctx.tick - memory.updatedAtTick, w.lambda);
      const retrievalScore =
        Math.pow(semantic01, w.semantic) *
        Math.pow(Math.max(1e-6, contextual), w.contextual) *
        Math.pow(Math.max(1e-6, temporal), w.temporal) *
        Math.pow(Math.max(1e-6, memory.reliability), w.reliability);
      return {
        memory,
        retrievalScore,
        semanticSimilarity,
        contextualApplicability: contextual,
        temporalRelevance: temporal,
      };
    })
    .sort((a, b) => b.retrievalScore - a.retrievalScore);
}
