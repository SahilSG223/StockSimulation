/**
 * Narrative runner for the judge demo: learn -> act_with_memory -> shock ->
 * govern -> act_after_govern (see docs/UI_PLAYBOOK.md). Deterministic and
 * offline — FakeEmbedder + in-memory MemoryIndex, no live OpenAI/Mongo.
 *
 * Governance is evidence-based (same rule as EvalMemoryStore.recordOutcome,
 * src/evaluation/memory-lab.ts, via the shared `scoreLessonOutcome`): the
 * lesson is only invalidated if its position actually lost money while the
 * regime estimate no longer matches the lesson's learned regime. If nothing
 * contradicts it, it stays active and `act_after_govern` still cites it.
 */
import { AgentRuntime, type DecisionContext as AgentDecisionContext } from "../agents/runtime.js";
import { retrieveForDecision } from "../agents/memory-retrieve.js";
import type { RetrievedMemory } from "../agents/retrieved-memory.js";
import type { AgentDecision } from "../agents/decision-schema.js";
import {
  FakeEmbedder,
  MemoryIndex,
  quickRegimeLabel,
  scoreLessonOutcome,
  type EmbeddedMemory,
} from "../memory/embeddings/index.js";
import { MarketEngine, planChaos, type ChaosScenarioId } from "../simulation/index.js";
import type { PortfolioSnapshot } from "../simulation/types.js";
import { MarketFeed } from "../market/market-feed.js";
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
  const feed = new MarketFeed(engine);

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

  // --- shock: schedule the chaos plan, advance to the event's onset tick ---
  const { events, plan } = planChaos({ seed, scenarioId });
  for (const event of events) engine.scheduleEvent(event);
  const firstEvent = events[0];
  const shockTick = firstEvent ? firstEvent.tick : engine.tick + 1;
  const endTick = firstEvent ? firstEvent.tick + firstEvent.duration - 1 : shockTick;
  while (feed.observe().tick < shockTick) feed.step();
  const shockObs = feed.observe();
  frames.push({
    phase: "shock",
    tick: shockObs.tick,
    headline: shockObs.events[0]?.headline ?? "No scheduled shock this tick",
    prices: shockObs.prices,
    events: shockObs.events.map((e) => ({ id: e.id, type: e.type, headline: e.headline })),
    memoriesFired: [],
  });

  // --- govern: score the fired lesson's outcome every tick through the rest
  // of the shock window (same per-tick rule as EvalMemoryStore.recordOutcome
  // — a single losing tick only decays reliability; it takes consecutive
  // regime-mismatched losses to actually invalidate) ---
  let current: EmbeddedMemory | undefined = lesson;
  let lossStreak = 0;
  let lastAction: "reinforce" | "decay" | "invalidate" = "reinforce";
  let lastReason: string | undefined;
  let governTick = shockObs.tick;
  for (let tick = shockObs.tick; tick <= endTick && current; tick++) {
    if (tick > shockObs.tick) feed.step();
    const obs = feed.observe();
    governTick = obs.tick;
    const won = engine.getPortfolio(AGENT_ID).unrealizedPnl >= 0;
    // The calibrated regime estimator (src/market/regime-estimate.ts) needs 21
    // prices before it returns anything, far more than this ~10-tick demo
    // ever has. Use the 1-tick index return instead — already computed by
    // MarketFeed, observed-only, no ground truth — as a fast regime label.
    const regimeEstimate = quickRegimeLabel(obs.features.index.return1) || current.scope.regimes[0] || "";
    const outcome = scoreLessonOutcome({
      reliability: current.reliability,
      scopeRegimes: current.scope.regimes,
      regimeEstimate,
      won,
      lossStreak,
      atTick: obs.tick,
    });
    lossStreak = outcome.lossStreak;
    lastAction = outcome.action;
    if (outcome.action === "invalidate") {
      lastReason = outcome.reason;
      current = await index.invalidate(AGENT_ID, LESSON_ID, outcome.reason, obs.tick);
    } else {
      current = await index.upsert({
        id: LESSON_ID,
        agentId: AGENT_ID,
        content: LESSON_CONTENT,
        updatedAtTick: obs.tick,
        reliability: outcome.reliability,
        embedding: current.embedding,
        scope: current.scope,
      });
    }
  }

  const governHeadline =
    lastAction === "invalidate"
      ? `Invalidated lesson: ${lastReason}`
      : lastAction === "decay"
        ? `Lesson reliability decayed to ${current?.reliability.toFixed(2)} after an unrealized loss on SEMI`
        : `Lesson reliability reinforced to ${current?.reliability.toFixed(2)} — SEMI held its value`;
  frames.push({
    phase: "govern",
    tick: governTick,
    headline: governHeadline,
    prices: engine.getPrices(),
    events: [],
    memoriesFired: current
      ? [
          {
            id: current.id,
            content: current.content,
            retrievalScore: 0,
            status: current.status,
            ...(lastAction === "invalidate" ? { reason: lastReason! } : {}),
          },
        ]
      : [],
  });

  // --- act_after_govern: cites the lesson only if it survived governance ---
  const afterGovernRecord = await runtime.runCycle();
  frames.push({
    phase: "act_after_govern",
    tick: afterGovernRecord.observation.tick,
    headline:
      lastAction === "invalidate"
        ? "Post-governance decision — stale lesson must not fire"
        : "Post-governance decision — lesson still active, still cited",
    prices: afterGovernRecord.observation.prices,
    events: [],
    decision: afterGovernRecord.decision,
    memoriesFired: memoryFiredFromRetrieved(afterGovernRecord.memories),
    portfolio: toPortfolioFrame(afterGovernRecord.portfolioAfter),
  });

  return demoResultSchema.parse({ seed, agentId: AGENT_ID, chaosPlan: plan, frames });
}
