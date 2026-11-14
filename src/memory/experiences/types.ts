/** Episodic experience records — owned by feat/memory-experiences. */

export type ExperienceId = string;
export type AgentId = string;

/** Snapshot of what the agent knew when it acted (no ground-truth event effects). */
export type ExperienceMarketContext = {
  regime: string;
  prices: Readonly<Record<string, number>>;
  /** Public event ids visible at decision time. */
  eventIds: string[];
  eventTypes: string[];
};

/** What the agent intended — kept loose until `src/agents` owns Zod schemas. */
export type ExperienceDecision = {
  reasoning: string;
  strategy?: string;
  confidence?: number;
  /** Memory ids that influenced this decision (governance lane fills these). */
  memoryReferences: string[];
  orders: readonly {
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
  }[];
};

export type ExperienceFill = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  fillPrice: number;
  notional: number;
  fee: number;
};

export type ExperienceRejection = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  reason: string;
};

export type ExperienceOutcome = {
  fills: ExperienceFill[];
  rejections: ExperienceRejection[];
  /** Cash change from fills (negative = spent). */
  cashDelta: number;
  /** Realized PnL change attributed to these fills, if known. */
  realizedPnlDelta?: number;
  summary: string;
};

/** Metadata for later contextual retrieval / governance ranking. */
export type ExperienceScope = {
  symbols: string[];
  sectors: string[];
  regimes: string[];
  eventTypes: string[];
};

export type ExperienceRecord = {
  id: ExperienceId;
  agentId: AgentId;
  simulationId: string;
  tick: number;
  market: ExperienceMarketContext;
  decision: ExperienceDecision;
  outcome: ExperienceOutcome;
  scope: ExperienceScope;
  createdAtTick: number;
};

export type CreateExperienceInput = {
  id?: ExperienceId;
  agentId: AgentId;
  simulationId: string;
  tick: number;
  market: ExperienceMarketContext;
  decision: ExperienceDecision;
  outcome: ExperienceOutcome;
  scope: ExperienceScope;
};

export type ExperienceQuery = {
  agentId: AgentId;
  simulationId?: string;
  fromTick?: number;
  toTick?: number;
  symbols?: readonly string[];
  sectors?: readonly string[];
  regimes?: readonly string[];
  eventTypes?: readonly string[];
  limit?: number;
};
