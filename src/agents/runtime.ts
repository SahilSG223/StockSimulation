import type { MarketEngine } from "../simulation/market-engine.js";
import type { ExecutionResult, PortfolioSnapshot } from "../simulation/types.js";
import { decisionSchema, type AgentDecision } from "./decision-schema.js";
import { observationSchema, type AgentObservation } from "./observation-schema.js";

export interface DecisionContext {
  observation: AgentObservation;
  previousObservation?: AgentObservation;
}

/** A model adapter may use decisionSchema for native structured output. */
export type DecisionProvider = (context: DecisionContext) => unknown | Promise<unknown>;

export interface DecisionRecord {
  observation: AgentObservation;
  decision: AgentDecision;
  results: ExecutionResult[];
  portfolioAfter: PortfolioSnapshot;
}

/** No-memory baseline. The caller registers the agent and advances the market. */
export class AgentRuntime {
  private previousObservation: AgentObservation | undefined;
  private lastTick = -1;
  private running = false;

  constructor(
    private readonly options: {
      agentId: string;
      simulation: Pick<MarketEngine, "observe" | "getPortfolio" | "submitOrder">;
      decide: DecisionProvider;
    },
  ) {
    if (!options.agentId.trim()) throw new Error("agentId must not be empty");
  }

  async runCycle(): Promise<DecisionRecord> {
    if (this.running) throw new Error("agent decision cycle already running");
    this.running = true;
    try {
      const { agentId, simulation, decide } = this.options;
      const market = simulation.observe();
      const observation = observationSchema.parse({
        tick: market.tick,
        prices: market.prices,
        events: market.events,
        portfolio: simulation.getPortfolio(agentId),
      });
      if (observation.tick <= this.lastTick) throw new Error("agent already acted at this tick");

      // Give providers copies so they cannot rewrite the recorded decision context.
      const decision = decisionSchema.parse(
        await decide(
          structuredClone({
            observation,
            ...(this.previousObservation ? { previousObservation: this.previousObservation } : {}),
          }),
        ),
      );
      if (decision.memoryReferences.length > 0) {
        throw new Error("no-memory baseline cannot reference memories");
      }
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
      return { observation, decision, results, portfolioAfter: simulation.getPortfolio(agentId) };
    } finally {
      this.running = false;
    }
  }
}
