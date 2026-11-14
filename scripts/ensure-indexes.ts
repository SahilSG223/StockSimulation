/**
 * Create memory indexes on Atlas. Usage (from repo root):
 *   pnpm ensure-indexes
 * Requires MONGODB_URI in .env (gitignored).
 */
import { getDb } from "../src/database/client.js";
import { ensureExperienceVectorSearchIndex, ensureMemoryIndexes } from "../src/database/indexes.js";
import { EMBEDDING_3_SMALL_DIMS } from "../src/memory/embeddings/openai-embedder.js";

const db = await getDb();
await ensureMemoryIndexes(db);
await ensureExperienceVectorSearchIndex(db, { dimensions: EMBEDDING_3_SMALL_DIMS });
console.log(
  JSON.stringify({
    ok: true,
    db: db.databaseName,
    indexes: [
      "experiences.agent_sim_tick",
      "memories.agent_status+scope",
      "experience_vectors.agent_experience",
      "experience_vectors.experience_similarity (vector search)",
    ],
  }),
);
process.exit(0);
