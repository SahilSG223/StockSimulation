/**
 * Mongo client stub — implement on the second laptop (see docs/MONGO_SECOND_LAPTOP.md).
 *
 * Intended shape after `pnpm add mongodb`:
 *   import { MongoClient, Db } from "mongodb";
 *   export async function getDb(): Promise<Db>
 */

export type DbHandle = {
  /** Placeholder until mongodb driver is wired. */
  ready: false;
};

export async function getDb(): Promise<DbHandle> {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "stock_simulation";
  if (!uri) {
    throw new Error("Missing MONGODB_URI — set it in .env (never commit it)");
  }
  // Second laptop: replace with MongoClient.connect(uri) → client.db(dbName)
  void dbName;
  throw new Error(
    "getDb() not implemented — follow docs/MONGO_SECOND_LAPTOP.md on feat/memory-mongo",
  );
}
