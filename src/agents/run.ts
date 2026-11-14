import { MarketEngine } from "../simulation/market-engine.js";
import { randomUUID } from "node:crypto";
import {
  connectMongoMemory,
  recordTradeExperience,
  createEmbeddingProvider,
  MongoVectorMemory,
} from "../memory/index.js";
import { ARCHETYPES, type Archetype } from "./archetypes.js";
import { createAgent } from "./create-agent.js";
import { AGENT_PROMPT_VERSION, readLlmConfig } from "./llm-provider.js";
import { memoryQuery } from "./memory-query.js";

async function main(): Promise<void> {
  const config = readLlmConfig();
  const simulation = new MarketEngine({ seed: 42 });
  const simulationId = randomUUID();
  const embeddings = createEmbeddingProvider();
  const memory = await connectMongoMemory();
  try {
    const vectors = await MongoVectorMemory.open(memory.database, embeddings);
    const agents = [];
    for (const archetype of Object.keys(ARCHETYPES) as Archetype[]) {
      simulation.registerAgent(archetype);
      // Backfill unembedded records from earlier runs; existing vectors are not overwritten.
      for (const experience of await memory.store.listForAgent(archetype)) {
        await vectors.remember(experience, "legacy-unrecorded");
      }
      agents.push(
        createAgent({
          agentId: archetype,
          archetype,
          simulation,
          retrieveMemories: (context) =>
            vectors.retrieve(memoryQuery(context, simulationId, archetype)),
        }),
      );
    }
    console.log(
      JSON.stringify({
        seed: 42,
        simulationId,
        memory: "mongodb-vector-search",
        embeddingModel: embeddings.model,
        provider: "openai",
        model: config.model,
        promptVersion: AGENT_PROMPT_VERSION,
      }),
    );
    for (let tick = 0; tick < 3; tick++) {
      // Finish every agent's decision before advancing the shared market.
      for (const agent of agents) {
        const record = await agent.runCycle();
        const experience = await recordTradeExperience({
          store: memory.store,
          agentId: record.observation.portfolio.agentId,
          simulationId,
          tick: record.observation.tick,
          market: {
            regime: "", // Ground-truth regimes are not part of the agent's observation.
            prices: record.observation.prices,
            eventIds: record.observation.events.map((event) => event.id),
            eventTypes: [...new Set(record.observation.events.map((event) => event.type))],
          },
          decision: record.decision,
          results: record.results,
          sectorOf: new Map(simulation.config.assets.map((asset) => [asset.symbol, asset.sector])),
          realizedPnlDelta:
            record.portfolioAfter.realizedPnl - record.observation.portfolio.realizedPnl,
        });
        await vectors.remember(experience, config.model);
        console.log(JSON.stringify(record));
      }
      simulation.step();
    }
    console.log(`Final agent portfolios at tick ${simulation.tick} (run ${simulationId})`);
    console.table(
      (Object.keys(ARCHETYPES) as Archetype[]).map((agentId) => {
        const portfolio = simulation.getPortfolio(agentId);
        return {
          Agent: agentId,
          "Starting cash": simulation.config.initialCash.toFixed(2),
          Cash: portfolio.cash.toFixed(2),
          Equity: portfolio.equity.toFixed(2),
          "Realized P&L": portfolio.realizedPnl.toFixed(2),
          "Unrealized P&L": portfolio.unrealizedPnl.toFixed(2),
          "Net P&L": (portfolio.equity - simulation.config.initialCash).toFixed(2),
          Holdings:
            portfolio.positions
              .map((position) => `${position.symbol}: ${position.quantity}`)
              .join(", ") || "none",
        };
      }),
    );
  } finally {
    await memory.close();
  }
}

main().catch(() => {
  console.error(
    "Agent run failed. Check AGENT_MODEL, EMBEDDING_MODEL, provider keys, MongoDB connection and Vector Search index readiness. No baseline fallback was used. If execution already occurred, inspect the run before retrying.",
  );
  process.exitCode = 1;
});
