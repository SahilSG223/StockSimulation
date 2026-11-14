/**
 * Narrative runner for the judge demo: learn -> act_with_memory -> shock ->
 * govern -> act_after_govern (see docs/UI_PLAYBOOK.md). Deterministic and
 * offline — FakeEmbedder + in-memory MemoryIndex, no live OpenAI/Mongo.
 */
import { AgentRuntime, type DecisionContext as AgentDecisionContext } from "../agents/runtime.js";
import { retrieveForDecision } from "../agents/memory-retrieve.js";
import type { RetrievedMemory } from "../agents/retrieved-memory.js";
import type { AgentDecision } from "../agents/decision-schema.js";
import { FakeEmbedder, MemoryIndex, type EmbeddedMemory } from "../memory/embeddings/index.js";
import { MarketEngine, planChaos, type ChaosScenarioId } from "../simulation/index.js";
import type { PortfolioSnapshot } from "../simulation/types.js";
import { demoResultSchema, type DemoFrame, type DemoResult } from "./demo-frame.js";

const AGENT_ID = "demo-agent";
const LESSON_ID = "lesson-semi-momentum";
const LESSON_CONTENT =
  "In bull regimes, buy SEMI on positive AI demand — momentum in semiconductors paid off.";

export type RunMemoryDemoInput = {
  seed: number;
  scenarioId: ChaosScenarioId;
};

function decideFromMemories(ctx: AgentDecisionContext): AgentDecision {
  const memories = ctx.memories ?? [];
  if (memories.length === 0) {
    return {
      reasoning: "No active lessons retrieved — holding.",
      strategy: "conservative",
      confidence: 0.4,
      memoryReferences: [],
      orders: [],
    };
  }
  return {
    reasoning: `Retrieved bull/SEMI momentum lesson — buying SEMI.`,
    strategy: "momentum",
    confidence: 0.7,
    memoryReferences: memories.map((m) => m.id),
    orders: [{ symbol: "SEMI", side: "buy", quantity: 5 }],
  };
}

function memoryFiredFromRetrieved(memories: readonly RetrievedMemory[]) {
  // retrieveForDecision only ever returns active memories (rankWithEmbeddings
  // filters status === "active" before it returns a candidate).
  return memories.map((m) => ({
    id: m.id,
    content: m.content,
    retrievalScore: m.retrievalScore,
    status: "active" as const,
  }));
}

function memoryFiredFromInvalidated(memory: EmbeddedMemory | undefined) {
  return memory ? [{ id: memory.id, content: memory.content, retrievalScore: 0, status: memory.status }] : [];
}

function toPortfolioFrame(snapshot: PortfolioSnapshot) {
  return {
    cash: snapshot.cash,
    positions: snapshot.positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity })),
  };
}

export async function runMemoryDemo(input: RunMemoryDemoInput): Promise<DemoResult> {
  const { seed, scenarioId } = input;
  const engine = new MarketEngine({ seed, initialRegime: "bull" });
  engine.registerAgent(AGENT_ID);

  const index = new MemoryIndex(new FakeEmbedder());
  const frames: DemoFrame[] = [];

  // --- learn: seed the bull/SEMI lesson ---
  const lesson = await index.upsert({
    id: LESSON_ID,
    agentId: AGENT_ID,
    content: LESSON_CONTENT,
    updatedAtTick: engine.tick,
    reliability: 0.8,
    scope: { sectors: ["Semiconductors"], regimes: ["bull"], eventTypes: [], assets: ["SEMI"] },
  });
  frames.push({
    phase: "learn",
    tick: engine.tick,
    headline: "Seeded semantic lesson into memory",
    prices: engine.getPrices(),
    events: [],
    memoriesFired: [{ id: lesson.id, content: lesson.content, retrievalScore: 1, status: lesson.status }],
  });

  // --- act_with_memory: AgentRuntime retrieves + cites the lesson, buys SEMI ---
  const runtime = new AgentRuntime({
    agentId: AGENT_ID,
    simulation: engine,
    retrieveMemories: (ctx) => retrieveForDecision({ index, agentId: AGENT_ID, ctx }),
    decide: decideFromMemories,
  });
  const learnRecord = await runtime.runCycle();
  frames.push({
    phase: "act_with_memory",
    tick: learnRecord.observation.tick,
    headline: "Decision cites retrieved memory",
    prices: learnRecord.observation.prices,
    events: [],
    decision: learnRecord.decision,
    memoriesFired: memoryFiredFromRetrieved(learnRecord.memories),
    portfolio: toPortfolioFrame(learnRecord.portfolioAfter),
  });

  // --- shock: schedule the chaos plan, advance to its first tick ---
  const { events, plan } = planChaos({ seed, scenarioId });
  for (const event of events) engine.scheduleEvent(event);
  const firstShockTick = events[0]?.tick;
  engine.run(Math.max(1, (firstShockTick ?? engine.tick + 1) - engine.tick));
  const shockObs = engine.observe();
  frames.push({
    phase: "shock",
    tick: shockObs.tick,
    headline: shockObs.events[0]?.headline ?? "No scheduled shock this tick",
    prices: shockObs.prices,
    events: shockObs.events.map((e) => ({ id: e.id, type: e.type, headline: e.headline })),
    memoriesFired: [],
  });

  // --- govern: invalidate the now-stale lesson ---
  const invalidated = await index.invalidate(AGENT_ID, LESSON_ID);
  const shockType = shockObs.events[0]?.type ?? "elapsed tick";
  frames.push({
    phase: "govern",
    tick: shockObs.tick,
    headline: `Invalidated stale bull/SEMI lesson after ${shockType}`,
    prices: shockObs.prices,
    events: [],
    memoriesFired: memoryFiredFromInvalidated(invalidated),
  });

  // --- act_after_govern: no active lessons left, agent holds ---
  const afterGovernRecord = await runtime.runCycle();
  frames.push({
    phase: "act_after_govern",
    tick: afterGovernRecord.observation.tick,
    headline: "Post-governance decision — stale lesson must not fire",
    prices: afterGovernRecord.observation.prices,
    events: [],
    decision: afterGovernRecord.decision,
    memoriesFired: memoryFiredFromRetrieved(afterGovernRecord.memories),
    portfolio: toPortfolioFrame(afterGovernRecord.portfolioAfter),
  });

  return demoResultSchema.parse({ seed, agentId: AGENT_ID, chaosPlan: plan, frames });
}
