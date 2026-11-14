/**
 * `pnpm memory:check`: verify the Mongo connection, ensure the regular memory
 * indexes, and run one owner-scoped read. No LLM or embedding calls.
 */
import { getDb } from "../database/client.js";
import { ensureMemoryIndexes } from "../database/indexes.js";
import { MongoExperienceStore } from "./experiences/mongo-store.js";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureMemoryIndexes(db);
  await new MongoExperienceStore(db).query({ agentId: "connection-check", limit: 1 });
  console.log("MongoDB memory connection, indexes, and scoped reads verified.");
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    // Driver errors can include the URI or host; print a fixed message instead.
    console.error(
      "MongoDB memory check failed. Check MONGODB_URI, credentials, network access, and index permissions.",
    );
    process.exit(1);
  });
