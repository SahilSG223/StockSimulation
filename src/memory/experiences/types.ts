/** Episodic experience records — owned by feat/memory-experiences. */

export type ExperienceId = string;
export type AgentId = string;

export type ExperienceRecord = {
  id: ExperienceId;
  agentId: AgentId;
  simulationId: string;
  tick: number;
  decisionSummary: string;
  outcomeSummary: string;
  /** Symbols / sectors touched — for later contextual retrieval. */
  scope: {
    symbols: string[];
    sectors: string[];
  };
  createdAtTick: number;
};

export type CreateExperienceInput = Omit<ExperienceRecord, "id" | "createdAtTick"> & {
  id?: ExperienceId;
};
