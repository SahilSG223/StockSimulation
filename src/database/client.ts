import { MongoClient, type Db } from "mongodb";

export type DbHandle = Db;

let clientPromise: Promise<MongoClient> | undefined;

export async function getDb(): Promise<DbHandle> {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "stock_simulation";
  if (!uri) {
    throw new Error("Missing MONGODB_URI — set it in .env (never commit it)");
  }
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect().catch((err: unknown) => {
      clientPromise = undefined;
      throw err;
    });
  }
  const client = await clientPromise;
  return client.db(dbName);
}
