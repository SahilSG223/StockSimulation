/** Ensure indexes for memory collections. */

import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

export const EXPERIENCE_INDEXES = [
  { key: { agentId: 1, simulationId: 1, tick: 1 }, name: "agent_sim_tick" },
] as const;

export const MEMORY_INDEXES = [
  { key: { agentId: 1, status: 1 }, name: "agent_status" },
  { key: { agentId: 1, "scope.sectors": 1 }, name: "agent_sectors" },
  { key: { agentId: 1, "scope.regimes": 1 }, name: "agent_regimes" },
] as const;

/** Call once at app startup or via `pnpm exec tsx scripts/ensure-indexes.ts`. */
export async function ensureMemoryIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.experiences).createIndexes([...EXPERIENCE_INDEXES]);
  await db.collection(COLLECTIONS.memories).createIndexes([...MEMORY_INDEXES]);
}
