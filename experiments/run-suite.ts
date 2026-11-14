import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "../src/memory/experiences/index.js";
import { DEFAULT_ASSETS, MarketEngine } from "../src/simulation/index.js";
import {
  appendPrices,
  decideHeuristic,
  type HeuristicId,
  type PriceHistory,
} from "./heuristics.js";
import { DEFAULT_WEIGHTS, scoreWeights, type Weights } from "./ranking-lab.js";
import { SCENARIOS, type ScenarioId } from "./scenarios.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");

const HEURISTICS: HeuristicId[] = ["momentum", "contrarian", "conservative"];
const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

type RunResult = {
  seed: number;
  scenario: ScenarioId;
  heuristic: HeuristicId;
  ticks: number;
  finalEquity: number;
  maxDrawdown: number;
  fills: number;
  rejections: number;
  experiences: number;
  isolationBreaches: number;
  experiencesBySector: Record<string, number>;
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

  // Isolation probe: ensure a second agent id never sees trader experiences
  let isolationBreaches = 0;
  if (store.listForAgent("other-agent").length > 0) isolationBreaches += 1;
  // Also verify query always requires agent filter (listForAgent is the API)

  const experiencesBySector: Record<string, number> = {};
  for (const exp of store.listForAgent(agentId)) {
    for (const s of exp.scope.sectors) {
      experiencesBySector[s] = (experiencesBySector[s] ?? 0) + 1;
    }
  }

  const final = engine.getPortfolio(agentId);
  return {
    seed,
    scenario: scenarioId,
    heuristic,
    ticks: scenario.ticks,
    finalEquity: final.equity,
    maxDrawdown: maxDrawdown(equities),
    fills,
    rejections,
    experiences: store.listForAgent(agentId).length,
    isolationBreaches,
    experiencesBySector,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function summarize(runs: RunResult[]) {
  const groups = new Map<string, RunResult[]>();
  for (const r of runs) {
    const key = `${r.scenario}::${r.heuristic}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, arr]) => {
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
}

function sweepRanking(): {
  best: Weights & { accuracy: number; isolationOk: boolean };
  gridSize: number;
  top: (Weights & { accuracy: number; isolationOk: boolean })[];
} {
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

  results.sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    if (a.isolationOk !== b.isolationOk) return a.isolationOk ? -1 : 1;
    return a.lambda - b.lambda;
  });

  const best = results.find((r) => r.isolationOk && r.accuracy === 1) ?? results[0]!;
  return { best, gridSize: results.length, top: results.slice(0, 10) };
}

function main() {
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

  const summary = summarize(runs);
  const ranking = sweepRanking();

  // Determinism spot-check: same seed twice → same equity
  const a = runOnce(42, "shock", "momentum");
  const b = runOnce(42, "shock", "momentum");
  const determinismOk =
    a.finalEquity === b.finalEquity &&
    a.fills === b.fills &&
    a.experiences === b.experiences;

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
    isolationTotalBreaches: runs.reduce((n, r) => n + r.isolationBreaches, 0),
    summary,
    rankingSweep: ranking,
    sampleRuns: runs.filter((r) => r.seed === seeds[0]),
  };

  const outPath = join(OUT_DIR, "suite-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const md = [
    "# Experiment suite report",
    "",
    `- Runs: **${runs.length}** (${seeds.length} seeds × ${SCENARIO_IDS.length} scenarios × ${HEURISTICS.length} heuristics)`,
    `- Duration: **${report.durationMs}ms**`,
    `- Determinism spot-check: **${determinismOk ? "PASS" : "FAIL"}**`,
    `- Isolation breaches: **${report.isolationTotalBreaches}**`,
    "",
    "## Strategy × scenario (mean final equity / drawdown / experiences)",
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
    `- Grid size: **${ranking.gridSize}**`,
    `- Best (accuracy=1 + isolation): λ=${ranking.best.lambda}, contextual=${ranking.best.contextual}, temporal=${ranking.best.temporal}, reliability=${ranking.best.reliability}`,
    "",
    "### Top configs",
    "",
    "| accuracy | isolation | λ | contextual | temporal | reliability |",
    "|---:|---|---:|---:|---:|---:|",
    ...ranking.top.map(
      (t) =>
        `| ${t.accuracy} | ${t.isolationOk} | ${t.lambda} | ${t.contextual} | ${t.temporal} | ${t.reliability} |`,
    ),
    "",
    `Raw JSON: \`experiments/out/suite-report.json\``,
  ].join("\n");

  writeFileSync(join(OUT_DIR, "suite-report.md"), md);
  console.log(md);
  console.log(`\nWrote ${outPath}`);
}

main();
