/**
 * `pnpm memory:prepare`: create indexes (including the Atlas vector search
 * index), wait until it is queryable, and verify a scoped vector query.
 * One embedding call, no decision-model calls, no records written.
 */
import { getDb } from "../database/client.js";
import { ensureExperienceVectorSearchIndex, ensureMemoryIndexes } from "../database/indexes.js";
import { OpenAIEmbedder } from "./embeddings/openai-embedder.js";
import { MongoVectorMemory } from "./vector-memory.js";

async function main(): Promise<void> {
  const db = await getDb();
  const embedder = new OpenAIEmbedder();
  await ensureMemoryIndexes(db);
  await ensureExperienceVectorSearchIndex(db, { dimensions: embedder.dimensions });
  await new MongoVectorMemory(db, embedder).retrieve({
    agentId: "connection-check",
    simulationId: "connection-check",
    tick: 0,
    content: "Verify retrieval of past agent decisions and execution experiences.",
    symbols: [],
    eventTypes: [],
  });
  console.log(
    `Vector memory ready; scoped vector search verified (${embedder.model}, ${embedder.dimensions} dimensions).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // Our modules throw fixed sentences; never print driver or provider bodies.
    console.error(error instanceof Error ? error.message : "Vector memory setup failed");
    process.exit(1);
  });
