/** Package entry — simulation packages land under src/ as phases land. */
export const PROJECT_NAME = "stock-simulation" as const;

export {
  DEFAULT_ASSETS,
  MarketEngine,
  REGIME_IDS,
  REGIME_PARAMS,
  SeededRng,
  SimulationClock,
} from "./simulation/index.js";
export type {
  AssetParams,
  ExecutionResult,
  MarketEvent,
  MarketObservation,
  Order,
  PortfolioSnapshot,
  RegimeId,
  SimulationConfig,
} from "./simulation/index.js";

export {
  ExperienceStore,
  marketContextFromObservation,
  recordTradeExperience,
} from "./memory/index.js";
export type {
  ExperienceQuery,
  ExperienceRecord,
} from "./memory/index.js";
