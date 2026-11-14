import type { AgentId, CreateExperienceInput, ExperienceId, ExperienceRecord } from "./types.js";

/**
 * In-memory experience store. Swap for Mongo later without changing call sites.
 * Isolation is enforced in the query — never by prompting an LLM.
 */
export class ExperienceStore {
  private readonly byId = new Map<ExperienceId, ExperienceRecord>();

  create(input: CreateExperienceInput): ExperienceRecord {
    const id = input.id ?? crypto.randomUUID();
    if (this.byId.has(id)) {
      throw new Error(`experience already exists: ${id}`);
    }
    const record: ExperienceRecord = {
      id,
      agentId: input.agentId,
      simulationId: input.simulationId,
      tick: input.tick,
      decisionSummary: input.decisionSummary,
      outcomeSummary: input.outcomeSummary,
      scope: {
        symbols: [...input.scope.symbols],
        sectors: [...input.scope.sectors],
      },
      createdAtTick: input.tick,
    };
    this.byId.set(id, record);
    return record;
  }

  get(id: ExperienceId): ExperienceRecord | undefined {
    return this.byId.get(id);
  }

  /** Always filter by agentId at the store layer. */
  listForAgent(agentId: AgentId): ExperienceRecord[] {
    return [...this.byId.values()]
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => a.tick - b.tick);
  }

  listForAgentInSimulation(agentId: AgentId, simulationId: string): ExperienceRecord[] {
    return this.listForAgent(agentId).filter((e) => e.simulationId === simulationId);
  }
}
