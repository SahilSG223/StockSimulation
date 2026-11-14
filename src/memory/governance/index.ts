export {
  handleContradiction,
  type ContradictionAction,
  type ContradictionResult,
} from "./contradiction.js";
export {
  invalidateMemory,
  isRetrievable,
  supersedeMemory,
  type LifecycleChange,
} from "./lifecycle.js";
export {
  DEFAULT_WEIGHTS,
  contextualApplicability,
  rankMemories,
  roughSemanticSimilarity,
  temporalRelevance,
  type RankingWeights,
} from "./ranking.js";
export type {
  AgentId,
  MemoryId,
  MemoryRecord,
  MemoryScope,
  MemoryStatus,
  MemoryType,
  RankedMemory,
  RetrievalContext,
} from "./types.js";
