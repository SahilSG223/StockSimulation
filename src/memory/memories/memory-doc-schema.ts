import { z } from "zod";

export const memoryDocSchema = z
  .object({
    _id: z.string().optional(),
    agentId: z.string().trim().min(1),
    type: z.enum(["semantic", "strategic", "social"]),
    content: z.string().trim().min(1),
    /** Filled by embeddings PR — 1536 dims for text-embedding-3-small */
    embedding: z.array(z.number()).optional(),
    sourceExperienceIds: z.array(z.string()),
    createdAtTick: z.number().int().nonnegative(),
    updatedAtTick: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    reliability: z.number().min(0).max(1),
    scope: z
      .object({
        sectors: z.array(z.string()),
        regimes: z.array(z.string()),
        eventTypes: z.array(z.string()),
        assets: z.array(z.string()),
      })
      .strict(),
    status: z.enum(["active", "under_review", "superseded", "invalidated", "expired"]),
    invalidationReason: z.string().optional(),
    version: z.number().int().positive(),
  })
  .strict();

export type MemoryDoc = z.infer<typeof memoryDocSchema>;
