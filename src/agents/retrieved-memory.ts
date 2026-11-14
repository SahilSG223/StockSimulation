import type { RankedEmbeddedMemory } from "../memory/embeddings/rank-with-embeddings.js";

/** Compact memory card passed into the decision provider (USER data, never SYSTEM). */
export type RetrievedMemory = {
  id: string;
  agentId: string;
  content: string;
  retrievalScore: number;
};

export function retrievedFromRanked(ranked: RankedEmbeddedMemory[]): RetrievedMemory[] {
  return ranked.map((r) => ({
    id: r.memory.id,
    agentId: r.memory.agentId,
    content: r.memory.content,
    retrievalScore: r.retrievalScore,
  }));
}
