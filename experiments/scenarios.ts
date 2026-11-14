import type { MarketEngine, MarketEvent } from "../src/simulation/index.js";

export type ScenarioId = "stable" | "shock" | "regime_reversal";

export type ScenarioSpec = {
  id: ScenarioId;
  ticks: number;
  /** Warmup ticks before agents trade. */
  warmup: number;
  setup: (engine: MarketEngine) => void;
};

const aiDemandShock = (tick: number): MarketEvent => ({
  id: `evt-ai-${tick}`,
  type: "positive_ai_demand",
  tick,
  duration: 8,
  affectedSectors: ["Semiconductors", "Technology"],
  publicInfo: {
    headline: "AI infrastructure demand spike",
    summary: "Unexpected surge in AI chip and cloud demand.",
  },
  effect: {
    returnShock: 0.02,
    volMultiplier: 1.4,
    driftBias: 0.001,
  },
});

export const SCENARIOS: Record<ScenarioId, ScenarioSpec> = {
  stable: {
    id: "stable",
    ticks: 80,
    warmup: 8,
    setup: (engine) => {
      engine.setRegime("bull");
    },
  },
  shock: {
    id: "shock",
    ticks: 80,
    warmup: 8,
    setup: (engine) => {
      engine.setRegime("bull");
      engine.scheduleEvent(aiDemandShock(25));
    },
  },
  regime_reversal: {
    id: "regime_reversal",
    ticks: 100,
    warmup: 8,
    setup: (engine) => {
      engine.setRegime("bull");
      engine.setRegime("bear", 40);
      engine.setRegime("high_vol", 70);
    },
  },
};
