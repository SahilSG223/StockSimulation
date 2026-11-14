/**
 * Mongo-backed experience store. Mirrors the API of `ExperienceStore` in `./store.ts`.
 * EVERY query includes agentId in the filter (never post-filter only).
 */

import type { Collection, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../../database/collections.js";
import type {
  AgentId,
  CreateExperienceInput,
  ExperienceId,
  ExperienceQuery,
  ExperienceRecord,
} from "./types.js";

type ExperienceDoc = ExperienceRecord & { _id: ExperienceId };

function stripMongoId(doc: ExperienceDoc): ExperienceRecord {
  const { _id: _ignored, ...record } = doc;
  return record;
}

export class MongoExperienceStore {
  private readonly collection: Collection<ExperienceDoc>;

  constructor(db: Db) {
    this.collection = db.collection<ExperienceDoc>(COLLECTIONS.experiences);
  }

  async create(input: CreateExperienceInput): Promise<ExperienceRecord> {
    const id = input.id ?? crypto.randomUUID();
    const record: ExperienceRecord = {
      id,
      agentId: input.agentId,
      simulationId: input.simulationId,
      tick: input.tick,
      market: input.market,
      decision: input.decision,
      outcome: input.outcome,
      scope: input.scope,
      createdAtTick: input.tick,
    };
    await this.collection.insertOne({ ...record, _id: id });
    return record;
  }

  async get(id: ExperienceId): Promise<ExperienceRecord | undefined> {
    const doc = await this.collection.findOne({ _id: id } as Filter<ExperienceDoc>);
    return doc ? stripMongoId(doc) : undefined;
  }

  async getMany(ids: readonly ExperienceId[]): Promise<ExperienceRecord[]> {
    const docs = await this.collection
      .find({ _id: { $in: [...ids] } } as Filter<ExperienceDoc>)
      .toArray();
    return docs.map(stripMongoId);
  }

  listForAgent(agentId: AgentId): Promise<ExperienceRecord[]> {
    return this.query({ agentId });
  }

  listForAgentInSimulation(
    agentId: AgentId,
    simulationId: string,
  ): Promise<ExperienceRecord[]> {
    return this.query({ agentId, simulationId });
  }

  async query(q: ExperienceQuery): Promise<ExperienceRecord[]> {
    const filter: Filter<ExperienceDoc> = { agentId: q.agentId };
    if (q.simulationId !== undefined) filter.simulationId = q.simulationId;
    if (q.fromTick !== undefined || q.toTick !== undefined) {
      filter.tick = {
        ...(q.fromTick !== undefined ? { $gte: q.fromTick } : {}),
        ...(q.toTick !== undefined ? { $lte: q.toTick } : {}),
      };
    }
    if (q.symbols && q.symbols.length > 0) filter["scope.symbols"] = { $in: [...q.symbols] };
    if (q.sectors && q.sectors.length > 0) filter["scope.sectors"] = { $in: [...q.sectors] };
    if (q.regimes && q.regimes.length > 0) filter["scope.regimes"] = { $in: [...q.regimes] };
    if (q.eventTypes && q.eventTypes.length > 0) {
      filter["scope.eventTypes"] = { $in: [...q.eventTypes] };
    }

    // Sort descending + limit, then reverse: avoids a count()+skip() race against
    // concurrent writes, and `limit(0)` naturally means "no limit" (mirrors the
    // in-memory store's `slice(-0)` == full array quirk for `limit: 0`).
    const cursor = this.collection.find(filter).sort({ tick: -1, _id: -1 });
    if (q.limit !== undefined && q.limit >= 0) {
      cursor.limit(q.limit);
    }
    const rows = await cursor.toArray();
    return rows.reverse().map(stripMongoId);
  }
}
