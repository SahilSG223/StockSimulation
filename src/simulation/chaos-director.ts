/**
 * Chaos Director — seeded shock planner. NOT an agent. NOT an LLM. Never sets
 * prices directly; it only builds `MarketEvent[]` from `createShock` /
 * `SHOCK_PRESETS` for the caller to pass to `MarketEngine.scheduleEvent`.
 *
 * Contract: `planChaos({ seed, scenarioId })` → `{ events, plan }`, where the
 * same seed + scenarioId always produces the same plan (seeded via `SeededRng`,
 * never bare `Math.random()`).
 */

import { SeededRng } from "./rng.js";
import { createShock, type ShockPresetId } from "./shock-library.js";
import type { MarketEvent } from "./types.js";

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

function toResult(plan: ChaosPlanEntry[]): ChaosPlanResult {
  return {
    plan,
    events: plan.map(({ preset, tick }) => createShock(preset, { tick })),
  };
}

export function planChaos(input: PlanChaosInput): ChaosPlanResult {
  const rng = new SeededRng(input.seed);

  switch (input.scenarioId) {
    case "stable":
      return toResult([]);

    case "shock_mid": {
      const tick = 3 + Math.floor(rng.nextFloat() * 5); // mid tick in [3, 7]
      return toResult([{ preset: "chip_export_ban", tick }]);
    }

    case "whipsaw": {
      const start = 2 + Math.floor(rng.nextFloat() * 3); // [2, 4]
      const gap = 2 + Math.floor(rng.nextFloat() * 3); // [2, 4]
      const presets: ShockPresetId[] = ["market_crash", "ai_demand_spike", "chip_export_ban"];
      return toResult(presets.map((preset, i) => ({ preset, tick: start + i * gap })));
    }
  }
}
