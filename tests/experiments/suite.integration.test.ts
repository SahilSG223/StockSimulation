/**
 * Heavy experiment suite — run with:
 *   pnpm exec vitest run tests/experiments/suite.integration.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "../../src/memory/experiences/index.js";
import { DEFAULT_ASSETS, MarketEngine } from "../../src/simulation/index.js";
import {
  appendPrices,
  decideHeuristic,
  type HeuristicId,
  type PriceHistory,
} from "../../experiments/heuristics.js";
import { DEFAULT_WEIGHTS, scoreWeights, type Weights } from "../../experiments/ranking-lab.js";
import { SCENARIOS, type ScenarioId } from "../../experiments/scenarios.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "../../experiments/out");

const HEURISTICS: HeuristicId[] = ["momentum", "contrarian", "conservative"];
const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

type RunResult = {
  seed: number;
  scenario: ScenarioId;
  heuristic: HeuristicId;
  finalEquity: number;
  maxDrawdown: number;
  fills: number;
  rejections: number;
  experiences: number;
  isolationBreaches: number;
};

function maxDrawdown(equities: number[]): number {
  let peak = equities[0] ?? 0;
  let dd = 0;
  for (const e of equities) {
    peak = Math.max(peak, e);
    if (peak > 0) dd = Math.max(dd, (peak - e) / peak);
  }
  return dd;
}

function runOnce(seed: number, scenarioId: ScenarioId, heuristic: HeuristicId): RunResult {
  const scenario = SCENARIOS[scenarioId];
  const engine = new MarketEngine({ seed, initialRegime: "bull" });
  const agentId = "trader";
  engine.registerAgent(agentId);
  scenario.setup(engine);

  const store = new ExperienceStore();
  const sectorOf = new Map(DEFAULT_ASSETS.map((a) => [a.symbol, a.sector]));
  const history: PriceHistory = new Map();
  const equities: number[] = [];
  let fills = 0;
  let rejections = 0;

  appendPrices(history, engine.getPrices());

  for (let t = 0; t < scenario.ticks; t++) {
    const obs = engine.observe();
    if (t >= scenario.warmup) {
      const port = engine.getPortfolio(agentId);
      const decision = decideHeuristic({
        agentId,
        heuristic,
        obs,
        history,
        cash: port.cash,
      });
      const results = decision.orders.map((o) => engine.submitOrder(o));
      for (const r of results) {
        if (r.status === "filled") fills += 1;
        else rejections += 1;
      }
      if (results.length > 0) {
        recordTradeExperience({
          store,
          agentId,
          simulationId: `seed-${seed}-${scenarioId}`,
          tick: obs.tick,
          market: marketContextFromObservation(obs),
          decision: {
            reasoning: decision.reasoning,
            strategy: decision.strategy,
            confidence: decision.confidence,
            memoryReferences: [],
            orders: decision.orders.map(({ symbol, side, quantity }) => ({
              symbol,
              side,
              quantity,
            })),
          },
          results,
          sectorOf,
        });
      }
    }

    equities.push(engine.getPortfolio(agentId).equity);
    engine.step();
    appendPrices(history, engine.getPrices());
  }

  let isolationBreaches = 0;
  if (store.listForAgent("other-agent").length > 0) isolationBreaches += 1;

  return {
    seed,
    scenario: scenarioId,
    heuristic,
    finalEquity: engine.getPortfolio(agentId).equity,
    maxDrawdown: maxDrawdown(equities),
    fills,
    rejections,
    experiences: store.listForAgent(agentId).length,
    isolationBreaches,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sweepRanking() {
  const lambdas = [0.005, 0.02, 0.05, 0.1];
  const contextuals = [0.5, 1, 1.5, 2];
  const temporals = [0.5, 1, 1.5, 2];
  const reliabilitys = [0.5, 1, 1.5];
  const results: (Weights & { accuracy: number; isolationOk: boolean })[] = [];

  for (const lambda of lambdas) {
    for (const contextual of contextuals) {
      for (const temporal of temporals) {
        for (const reliability of reliabilitys) {
          const weights: Weights = {
            ...DEFAULT_WEIGHTS,
            lambda,
            contextual,
            temporal,
            reliability,
            semantic: 1,
          };
          const scored = scoreWeights(weights);
          results.push({ ...weights, accuracy: scored.accuracy, isolationOk: scored.isolationOk });
        }
      }
    }
  }

  results.sort((a, b) => b.accuracy - a.accuracy || (a.isolationOk === b.isolationOk ? 0 : a.isolationOk ? -1 : 1));
  const perfect = results.filter((r) => r.isolationOk && r.accuracy === 1);
  return {
    gridSize: results.length,
    perfectCount: perfect.length,
    best: perfect[0] ?? results[0]!,
    top: results.slice(0, 12),
  };
}

describe("extensive experiment suite", () => {
  it(
    "runs multi-seed scenarios + ranking sweep and writes report",
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i);
      const runs: RunResult[] = [];
      const started = Date.now();

      for (const seed of seeds) {
        for (const scenario of SCENARIO_IDS) {
          for (const heuristic of HEURISTICS) {
            runs.push(runOnce(seed, scenario, heuristic));
          }
        }
      }

      const groups = new Map<string, RunResult[]>();
      for (const r of runs) {
        const key = `${r.scenario}::${r.heuristic}`;
        const arr = groups.get(key) ?? [];
        arr.push(r);
        groups.set(key, arr);
      }
      const summary = [...groups.entries()].map(([key, arr]) => {
        const [scenario, heuristic] = key.split("::") as [ScenarioId, HeuristicId];
        return {
          scenario,
          heuristic,
          n: arr.length,
          meanEquity: mean(arr.map((r) => r.finalEquity)),
          meanDrawdown: mean(arr.map((r) => r.maxDrawdown)),
          meanFills: mean(arr.map((r) => r.fills)),
          meanExperiences: mean(arr.map((r) => r.experiences)),
          isolationBreaches: arr.reduce((a, r) => a + r.isolationBreaches, 0),
        };
      });

      const ranking = sweepRanking();
      const a = runOnce(42, "shock", "momentum");
      const b = runOnce(42, "shock", "momentum");
      const determinismOk =
        a.finalEquity === b.finalEquity && a.fills === b.fills && a.experiences === b.experiences;

      const isolationTotalBreaches = runs.reduce((n, r) => n + r.isolationBreaches, 0);

      const report = {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        config: {
          seeds: seeds.length,
          scenarios: SCENARIO_IDS,
          heuristics: HEURISTICS,
          totalRuns: runs.length,
        },
        determinismOk,
        isolationTotalBreaches,
        summary,
        rankingSweep: ranking,
      };

      writeFileSync(join(OUT_DIR, "suite-report.json"), JSON.stringify(report, null, 2));

      const md = [
        "# Experiment suite report",
        "",
        `- Runs: **${runs.length}** (${seeds.length} seeds × ${SCENARIO_IDS.length} scenarios × ${HEURISTICS.length} heuristics)`,
        `- Duration: **${report.durationMs}ms**`,
        `- Determinism spot-check: **${determinismOk ? "PASS" : "FAIL"}**`,
        `- Isolation breaches: **${isolationTotalBreaches}**`,
        "",
        "## Strategy × scenario",
        "",
        "| Scenario | Heuristic | Mean equity | Mean DD | Mean fills | Mean experiences |",
        "|---|---|---:|---:|---:|---:|",
        ...summary.map(
          (s) =>
            `| ${s.scenario} | ${s.heuristic} | ${s.meanEquity.toFixed(2)} | ${(s.meanDrawdown * 100).toFixed(2)}% | ${s.meanFills.toFixed(1)} | ${s.meanExperiences.toFixed(1)} |`,
        ),
        "",
        "## Ranking hyperparameter sweep",
        "",
        `- Grid size: **${ranking.gridSize}** (${ranking.perfectCount} perfect)`,
        `- Best: λ=${ranking.best.lambda}, contextual=${ranking.best.contextual}, temporal=${ranking.best.temporal}, reliability=${ranking.best.reliability}`,
        "",
      ].join("\n");

      writeFileSync(join(OUT_DIR, "suite-report.md"), md);

      expect(determinismOk).toBe(true);
      expect(isolationTotalBreaches).toBe(0);
      expect(runs.length).toBe(40 * 3 * 3);
      expect(ranking.perfectCount).toBeGreaterThan(0);
    },
    120_000,
  );
});
