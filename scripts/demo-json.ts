/**
 * Regenerate docs/examples/memory-demo.sample.json from a real runMemoryDemo
 * run (no live OpenAI/Mongo required). Usage:
 *   pnpm demo:json [seed] [stable|shock_mid|whipsaw]
 */
import { writeFileSync } from "node:fs";
import { runMemoryDemo } from "../src/evaluation/run-memory-demo.js";
import type { ChaosScenarioId } from "../src/simulation/index.js";

const seed = Number(process.argv[2] ?? 42);
const scenarioId = (process.argv[3] ?? "shock_mid") as ChaosScenarioId;
const outPath = "docs/examples/memory-demo.sample.json";

const result = await runMemoryDemo({ seed, scenarioId });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(`wrote ${outPath} (seed=${seed}, scenario=${scenarioId})`);
