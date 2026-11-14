/** Package entry — simulation packages land under src/ as phases land. */
export const PROJECT_NAME = "stock-simulation" as const;
export { connectMongoMemory, MongoExperienceStore } from "./memory/index.js";

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
  MongoExperienceStore,
  MongoMemoryRepository,
  marketContextFromObservation,
  recordTradeExperience,
} from "./memory/index.js";
export type {
  ExperienceQuery,
  ExperienceRecord,
  MemoryDoc,
} from "./memory/index.js";

export {
  COLLECTIONS,
  ensureMemoryIndexes,
  getDb,
} from "./database/index.js";
export type { CollectionName, DbHandle } from "./database/index.js";
