/** Minimal in-memory stand-in for the Mongo methods MongoMemoryRepository calls. */
import type { Db } from "mongodb";

type FakeDoc = Record<string, unknown> & { _id?: string };

export function createFakeDb(): Db {
  const docs: FakeDoc[] = [];
  const matches = (doc: FakeDoc, filter: FakeDoc) =>
    Object.entries(filter).every(([k, v]) => doc[k] === v);

  const collection = {
    async insertOne(doc: FakeDoc) {
      docs.push({ ...doc });
      return { insertedId: doc._id };
    },
    find(filter: FakeDoc) {
      return { toArray: async () => docs.filter((d) => matches(d, filter)).map((d) => ({ ...d })) };
    },
    async findOne(filter: FakeDoc) {
      return docs.find((d) => matches(d, filter)) ?? null;
    },
    async updateOne(filter: FakeDoc, update: { $set: FakeDoc }) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  return { collection: () => collection } as unknown as Db;
}
