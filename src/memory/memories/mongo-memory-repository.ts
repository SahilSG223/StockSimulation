/**
 * Semantic memory persistence — implement on second laptop.
 * Keep agentId isolation in every find/update.
 */

export type MemoryDoc = {
  _id?: string;
  agentId: string;
  type: "semantic" | "strategic" | "social";
  content: string;
  /** Filled by embeddings PR — 1536 dims for text-embedding-3-small */
  embedding?: number[];
  sourceExperienceIds: string[];
  createdAtTick: number;
  updatedAtTick: number;
  confidence: number;
  reliability: number;
  scope: {
    sectors: string[];
    regimes: string[];
    eventTypes: string[];
    assets: string[];
  };
  status: "active" | "under_review" | "superseded" | "invalidated" | "expired";
  version: number;
};

export class MongoMemoryRepository {
  insert(_doc: MemoryDoc): Promise<MemoryDoc> {
    return Promise.reject(new Error("MongoMemoryRepository.insert not implemented"));
  }

  /** MUST filter by agentId + status in the Mongo query. */
  listActiveForAgent(_agentId: string): Promise<MemoryDoc[]> {
    return Promise.reject(
      new Error("MongoMemoryRepository.listActiveForAgent not implemented"),
    );
  }

  updateForAgent(_agentId: string, _id: string, _patch: Partial<MemoryDoc>): Promise<void> {
    return Promise.reject(new Error("MongoMemoryRepository.updateForAgent not implemented"));
  }
}
