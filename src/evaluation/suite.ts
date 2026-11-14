/**
 * The experiment suite: every scenario × SEEDS seeds × every memory mode. It
 * runs each cell, computes per-agent metrics, aggregates means per (scenario,
 * mode), and writes `out/report.json` (machine) and `out/report.md` (human,
 * including a Findings section derived from the numbers). No number in the report
 * is hand-written — regenerate with `pnpm tsx src/evaluation/suite.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, type ScenarioId } from "../../experiments/scenarios.js";
import { computeRunMetrics, type AgentMetrics } from "./metrics.js";
import { runOne } from "./runner.js";
import { MEMORY_MODES, type MemoryMode } from "./types.js";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

/** Mean of a metric over all (seed, agent) cells; ignores undefined (e.g. ticksToAdapt). */
type Aggregate = {
  scenario: ScenarioId;
  memoryMode: MemoryMode;
  runs: number;
  agentsPerRun: number;
  finalEquity: number;
  netPnl: number;
  maxDrawdown: number;
  feesPaid: number;
  ticksToAdapt: number | null;
  ticksToAdaptCoverage: number;
  staleInfluenceRate: number;
  repeatedMistakes: number;
  flipRate: number;
};

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function aggregate(scenario: ScenarioId, memoryMode: MemoryMode): Aggregate {
  const cells: AgentMetrics[] = [];
  let startingCash = 0;
  for (const seed of SEEDS) {
    const run = runOne({ scenario, seed, memoryMode });
    startingCash = run.startingCash;
    cells.push(...Object.values(computeRunMetrics(run)));
  }
  const adapt = cells.map((c) => c.ticksToAdapt).filter((t): t is number => t !== undefined);
  return {
    scenario,
    memoryMode,
    runs: SEEDS.length,
    agentsPerRun: cells.length / SEEDS.length,
    finalEquity: mean(cells.map((c) => c.finalEquity)),
    netPnl: mean(cells.map((c) => c.finalEquity - startingCash)),
    maxDrawdown: mean(cells.map((c) => c.maxDrawdown)),
    feesPaid: mean(cells.map((c) => c.feesPaid)),
    ticksToAdapt: adapt.length === 0 ? null : mean(adapt),
    ticksToAdaptCoverage: cells.length === 0 ? 0 : adapt.length / cells.length,
    staleInfluenceRate: mean(cells.map((c) => c.staleInfluenceRate)),
    repeatedMistakes: mean(cells.map((c) => c.repeatedMistakes)),
    flipRate: mean(cells.map((c) => c.flipRate)),
  };
}

export type SuiteReport = {
  generatedAt: string;
  seeds: number[];
  scenarios: ScenarioId[];
  modes: MemoryMode[];
  aggregates: Aggregate[];
};

