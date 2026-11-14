import { randomUUID } from "node:crypto";
import { MongoServerError, type Collection, type Filter } from "mongodb";
import { experienceQuerySchema, experienceRecordSchema } from "./experience-schema.js";
import type { CreateExperienceInput, ExperienceQuery, ExperienceRecord } from "./types.js";

/** All reads include ownership in the database filter, including id lookups. */
export class MongoExperienceStore {
  constructor(private readonly collection: Collection<ExperienceRecord>) {}

  async initialize(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ agentId: 1, simulationId: 1, tick: -1, id: -1 });
    await this.collection.createIndex({ agentId: 1, tick: -1, id: -1 });
  }

  async create(input: CreateExperienceInput): Promise<ExperienceRecord> {
    const record: ExperienceRecord = experienceRecordSchema.parse({
      ...input,
      id: input.id ?? randomUUID(),
      createdAtTick: input.tick,
    });
    try {
      // Driver may add _id to its argument; keep that out of the returned record.
      await this.collection.insertOne(structuredClone(record));
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new Error("Experience already exists");
      }
      throw new Error("MongoDB experience write failed");
    }
    return record;
  }

  async get(id: string, agentId: string): Promise<ExperienceRecord | undefined> {
    const rows = await this.getMany([id], agentId);
    return rows[0];
  }

  async getMany(ids: readonly string[], agentId: string): Promise<ExperienceRecord[]> {
    const owner = experienceQuerySchema.parse({ agentId }).agentId;
    if (ids.length === 0) return [];
    // Validate ids as strings before building a query to reject operator injection.
    const validIds = ids.map((id) => experienceRecordSchema.shape.id.parse(id));
    let docs: unknown[];
    try {
      docs = await this.collection.find({ agentId: owner, id: { $in: validIds } }).toArray();
    } catch {
      throw new Error("MongoDB experience read failed");
    }
    const records = docs.map((doc) => experienceRecordSchema.parse(doc));
    const byId = new Map(records.map((record) => [record.id, record]));
    return validIds.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }

  listForAgent(agentId: string): Promise<ExperienceRecord[]> {
    return this.query({ agentId });
  }

  listForAgentInSimulation(agentId: string, simulationId: string): Promise<ExperienceRecord[]> {
    return this.query({ agentId, simulationId });
  }

  async query(input: ExperienceQuery): Promise<ExperienceRecord[]> {
    const q = experienceQuerySchema.parse(input);
    if (q.limit === 0) return [];
    const filter: Filter<ExperienceRecord> = { agentId: q.agentId };
    if (q.simulationId !== undefined) filter.simulationId = q.simulationId;
    if (q.fromTick !== undefined || q.toTick !== undefined) {
      filter.tick = {
        ...(q.fromTick !== undefined ? { $gte: q.fromTick } : {}),
        ...(q.toTick !== undefined ? { $lte: q.toTick } : {}),
      };
    }
    for (const field of ["symbols", "sectors", "regimes", "eventTypes"] as const) {
      const values = q[field];
      if (values?.length) filter[`scope.${field}`] = { $in: values };
    }
    let docs: unknown[];
    try {
      const cursor = this.collection.find(filter).sort({ tick: -1, id: -1 });
      if (q.limit !== undefined) cursor.limit(q.limit);
      docs = await cursor.toArray();
    } catch {
      throw new Error("MongoDB experience query failed");
    }
    // Select the latest N on the server, return chronological order like the baseline store.
    return docs.map((doc) => experienceRecordSchema.parse(doc)).reverse();
  }
}
