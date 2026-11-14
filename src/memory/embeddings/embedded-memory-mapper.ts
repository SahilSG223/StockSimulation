import type { MemoryDoc } from "../memories/memory-doc-schema.js";
import type { EmbeddedMemory } from "./types.js";

/**
 * Map Mongo memory docs ↔ in-memory EmbeddedMemory used by ranking.
 * Embedding is required for retrieval; callers must embed before insert.
 */
export function toEmbeddedMemory(doc: MemoryDoc): EmbeddedMemory {
  if (!doc.embedding || doc.embedding.length === 0) {
    throw new Error(`MemoryDoc ${doc._id ?? "(no id)"} missing embedding`);
  }
  if (!doc._id) {
    throw new Error("MemoryDoc missing _id");
  }
  return {
    id: doc._id,
    agentId: doc.agentId,
    content: doc.content,
    embedding: doc.embedding,
    status: doc.status,
    ...(doc.invalidationReason !== undefined ? { invalidationReason: doc.invalidationReason } : {}),
    reliability: doc.reliability,
    updatedAtTick: doc.updatedAtTick,
    scope: {
      sectors: [...doc.scope.sectors],
      regimes: [...doc.scope.regimes],
      eventTypes: [...doc.scope.eventTypes],
      assets: [...doc.scope.assets],
    },
  };
}

export function toMemoryDoc(
  memory: EmbeddedMemory,
  extras?: Partial<Pick<MemoryDoc, "type" | "confidence" | "sourceExperienceIds" | "createdAtTick" | "version">>,
): MemoryDoc {
  return {
    _id: memory.id,
    agentId: memory.agentId,
    type: extras?.type ?? "semantic",
    content: memory.content,
    embedding: memory.embedding,
    sourceExperienceIds: extras?.sourceExperienceIds ?? [],
    createdAtTick: extras?.createdAtTick ?? memory.updatedAtTick,
    updatedAtTick: memory.updatedAtTick,
    confidence: extras?.confidence ?? memory.reliability,
    reliability: memory.reliability,
    scope: {
      sectors: [...memory.scope.sectors],
      regimes: [...memory.scope.regimes],
      eventTypes: [...memory.scope.eventTypes],
      assets: [...memory.scope.assets],
    },
    status: memory.status,
    ...(memory.invalidationReason !== undefined ? { invalidationReason: memory.invalidationReason } : {}),
    version: extras?.version ?? 1,
  };
}
