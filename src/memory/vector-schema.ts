import { z } from "zod";
import { embeddingVectorSchema } from "./embedding.js";

export const MEMORY_CONTENT_VERSION = "experience-v1";
const text = z.string().trim().min(1);
export const vectorMemorySchema = z.object({
  id: text,
  agentId: text,
  simulationId: text,
  tick: z.number().int().nonnegative(),
  content: text.max(12_000),
  embedding: embeddingVectorSchema,
  embeddingModel: text,
  decisionModel: text,
  contentVersion: z.literal(MEMORY_CONTENT_VERSION),
  status: z.enum(["active", "invalidated"]),
  symbols: z.array(text),
  eventTypes: z.array(text),
});
export type VectorMemoryDocument = z.infer<typeof vectorMemorySchema>;

export const vectorCandidateSchema = vectorMemorySchema.omit({ embedding: true }).extend({
  similarity: z.number().finite().min(0).max(1),
});

export const retrievedMemorySchema = vectorCandidateSchema.extend({
  contextualRelevance: z.number().finite().min(0).max(1),
  temporalRelevance: z.number().finite().min(0).max(1),
  rankingScore: z.number().finite().min(0).max(1),
});
export type RetrievedMemory = z.infer<typeof retrievedMemorySchema>;
export const retrievedMemoriesSchema = z.array(retrievedMemorySchema).max(5);
export const searchIndexStatusSchema = z.array(
  z.object({
    queryable: z.boolean().optional(),
    status: z.string().optional(),
  }),
);

export const vectorQuerySchema = z
  .object({
    agentId: text,
    simulationId: text,
    tick: z.number().int().nonnegative(),
    content: text.max(12_000),
    symbols: z.array(text),
    eventTypes: z.array(text),
  })
  .strict();
export type VectorMemoryQuery = z.infer<typeof vectorQuerySchema>;
