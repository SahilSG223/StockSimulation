/**
 * Mongo-backed experience store — implement on second laptop.
 * Mirror the API of `ExperienceStore` in `./store.ts`.
 * EVERY query must include agentId in the filter (never post-filter only).
 */

import type {
  AgentId,
  CreateExperienceInput,
  ExperienceId,
  ExperienceQuery,
  ExperienceRecord,
} from "./types.js";

export class MongoExperienceStore {
  create(_input: CreateExperienceInput): Promise<ExperienceRecord> {
    return Promise.reject(new Error("MongoExperienceStore.create not implemented"));
  }

  get(_id: ExperienceId): Promise<ExperienceRecord | undefined> {
    return Promise.reject(new Error("MongoExperienceStore.get not implemented"));
  }

  getMany(_ids: readonly ExperienceId[]): Promise<ExperienceRecord[]> {
    return Promise.reject(new Error("MongoExperienceStore.getMany not implemented"));
  }

  listForAgent(_agentId: AgentId): Promise<ExperienceRecord[]> {
    return Promise.reject(new Error("MongoExperienceStore.listForAgent not implemented"));
  }

  listForAgentInSimulation(
    _agentId: AgentId,
    _simulationId: string,
  ): Promise<ExperienceRecord[]> {
    return Promise.reject(
      new Error("MongoExperienceStore.listForAgentInSimulation not implemented"),
    );
  }

  query(_q: ExperienceQuery): Promise<ExperienceRecord[]> {
    // Must: filter { agentId: q.agentId, ... } in the Mongo query itself
    return Promise.reject(new Error("MongoExperienceStore.query not implemented"));
  }
}
