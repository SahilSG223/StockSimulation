/**
 * Evaluation domain types. The eval harness is a consumer of simulation,
 * agents, and memory/governance — it owns no financial truth of its own.
 */
import type { Archetype } from "../agents/index.js";
import type { MemoryRecord, MemoryStatus } from "../memory/governance/index.js";
import type {
  ExecutionResult,
  OrderSide,
  PortfolioSnapshot,
  PublicEventInfo,
  RegimeId,
} from "../simulation/index.js";
import type { ScenarioId } from "../../experiments/scenarios.js";

export const MEMORY_MODES = ["none", "raw", "governed"] as const;
export type MemoryMode = (typeof MEMORY_MODES)[number];

export const EVAL_ARCHETYPES = [
  "momentum",
  "contrarian",
  "conservative",
  "aggressive",
  "adaptive",
  "breakout",
  "dip_buyer",
] as const satisfies readonly Archetype[];

export type ProposedOrder = { symbol: string; side: OrderSide; quantity: number };

/** One memory as surfaced to a decision, with the score that retrieved it. */
export type RetrievedMemory = {
  memory: MemoryRecord;
  retrievalScore: number;
};

/**
 * Everything a deterministic, memory-aware policy needs. Pure data — a policy
 * must not reach back into the engine, so counterfactual re-runs (same ctx,
 * `memories: []`) never mutate simulation state.
 */
export type DecisionContext = {
  agentId: string;
  archetype: Archetype;
  tick: number;
  prices: Readonly<Record<string, number>>;
  /** Per-symbol price history, oldest→newest, including the current tick. */
  history: ReadonlyMap<string, readonly number[]>;
  portfolio: PortfolioSnapshot;
  sectorOf: (symbol: string) => string | undefined;
  /**
   * Regime inferred from visible prices (src/market estimateRegime) — never the
   * engine's ground-truth label. Undefined until there is enough history.
   */
  regimeEstimate: string | undefined;
  /** Retrieved memories for this decision; `[]` means memory is withheld. */
  memories: readonly RetrievedMemory[];
};

export type Decision = {
  orders: ProposedOrder[];
  reasoning: string;
  strategy: string;
  confidence: number;
  /** Ids of memories that actually changed the action (a subset of retrieved). */
  firedMemoryIds: string[];
};

/**
 * The swappable decision interface. A future LLM-backed source implements the
 * same shape; this project ships only deterministic policies.
 */
export type DecisionSource = (ctx: DecisionContext) => Decision;

/** A memory as it looked at one decision — flattened for logs and replay. */
export type MemorySnapshotAtDecision = {
  id: string;
  content: string;
  status: MemoryStatus;
  confidence: number;
  reliability: number;
  retrievalScore: number;
  createdAtTick: number;
  /** Ground-truth regime when the memory was created (metrics use this). */
  creationRegime: RegimeId;
  fired: boolean;
};

export type CounterfactualResult = {
  withoutOrders: ProposedOrder[];
  changed: boolean;
};

/** One agent's decision at one tick, with authoritative results. */
export type DecisionLogEntry = {
  tick: number;
  agentId: string;
  archetype: Archetype;
  regime: RegimeId;
  decision: Decision;
  results: ExecutionResult[];
  portfolioAfter: PortfolioSnapshot;
  retrieved: MemorySnapshotAtDecision[];
  /** Present only when ≥1 memory fired; null otherwise (nothing to withhold). */
  counterfactual: CounterfactualResult | null;
};

export type EvalLifecycleEvent = {
  agentId: string;
  memoryId: string;
  from: MemoryStatus;
  to: MemoryStatus;
  reason: string;
  atTick: number;
};

/** Per-tick market truth (evaluation may see ground truth; agents may not). */
export type MarketFrame = {
  tick: number;
  regime: RegimeId;
  marketReturn: number;
  prices: Record<string, number>;
};

export type RunRecord = {
  runId: string;
  scenario: ScenarioId;
  seed: number;
  memoryMode: MemoryMode;
  ticks: number;
  warmup: number;
  /** Cash each agent is seeded with — the baseline for netPnl. */
  startingCash: number;
  assets: { symbol: string; sector: string }[];
  /** Regime change points (ground truth), including the opening regime at tick 0. */
  regimeChanges: { tick: number; regime: RegimeId }[];
  events: PublicEventInfo[];
  market: MarketFrame[];
  decisions: DecisionLogEntry[];
  lifecycle: EvalLifecycleEvent[];
  agents: Archetype[];
};
