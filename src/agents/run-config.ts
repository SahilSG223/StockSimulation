import { parseArgs } from "node:util";
import { z } from "zod";
import {
  planChaos,
  createShock,
  type ChaosScenarioId,
  type RegimeId,
} from "../simulation/index.js";
import { ARCHETYPES, type Archetype } from "./archetypes.js";

export const AGENT_WARMUP_TICKS = 20;
const scenarioIds = [
  "stable",
  "shock_mid",
  "whipsaw",
] as const satisfies readonly ChaosScenarioId[];
const archetypes = Object.keys(ARCHETYPES) as [Archetype, ...Archetype[]];
const runOptionsSchema = z.object({
  ticks: z.coerce
    .number()
    .int()
    .safe()
    .min(AGENT_WARMUP_TICKS + 1),
  seed: z.coerce.number().int().min(0).max(0xffff_ffff),
  scenario: z.enum(scenarioIds),
  agents: z
    .array(z.enum(archetypes))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate agents are not allowed"),
  dryRun: z.boolean(),
});

/** Pure planning: no credentials, external calls, or writes. CLI overrides env. */
export function readAgentRunPlan(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
) {
  const { values } = parseArgs({
    args: argv[0] === "--" ? argv.slice(1) : argv,
    strict: true,
    options: {
      ticks: { type: "string" },
      agents: { type: "string" },
      scenario: { type: "string" },
      seed: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const options = runOptionsSchema.parse({
    ticks: values.ticks ?? env.AGENT_TICKS ?? "27",
    seed: values.seed ?? env.AGENT_SEED ?? "42",
    scenario: values.scenario ?? env.AGENT_SCENARIO ?? "shock_mid",
    agents: (values.agents ?? env.AGENTS ?? archetypes.join(",")).split(",").map((id) => id.trim()),
    dryRun: values["dry-run"],
  });
  const { plan } = planChaos({ seed: options.seed, scenarioId: options.scenario });
  // Rebuild through createShock so canonical event ids match the shifted ticks.
  // Start after one decision, preserving the director's spacing between shocks.
  const chaosOffsetTicks = plan.length
    ? AGENT_WARMUP_TICKS + 1 - plan[0]!.tick
    : AGENT_WARMUP_TICKS;
  const chaosPlan = plan.map((entry) => ({ ...entry, tick: entry.tick + chaosOffsetTicks }));
  const events = chaosPlan.map(({ preset, tick }) => createShock(preset, { tick }));
  const lastShockEnd = Math.max(
    AGENT_WARMUP_TICKS,
    ...events.map((event) => event.tick + event.duration),
  );
  // Defaults fit every scenario; explicit durations must still cover all events.
  const ticks =
    values.ticks === undefined && env.AGENT_TICKS === undefined
      ? Math.max(options.ticks, lastShockEnd + 1)
      : options.ticks;
  if (ticks <= lastShockEnd) {
    throw new Error(
      `AGENT_TICKS must be at least ${lastShockEnd + 1} for ${options.scenario}, including a decision after the last shock ends`,
    );
  }
  const regimeChanges = chaosPlan.map((entry, index): { tick: number; regime: RegimeId } => ({
    tick: entry.tick,
    regime:
      options.scenario === "whipsaw" ? (["high_vol", "bull", "bear"] as const)[index]! : "bear",
  }));
  return {
    ...options,
    ticks,
    warmupTicks: AGENT_WARMUP_TICKS,
    decisionTicks: ticks - AGENT_WARMUP_TICKS,
    expectedDecisionCalls: options.agents.length * (ticks - AGENT_WARMUP_TICKS),
    chaosOffsetTicks,
    chaosPlan,
    events,
    regimeChanges,
  };
}

export type AgentRunPlan = ReturnType<typeof readAgentRunPlan>;
