import { z } from "zod";
import type { MemoryStatus } from "./governance/types.js";

export const MEMORY_CONTENT_VERSION = "experience-v1";

/** Same lifecycle as governed memories (`.claude/rules/memory.md`). */
export const MEMORY_STATUSES = [
  "active",
  "under_review",
  "superseded",
  "invalidated",
  "expired",
] as const satisfies readonly MemoryStatus[];

/**
 * Prior reliability for an experience vector that has not been re-evaluated
 * yet. Neutral on purpose: reliability comes from later outcomes, not from the
 * fact that the experience exists. Kept separate from similarity and context.
 */
export const DEFAULT_EXPERIENCE_RELIABILITY = 0.5;

const text = z.string().trim().min(1);

export const embeddingVectorSchema = z
  .array(z.number().finite())
  .min(1)
  .max(4096)
  .refine((vector) => vector.some((value) => value !== 0), "Embedding must not be a zero vector");

export const vectorMemorySchema = z
  .object({
    id: text,
    agentId: text,
    simulationId: text,
    tick: z.number().int().nonnegative(),
    content: text.max(12_000),
    embedding: embeddingVectorSchema,
    embeddingModel: text,
    decisionModel: text,
    contentVersion: z.literal(MEMORY_CONTENT_VERSION),
    status: z.enum(MEMORY_STATUSES),
    invalidationReason: text.optional(),
    reliability: z.number().finite().min(0).max(1),
    symbols: z.array(text),
    sectors: z.array(text),
    regimes: z.array(text),
    eventTypes: z.array(text),
  })
  .strict();
export type VectorMemoryDocument = z.infer<typeof vectorMemorySchema>;

/**
 * A retrieved experience with the ranking components kept separate (from
 * `rankWithEmbeddings`). `retrievalScore` is that ranker's documented
 * composite, not a calibrated probability.
 */
export const retrievedExperienceSchema = vectorMemorySchema
  .omit({ embedding: true })
  .extend({
    semanticSimilarity: z.number().finite().min(-1).max(1),
    contextualApplicability: z.number().finite().min(0).max(1),
    temporalRelevance: z.number().finite().min(0).max(1),
    retrievalScore: z.number().finite().nonnegative(),
  })
  .strict();
export type RetrievedExperience = z.infer<typeof retrievedExperienceSchema>;
export const retrievedExperiencesSchema = z.array(retrievedExperienceSchema).max(5);

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
