/**
 * Public surface of the evaluation harness. Kept intentionally small — import
 * from the owning module for anything not re-exported here.
 */
export { runOne } from "./runner.js";
export { computeRunMetrics, type AgentMetrics } from "./metrics.js";
export { runSuite, writeReport, renderMarkdown, type SuiteReport } from "./suite.js";
export { buildReplay, writeReplays } from "./replay.js";
export { replaySchema, type Replay } from "./replay-schema.js";
export {
  MEMORY_MODES,
  EVAL_ARCHETYPES,
  type MemoryMode,
  type RunRecord,
  type DecisionContext,
  type Decision,
  type DecisionSource,
} from "./types.js";
