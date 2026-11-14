import { connectMongoMemory } from "./connect.js";

async function main(): Promise<void> {
  const memory = await connectMongoMemory();
  try {
    await memory.store.query({ agentId: "connection-check", limit: 1 });
    console.log("MongoDB memory connection, indexes, and scoped reads verified.");
  } finally {
    await memory.close();
  }
}

main().catch(() => {
  console.error(
    "MongoDB memory check failed. Check MONGODB_URI, credentials, network access, and index permissions.",
  );
  process.exitCode = 1;
});
