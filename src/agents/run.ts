import { randomUUID } from "node:crypto";
import { getAgentModel } from "../config.js";
import { getDb } from "../database/client.js";
import { COLLECTIONS } from "../database/collections.js";
import { MarketFeed } from "../market/market-feed.js";
import {
  MEMORY_CONTENT_VERSION,
  MongoExperienceStore,
  MongoMemoryIndex,
  MongoVectorMemory,
  OpenAIEmbedder,
  consolidateExperienceToMemory,
  recordTradeExperience,
} from "../memory/index.js";
import { MarketEngine, REGIME_PARAMS, SIMULATION_VERSION } from "../simulation/index.js";
import { ARCHETYPES, type Archetype } from "./archetypes.js";
import { createAgent } from "./create-agent.js";
import { AGENT_PROMPT_VERSION, createOpenAIChatClient } from "./llm-provider.js";
import { retrieveForDecision } from "./memory-retrieve.js";

const SEED = 42;
const TICKS = 3;
/** Max past experiences per agent considered for embedding backfill. */
const BACKFILL_LIMIT = 200;

/** Where the run is, so a failure reports which cycle died. */
const progress: { simulationId?: string; agentId?: string; tick?: number } = {};

async function main(): Promise<void> {
  const model = getAgentModel();
  const simulation = new MarketEngine({ seed: SEED });
  // Advance time through the feed so the regime estimate sees every price.
  const feed = new MarketFeed(simulation);
  const simulationId = randomUUID();
  progress.simulationId = simulationId;
  // Private id per agent instance so runs never share history by accident.
  // Set AGENT_RUN_LABEL to reuse the same agents' memory across runs on purpose.
  const runLabel = process.env.AGENT_RUN_LABEL?.trim() || simulationId.slice(0, 8);
  const archetypes = Object.keys(ARCHETYPES) as Archetype[];
  const agentIds = new Map(archetypes.map((a) => [a, `${a}-${runLabel}`]));

  const db = await getDb();
  const store = new MongoExperienceStore(db);
  const embedder = new OpenAIEmbedder();
  // Decisions retrieve governed lessons (lifecycle- and reliability-aware), the
  // memory the A/B/C evaluation measures. Experience vectors are the episodic layer.
  const lessons = new MongoMemoryIndex(db, embedder);
  const vectors = new MongoVectorMemory(db, embedder);
  const client = createOpenAIChatClient();
  const sectorOf = new Map(simulation.config.assets.map((asset) => [asset.symbol, asset.sector]));

  // One record per run (simulation.md): enough to reproduce and compare it.
  const runRecord = {
    simulationId,
    startedAt: new Date().toISOString(),
    seed: SEED,
    ticks: TICKS,
    simulationVersion: SIMULATION_VERSION,
    market: {
      config: simulation.config,
      regimeParams: REGIME_PARAMS,
      events: simulation.getEvents(),
    },
    agents: {
      provider: "openai",
      model,
      promptVersion: AGENT_PROMPT_VERSION,
      runLabel,
      ids: Object.fromEntries(agentIds),
    },
    memory: {
      store: "mongodb",
      experiences: COLLECTIONS.experiences,
      vectors: COLLECTIONS.experienceVectors,
      lessons: COLLECTIONS.memories,
      retrieval: "governed lessons (MongoMemoryIndex + rankWithEmbeddings)",
      consolidation: "experiences with fills become lessons",
      embeddingModel: embedder.model,
      embeddingDimensions: embedder.dimensions,
      contentVersion: MEMORY_CONTENT_VERSION,
      backfillLimit: BACKFILL_LIMIT,
    },
  };
  console.log(JSON.stringify({ type: "run", ...runRecord }));
  await db
    .collection<typeof runRecord & { _id: string }>(COLLECTIONS.simulations)
    .insertOne({ _id: simulationId, ...runRecord });

  const agents = [];
  for (const archetype of archetypes) {
    const agentId = agentIds.get(archetype)!;
    simulation.registerAgent(agentId);
    // Only this agent's latest experiences, and only those without a vector yet.
    const history = await store.query({ agentId, limit: BACKFILL_LIMIT });
    await vectors.rememberMissing(agentId, history, "legacy-unrecorded");
    agents.push({
      agentId,
      runtime: createAgent({
        agentId,
        archetype,
        simulation,
        model,
        client,
        onLlmCall: (call) =>
          console.log(
            JSON.stringify({
              type: "llm_call",
              simulationId,
              agentId,
              tick: simulation.tick,
              ...call,
            }),
          ),
        retrieveMemories: (context) =>
          retrieveForDecision({ index: lessons, agentId, ctx: context }),
      }),
    });
  }

  for (let tick = 0; tick < TICKS; tick++) {
    // Inferred from observed prices only; absent until there is enough history.
    const regimeEstimate = feed.observe().regimeEstimate ?? "";
    // Finish every agent's decision before advancing the shared market.
    for (const { agentId, runtime } of agents) {
      progress.agentId = agentId;
      progress.tick = simulation.tick;
      const record = await runtime.runCycle();
      const experience = await recordTradeExperience({
        store,
        agentId,
        simulationId,
        tick: record.observation.tick,
        market: {
          regime: regimeEstimate, // Never the engine's true regime.
          prices: record.observation.prices,
          eventIds: record.observation.events.map((event) => event.id),
          eventTypes: [...new Set(record.observation.events.map((event) => event.type))],
        },
        decision: record.decision,
        results: record.results,
        sectorOf,
        realizedPnlDelta:
          record.portfolioAfter.realizedPnl - record.observation.portfolio.realizedPnl,
      });
      await vectors.remember(experience, model);
      // Only trades that executed carry a lesson; holds and rejections stay episodic.
      // Governance can later narrow or invalidate the lesson.
      if (experience.outcome.fills.length > 0) {
        await consolidateExperienceToMemory({ index: lessons, experience });
      }
      console.log(JSON.stringify({ type: "cycle", simulationId, ...record }));
    }
    feed.step();
  }

  console.log(`Final agent portfolios at tick ${simulation.tick} (run ${simulationId})`);
  console.table(
    agents.map(({ agentId }) => {
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
}

/** Drop anything that looks like a connection string or API key before printing. */
function redact(message: string): string {
  return message
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, "mongodb://<redacted>")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        type: "run_failed",
        error: redact(error instanceof Error ? error.message : String(error)),
        ...progress,
      }),
    );
    console.error(
      "No baseline fallback was used. Orders submitted earlier in this tick may already have filled (submitOrder is sequential, not a transaction); inspect the run before retrying.",
    );
    process.exit(1);
  });
