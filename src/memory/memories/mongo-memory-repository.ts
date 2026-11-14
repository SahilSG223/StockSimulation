/**
 * Semantic memory persistence. Isolation is enforced in every find/update:
 * agentId (and status, where relevant) is always part of the Mongo filter.
 */

import type { Collection, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../../database/collections.js";
import { memoryDocSchema, type MemoryDoc } from "./memory-doc-schema.js";

export type { MemoryDoc };

export class MongoMemoryRepository {
  private readonly collection: Collection<MemoryDoc>;

  constructor(db: Db) {
    this.collection = db.collection<MemoryDoc>(COLLECTIONS.memories);
  }

  async insert(doc: MemoryDoc): Promise<MemoryDoc> {
    const parsed = memoryDocSchema.parse(doc);
    const record: MemoryDoc = { ...parsed, _id: parsed._id ?? crypto.randomUUID() };
    await this.collection.insertOne(record);
    return record;
  }

  /** Filters by agentId + status in the Mongo query. */
  listActiveForAgent(agentId: string): Promise<MemoryDoc[]> {
    return this.collection.find({ agentId, status: "active" }).toArray();
  }

  /** Any status (not just active) — filtered by agentId regardless. */
  async findForAgent(agentId: string, id: string): Promise<MemoryDoc | undefined> {
    const doc = await this.collection.findOne({ _id: id, agentId } as Filter<MemoryDoc>);
    return doc ?? undefined;
  }

  async updateForAgent(
    agentId: string,
    id: string,
    patch: Partial<MemoryDoc>,
  ): Promise<void> {
    const { _id: _ignored, ...setFields } = patch;
    const result = await this.collection.updateOne(
      { _id: id, agentId } as Filter<MemoryDoc>,
      { $set: setFields },
    );
    if (result.matchedCount === 0) {
      throw new Error(
        `MongoMemoryRepository.updateForAgent: no memory ${id} found for agent ${agentId}`,
      );
    }
  }
}