export function runSuite(): SuiteReport {
  const aggregates: Aggregate[] = [];
  for (const scenario of SCENARIO_IDS) {
    for (const mode of MEMORY_MODES) aggregates.push(aggregate(scenario, mode));
  }
  return {
    generatedAt: new Date().toISOString(),
    seeds: SEEDS,
    scenarios: SCENARIO_IDS,
    modes: [...MEMORY_MODES],
    aggregates,
  };
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

function byScenario(report: SuiteReport, scenario: ScenarioId): Record<MemoryMode, Aggregate> {
  const out = {} as Record<MemoryMode, Aggregate>;
  for (const a of report.aggregates) if (a.scenario === scenario) out[a.memoryMode] = a;
  return out;
}

/** Compare governed against raw on a metric; direction says which way is "better". */
function delta(governed: number, raw: number, lowerIsBetter: boolean): string {
  const diff = governed - raw;
  const sign = diff > 0 ? "+" : "";
  if (Math.abs(diff) < 0.005) return `${diff.toFixed(2)} =`;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return `${sign}${diff.toFixed(2)} ${better ? "✓" : "✗"}`;
}

function findings(report: SuiteReport): string[] {
  const lines: string[] = [];
  for (const scenario of report.scenarios) {
    const m = byScenario(report, scenario);
    const g = m.governed;
    const r = m.raw;
    const n = m.none;
    const adaptNote =
      g.ticksToAdapt !== null && r.ticksToAdapt !== null
        ? `ticksToAdapt ${fmt(g.ticksToAdapt)} vs raw ${fmt(r.ticksToAdapt)} (${delta(g.ticksToAdapt, r.ticksToAdapt, true)})`
        : "ticksToAdapt n/a (no pre-change exposure to adapt)";
    lines.push(
      `- **${scenario}** — governed vs raw: stale ${fmt(g.staleInfluenceRate)} vs ${fmt(r.staleInfluenceRate)} ` +
        `(${delta(g.staleInfluenceRate, r.staleInfluenceRate, true)}), ` +
        `repeatedMistakes ${fmt(g.repeatedMistakes)} vs ${fmt(r.repeatedMistakes)} ` +
        `(${delta(g.repeatedMistakes, r.repeatedMistakes, true)}), ` +
        `maxDrawdown ${fmt(g.maxDrawdown, 3)} vs ${fmt(r.maxDrawdown, 3)} ` +
        `(${delta(g.maxDrawdown, r.maxDrawdown, true)}), ${adaptNote}. ` +
        `netPnl governed ${fmt(g.netPnl, 0)} vs raw ${fmt(r.netPnl, 0)} vs none ${fmt(n.netPnl, 0)}.`,
    );
  }
  return lines;
}

function metricRows(m: Record<MemoryMode, Aggregate>): string[] {
  return MEMORY_MODES.map((mode) => {
    const a = m[mode];
    return `| ${mode} | ${fmt(a.netPnl, 0)} | ${fmt(a.maxDrawdown, 3)} | ${fmt(a.feesPaid, 0)} | ${fmt(a.ticksToAdapt)} (${fmt(a.ticksToAdaptCoverage * 100, 0)}%) | ${fmt(a.staleInfluenceRate)} | ${fmt(a.repeatedMistakes)} | ${fmt(a.flipRate)} |`;
  });
}

export function renderMarkdown(report: SuiteReport): string {
  const out: string[] = [];
  out.push("# Evaluation suite report");
  out.push("");
  out.push(
    `_Generated ${report.generatedAt} · ${report.seeds.length} seeds × ${report.scenarios.length} scenarios × ${report.modes.length} memory modes. Do not hand-edit; regenerate with \`pnpm tsx src/evaluation/suite.ts\`._`,
  );
  out.push("");
  out.push(
    "Thesis under test: **governed memory makes agents adapt faster to market change than no memory or ungoverned ('raw') memory.** Means are over all seeds and all 7 archetypes per cell.",
  );
  out.push("");
  out.push("Metric legend:");
  out.push("");
  out.push("- **netPnl** — mean final equity minus starting cash.");
  out.push("- **maxDrawdown** — mean largest peak-to-trough equity drop (fraction).");
  out.push("- **ticksToAdapt** — mean ticks from the change point to the first adapting decision (coverage = share of agent-runs that had pre-change exposure to adapt). Lower is better.");
  out.push("- **stale** — share of post-change memory-firing decisions citing a now-invalid-regime lesson. Lower is better.");
  out.push("- **repeatedMistakes** — losing buys citing a memory after that memory's first losing buy. Lower is better.");
  out.push("- **flipRate** — core counterfactual: share of memory-firing decisions whose action changed when memory was withheld.");
  out.push("");
  for (const scenario of report.scenarios) {
    out.push(`## ${scenario}`);
    out.push("");
    out.push("| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    out.push(...metricRows(byScenario(report, scenario)));
    out.push("");
  }
  out.push("## Findings");
  out.push("");
  out.push(...findings(report));
  out.push("");
  return out.join("\n");
}

export function writeReport(report: SuiteReport): { json: string; md: string } {
  mkdirSync(OUT_DIR, { recursive: true });
  const json = join(OUT_DIR, "report.json");
  const md = join(OUT_DIR, "report.md");
  writeFileSync(json, JSON.stringify(report, null, 2));
  writeFileSync(md, renderMarkdown(report));
  return { json, md };
}

// Direct-run entrypoint: `pnpm tsx src/evaluation/suite.ts`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const start = Date.now();
  const report = runSuite();
  const { json, md } = writeReport(report);
  console.log(`suite: ${report.aggregates.length} cells in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(`wrote ${md}`);
  console.log(`wrote ${json}`);
}
