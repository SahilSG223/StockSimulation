/**
 * Create memory indexes on Atlas. Usage (from repo root):
 *   pnpm ensure-indexes
 * Requires MONGODB_URI in .env (gitignored).
 */
import { getDb } from "../src/database/client.js";
import { ensureMemoryIndexes } from "../src/database/indexes.js";

const db = await getDb();
await ensureMemoryIndexes(db);
console.log(
  JSON.stringify({
    ok: true,
    db: db.databaseName,
    indexes: ["experiences.agent_sim_tick", "memories.agent_status+scope"],
  }),
);
process.exit(0);
