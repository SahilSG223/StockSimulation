import type { MarketEngine } from "../simulation/market-engine.js";
import type { ExecutionResult, PortfolioSnapshot } from "../simulation/types.js";
import { decisionSchema, type AgentDecision } from "./decision-schema.js";
import { observationSchema, type AgentObservation } from "./observation-schema.js";
import type { RetrievedMemory } from "./retrieved-memory.js";
import type { PublicMarketObservation } from "../market/market-feed.js";

export interface DecisionContext {
  observation: AgentObservation;
  previousObservation?: AgentObservation;
  /** Retrieved for this tick — omitted/empty for the no-memory baseline. */
  memories?: RetrievedMemory[];
}

/** A model adapter may use decisionSchema for native structured output. */
export type DecisionProvider = (context: DecisionContext) => unknown | Promise<unknown>;

export type MemoryRetriever = (
  context: Omit<DecisionContext, "memories">,
) => RetrievedMemory[] | Promise<RetrievedMemory[]>;

export interface DecisionRecord {
  observation: AgentObservation;
  decision: AgentDecision;
  results: ExecutionResult[];
  portfolioAfter: PortfolioSnapshot;
  memories: RetrievedMemory[];
}

function assertMemoryCitations(
  decision: AgentDecision,
  memories: RetrievedMemory[],
  agentId: string,
  memoryEnabled: boolean,
): void {
  if (!memoryEnabled) {
    if (decision.memoryReferences.length > 0) {
      throw new Error("no-memory baseline cannot reference memories");
    }
    return;
  }
  const byId = new Map(memories.map((m) => [m.id, m]));
  for (const id of decision.memoryReferences) {
    const hit = byId.get(id);
    if (!hit) {
      throw new Error(`decision references memory not retrieved: ${id}`);
    }
    if (hit.agentId !== agentId) {
      throw new Error(`decision references foreign memory: ${id}`);
    }
  }
}

/**
 * Decision cycle. Omit `retrieveMemories` for baseline A (no memory).
 * Pass `retrieveMemories` for governed retrieval + citation checks.
 */
export class AgentRuntime {
  private previousObservation: AgentObservation | undefined;
  private lastTick = -1;
  private running = false;

  constructor(
    private readonly options: {
      agentId: string;
      simulation: Pick<MarketEngine, "observe" | "getPortfolio" | "submitOrder">;
      decide: DecisionProvider;
      /** Public feature feed; the engine's true regime is never forwarded. */
      observeMarket?: () => PublicMarketObservation;
      /** When set, memories are retrieved before `decide` and citations are validated. */
      retrieveMemories?: MemoryRetriever;
    },
  ) {
    if (!options.agentId.trim()) throw new Error("agentId must not be empty");
  }

  async runCycle(): Promise<DecisionRecord> {
    if (this.running) throw new Error("agent decision cycle already running");
    this.running = true;
    try {
      const { agentId, simulation, decide, retrieveMemories } = this.options;
      const market = this.options.observeMarket?.() ?? simulation.observe();
      const observation = observationSchema.parse({
        tick: market.tick,
        ...("regimeEstimate" in market && market.regimeEstimate !== undefined
          ? { regimeEstimate: market.regimeEstimate }
          : {}),
        prices: market.prices,
        events: market.events,
        portfolio: simulation.getPortfolio(agentId),
      });
      if (observation.tick <= this.lastTick) throw new Error("agent already acted at this tick");

      const baseCtx = {
        observation,
        ...(this.previousObservation ? { previousObservation: this.previousObservation } : {}),
      };
      const memories = retrieveMemories
        ? structuredClone(await retrieveMemories(structuredClone(baseCtx)))
        : [];
      for (const memory of memories) {
        if (memory.agentId !== agentId) {
          throw new Error(`retrieveMemories returned foreign memory: ${memory.id}`);
        }
      }

      // Give providers copies so they cannot rewrite the recorded decision context.
      const decision = decisionSchema.parse(
        await decide(
          structuredClone({
            ...baseCtx,
            memories: memories,
          }),
        ),
      );
      assertMemoryCitations(decision, memories, agentId, Boolean(retrieveMemories));

      if (simulation.observe().tick !== observation.tick) {
        throw new Error("market advanced during decision generation");
      }
      // Validate the entire batch before submitting any orders.
      for (const order of decision.orders) {
        if (!Object.hasOwn(observation.prices, order.symbol)) {
          throw new Error(`decision references unknown symbol: ${order.symbol}`);
        }
      }
      this.lastTick = observation.tick;
      const results = decision.orders.map((order) => simulation.submitOrder({ ...order, agentId }));
      this.previousObservation = observation;
      return {
        observation,
        decision,
        results,
        portfolioAfter: simulation.getPortfolio(agentId),
        memories,
      };
    } finally {
      this.running = false;
    }
  }
}
