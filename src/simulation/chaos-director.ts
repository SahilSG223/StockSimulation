/**
 * Chaos Director — IMPLEMENT ON LAPTOP 2 (see this PR's body).
 *
 * Seeded shock planner. NOT an agent. NOT an LLM. Does not set prices.
 * Uses existing `createShock` / `SHOCK_PRESETS` and returns events for
 * `MarketEngine.scheduleEvent`.
 *
 * Contract (from docs/plan.md — merge docs PR if not on main yet):
 *   planChaos({ seed, scenarioId }) → { events, plan }
 *   same seed + scenarioId → identical plan
 *
 * Scenarios: stable | shock_mid | whipsaw
 * Cut whipsaw if time-constrained.
 */

import type { MarketEvent } from "./types.js";
import type { ShockPresetId } from "./shock-library.js";

export type ChaosScenarioId = "stable" | "shock_mid" | "whipsaw";

export type ChaosPlanEntry = {
  preset: ShockPresetId;
  tick: number;
};

export type ChaosPlanResult = {
  events: MarketEvent[];
  plan: ChaosPlanEntry[];
};

export type PlanChaosInput = {
  seed: number;
  scenarioId: ChaosScenarioId;
};

/**
 * @throws until implemented — do not call from production paths yet.
 */
export function planChaos(_input: PlanChaosInput): ChaosPlanResult {
  throw new Error(
    "planChaos not implemented — laptop 2: see PR body for feat/chaos-director",
  );
}
