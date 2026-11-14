/**
 * Live-agent connectivity test for the Memory Arena viewer. Runs real OpenAI-
 * backed agents (reusing `run.ts`'s loop shape and `run-config.ts`'s plan),
 * assembles the result into the same `RunRecord` shape the deterministic eval
 * harness produces, and hands it to the existing `buildReplay()` — so the
 * live run renders in `app/` through the exact same, already-tested pipeline.
 *
 * Skips episodic experience/vector persistence (not needed to build a replay)
 * to keep this fast and cheap; `pnpm agents` remains the full production path.
 *
 * Usage: pnpm tsx src/agents/run-replay.ts [--ticks=N] [--agents=a,b] [--seed=N] [--scenario=...]
 */
import { writeFileSync } from "node:fs";
import { getAgentModel } from "../config.js";
import { getDb } from "../database/client.js";
import { buildReplay } from "../evaluation/replay.js";
import type { DecisionLogEntry, EvalLifecycleEvent, MemorySnapshotAtDecision, RunRecord } from "../evaluation/types.js";
import { MarketFeed } from "../market/market-feed.js";
import {
  ExperienceStore,
  MongoMemoryIndex,
  MongoMemoryRepository,
  OpenAIEmbedder,
  consolidateExperienceToMemory,
  quickRegimeLabel,
  recordTradeExperience,
  scoreLessonOutcome,
} from "../memory/index.js";
import { MarketEngine, toPublicInfo, type RegimeId } from "../simulation/index.js";
import type { ScenarioId } from "../../experiments/scenarios.js";
import { createAgent } from "./create-agent.js";
import { createOpenAIChatClient } from "./llm-provider.js";
import { retrieveForDecision } from "./memory-retrieve.js";
import { readAgentRunPlan } from "./run-config.js";

const progress: { agentId?: string; tick?: number } = {};

