/** Semantic memory + lifecycle — owned by feat/memory-governance (hard lane). */

export type MemoryId = string;
export type AgentId = string;

export type MemoryStatus =
  | "active"
  | "under_review"
  | "superseded"
  | "invalidated"
  | "expired";

export type MemoryType = "semantic" | "strategic" | "social";

export type MemoryScope = {
  sectors: string[];
  regimes: string[];
  eventTypes: string[];
  assets: string[];
};

/**
 * Confidence / relevance / reliability stay separate — do not collapse to one score
 * without documenting the formula (see .claude/rules/memory.md).
 */
export type MemoryRecord = {
  id: MemoryId;
  agentId: AgentId;
  type: MemoryType;
  content: string;
  sourceExperienceIds: string[];
  createdAtTick: number;
  updatedAtTick: number;
  confidence: number;
  reliability: number;
  scope: MemoryScope;
  status: MemoryStatus;
  invalidationReason?: string;
  version: number;
};

export type RetrievalContext = {
  agentId: AgentId;
  regimeEstimate?: string;
  sectors?: string[];
  assets?: string[];
  eventTypes?: string[];
  tick: number;
};

export type RankedMemory = {
  memory: MemoryRecord;
  /** Documented composite — not a calibrated probability. */
  retrievalScore: number;
  semanticSimilarity: number;
  contextualApplicability: number;
  temporalRelevance: number;
};
