/**
 * Create memory indexes on Atlas. Usage (from repo root):
 *   pnpm ensure-indexes
 * Requires MONGODB_URI in .env (gitignored).
 */
import { getDb } from "../src/database/client.js";
import {
  ensureExperienceVectorSearchIndex,
  ensureMemoryIndexes,
  ensureMemoryVectorSearchIndex,
} from "../src/database/indexes.js";
import { EMBEDDING_3_SMALL_DIMS } from "../src/memory/embeddings/openai-embedder.js";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureMemoryIndexes(db);
  await ensureExperienceVectorSearchIndex(db, { dimensions: EMBEDDING_3_SMALL_DIMS });
  await ensureMemoryVectorSearchIndex(db, { dimensions: EMBEDDING_3_SMALL_DIMS });
  console.log(
    JSON.stringify({
      ok: true,
      db: db.databaseName,
      indexes: [
        "experiences.agent_sim_tick",
        "memories.agent_status+scope",
        "experience_vectors.agent_experience",
        "experience_vectors.experience_similarity (vector search)",
        "memories.lesson_similarity (vector search)",
      ],
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    // Driver errors can include the URI or host; print a fixed message instead.
    console.error(
      "ensure-indexes failed. Check MONGODB_URI, credentials, network access, and index permissions.",
    );
    process.exit(1);
  });