async function main(): Promise<void> {
  const plan = readAgentRunPlan();
  const started = Date.now();
  console.log(
    JSON.stringify({
      type: "replay_test_plan",
      seed: plan.seed,
      ticks: plan.ticks,
      warmupTicks: plan.warmupTicks,
      agents: plan.agents,
      expectedDecisionCalls: plan.expectedDecisionCalls,
      scenario: plan.scenario,
    }),
  );
  if (plan.dryRun) return;

  const model = getAgentModel();
  const simulation = new MarketEngine({ seed: plan.seed });
  for (const event of plan.events) simulation.scheduleEvent(event);
  for (const change of plan.regimeChanges) simulation.setRegime(change.regime, change.tick);
  const feed = new MarketFeed(simulation);

  const db = await getDb();
  const embedder = new OpenAIEmbedder();
  const lessons = new MongoMemoryIndex(db, embedder);
  const lessonRepo = new MongoMemoryRepository(db);
  const client = createOpenAIChatClient();
  const sectorOf = new Map(simulation.config.assets.map((asset) => [asset.symbol, asset.sector]));
  // Local, non-persistent — only to compute ExperienceRecord shapes for
  // consolidation; this test run doesn't write to the experiences collection.
  const scratchStore = new ExperienceStore();

  const lessonLossStreak = new Map<string, number>();
  const creationRegime = new Map<string, RegimeId>();
  const market: RunRecord["market"] = [];
  const decisions: DecisionLogEntry[] = [];
  const lifecycle: EvalLifecycleEvent[] = [];
  const regimeChanges: RunRecord["regimeChanges"] = [{ tick: 0, regime: simulation.currentRegime }];
  let lastRegimeTruth = simulation.currentRegime;

  const agents = [];
  for (const archetype of plan.agents) {
    const agentId = archetype; // single-use test run: archetype id is unique enough
    simulation.registerAgent(agentId);
    agents.push({
      agentId,
      archetype,
      runtime: createAgent({
        agentId,
        archetype,
        simulation,
        observeMarket: () => feed.observe(),
        model,
        client,
        retrieveMemories: (context) => retrieveForDecision({ index: lessons, agentId, ctx: context }),
      }),
    });
  }

  for (let tick = 0; tick < plan.warmupTicks; tick++) {
    const snap = feed.step();
    market.push({ tick: snap.tick, regime: snap.regime, marketReturn: snap.marketReturn, prices: { ...snap.prices } });
    if (snap.regime !== lastRegimeTruth) {
      regimeChanges.push({ tick: snap.tick, regime: snap.regime });
      lastRegimeTruth = snap.regime;
    }
  }
  console.log(JSON.stringify({ type: "warmup_complete", tick: simulation.tick, elapsedMs: Date.now() - started }));

  while (simulation.tick < plan.ticks) {
    const regimeEstimate = feed.observe().regimeEstimate;
    if (regimeEstimate === undefined) throw new Error("Regime estimate unavailable after warm-up");

    for (const { agentId, archetype, runtime } of agents) {
      progress.agentId = agentId;
      progress.tick = simulation.tick;
      const record = await runtime.runCycle();

      const experience = recordTradeExperience({
        store: scratchStore,
        agentId,
        simulationId: "replay-test",
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
      });
      if (experience.outcome.fills.length > 0) {
        const created = await consolidateExperienceToMemory({ index: lessons, experience });
        creationRegime.set(created.id, simulation.currentRegime);
      }

      const quickRegime = quickRegimeLabel(feed.observe().features.index.return1);
      const won = record.portfolioAfter.unrealizedPnl >= 0;
      for (const memoryId of record.decision.memoryReferences) {
        const lesson = await lessons.get(agentId, memoryId);
        if (!lesson || lesson.status !== "active") continue;
        const outcome = scoreLessonOutcome({
          reliability: lesson.reliability,
          scopeRegimes: lesson.scope.regimes,
          regimeEstimate: quickRegime,
          won,
          lossStreak: lessonLossStreak.get(memoryId) ?? 0,
          atTick: record.observation.tick,
        });
        lessonLossStreak.set(memoryId, outcome.lossStreak);
        if (outcome.action === "invalidate") {
          await lessons.invalidate(agentId, memoryId, outcome.reason, record.observation.tick);
          lifecycle.push({
            agentId,
            memoryId,
            from: "active",
            to: "invalidated",
            reason: outcome.reason,
            atTick: record.observation.tick,
          });
        } else {
          await lessons.upsert({
            id: memoryId,
            agentId,
            content: lesson.content,
            updatedAtTick: record.observation.tick,
            reliability: outcome.reliability,
            embedding: lesson.embedding,
            scope: lesson.scope,
          });
        }
      }

      const retrievedSnapshots: MemorySnapshotAtDecision[] = [];
      for (const m of record.memories) {
        const doc = await lessonRepo.findForAgent(agentId, m.id);
        if (!doc) continue;
        retrievedSnapshots.push({
          id: m.id,
          content: m.content,
          status: doc.status,
          confidence: doc.confidence,
          reliability: doc.reliability,
          retrievalScore: m.retrievalScore,
          createdAtTick: doc.createdAtTick,
          creationRegime: creationRegime.get(m.id) ?? simulation.currentRegime,
          fired: record.decision.memoryReferences.includes(m.id),
        });
      }

      decisions.push({
        tick: record.observation.tick,
        agentId,
        archetype,
        regime: simulation.currentRegime,
        decision: {
          orders: record.decision.orders,
          reasoning: record.decision.reasoning,
          strategy: record.decision.strategy,
          confidence: record.decision.confidence,
          firedMemoryIds: record.decision.memoryReferences,
        },
        results: record.results,
        portfolioAfter: record.portfolioAfter,
        // No counterfactual here: it would double every LLM call (decide again
        // with memories withheld), real $ and time cost for a connectivity test.
        counterfactual: null,
        retrieved: retrievedSnapshots,
      });
      console.log(
        JSON.stringify({ type: "cycle", tick: record.observation.tick, agentId, elapsedMs: Date.now() - started }),
      );
    }

    const snap = feed.step();
    market.push({ tick: snap.tick, regime: snap.regime, marketReturn: snap.marketReturn, prices: { ...snap.prices } });
    if (snap.regime !== lastRegimeTruth) {
      regimeChanges.push({ tick: snap.tick, regime: snap.regime });
      lastRegimeTruth = snap.regime;
    }
  }

  const run: RunRecord = {
    runId: `live-replay-test-seed${plan.seed}`,
    // Two separate "scenario id" concepts collide here (tracked in #26): the
    // chaos scenario (stable/shock_mid/whipsaw) isn't one of the eval
    // harness's own scenario ids. Display-only field; cast for the schema.
    scenario: plan.scenario as unknown as ScenarioId,
    seed: plan.seed,
    memoryMode: "governed",
    ticks: plan.ticks,
    warmup: plan.warmupTicks,
    startingCash: simulation.config.initialCash,
    assets: simulation.config.assets.map((a) => ({ symbol: a.symbol, sector: a.sector })),
    regimeChanges,
    events: simulation.getEvents().map(toPublicInfo),
    market,
    decisions,
    lifecycle,
    agents: plan.agents,
  };

  const replay = buildReplay(run);
  const outPath = "app/replay-live.json";
  writeFileSync(outPath, JSON.stringify(replay));
  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify({
      type: "replay_test_complete",
      outPath,
      elapsedMs,
      elapsedSec: Math.round(elapsedMs / 1000),
      ticks: plan.ticks,
      decisionCount: decisions.length,
      lifecycleEvents: lifecycle.length,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        type: "replay_test_failed",
        error: error instanceof Error ? error.message : String(error),
        ...progress,
      }),
    );
    process.exit(1);
  });
