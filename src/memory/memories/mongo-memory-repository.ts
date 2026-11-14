/**
 * Semantic memory persistence. Isolation is enforced in every find/update:
 * agentId (and status, where relevant) is always part of the Mongo filter.
 */

import type { Collection, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../../database/collections.js";

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
  private readonly collection: Collection<MemoryDoc>;

  constructor(db: Db) {
    this.collection = db.collection<MemoryDoc>(COLLECTIONS.memories);
  }

  async insert(doc: MemoryDoc): Promise<MemoryDoc> {
    const { insertedId } = await this.collection.insertOne(doc);
    return { ...doc, _id: String(insertedId) };
  }

  /** Filters by agentId + status in the Mongo query. */
  listActiveForAgent(agentId: string): Promise<MemoryDoc[]> {
    return this.collection.find({ agentId, status: "active" }).toArray();
  }

  async updateForAgent(
    agentId: string,
    id: string,
    patch: Partial<MemoryDoc>,
  ): Promise<void> {
    const { _id: _ignored, ...setFields } = patch;
    await this.collection.updateOne(
      { _id: id, agentId } as Filter<MemoryDoc>,
      { $set: setFields },
    );
  }
}
