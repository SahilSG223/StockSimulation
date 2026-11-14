import { MongoClient, type Db } from "mongodb";
import { MongoExperienceStore } from "./experiences/mongo-store.js";
import type { ExperienceRecord } from "./experiences/types.js";

export async function connectMongoMemory(env: NodeJS.ProcessEnv = process.env): Promise<{
  store: MongoExperienceStore;
  database: Db;
  close: () => Promise<void>;
}> {
  const uri = env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is required for persistent memory");
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const db = client.db(env.MONGODB_DB_NAME?.trim() || "stock_simulation");
    const store = new MongoExperienceStore(db.collection<ExperienceRecord>("experiences"));
    await store.initialize();
    const connectedClient = client;
    return {
      store,
      database: db,
      close: async () => {
        await connectedClient.close();
      },
    };
  } catch {
    await client?.close().catch(() => undefined);
    // Driver errors can contain the URI or host details. Do not expose them.
    throw new Error(
      "MongoDB memory connection failed; check URI, credentials, network access, and index permissions",
    );
  }
}
