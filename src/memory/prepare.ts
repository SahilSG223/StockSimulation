import { connectMongoMemory } from "./connect.js";
import { createEmbeddingProvider } from "./embedding.js";
import { MongoVectorMemory } from "./vector-memory.js";

async function main(): Promise<void> {
  const memory = await connectMongoMemory();
  try {
    const vectors = await MongoVectorMemory.open(memory.database, createEmbeddingProvider());
    await vectors.retrieve({
      agentId: "connection-check",
      simulationId: "connection-check",
      tick: 0,
      content: "Verify retrieval of past agent decisions and execution experiences.",
      symbols: [],
      eventTypes: [],
    });
    console.log(
      `Vector memory ready; scoped vector search verified (${vectors.dimensions} dimensions).`,
    );
  } finally {
    await memory.close();
  }
}
main().catch((error: unknown) => {
  // These modules expose sanitized error messages, never provider response bodies or URIs.
  console.error(error instanceof Error ? error.message : "Vector memory setup failed");
  process.exitCode = 1;
});
