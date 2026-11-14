/**
 * Contract for the UI demo narrative — see docs/UI_PLAYBOOK.md and
 * docs/examples/memory-demo.sample.json. The UI replays this shape, live or
 * from the sample file, so it must match exactly (`.strict()`).
 */
import { z } from "zod";
import { ORDER_SIDES } from "../simulation/types.js";

export const DEMO_FRAME_PHASES = [
  "learn",
  "act_with_memory",
  "shock",
  "govern",
  "act_after_govern",
] as const;
export type DemoFramePhase = (typeof DEMO_FRAME_PHASES)[number];

const memoryFiredSchema = z
  .object({
    id: z.string().min(1),
    content: z.string(),
    retrievalScore: z.number().finite(),
    status: z.enum(["active", "invalidated", "superseded", "under_review", "expired"]),
    /** Why the status/reliability last changed — present once governance has acted. */
    reason: z.string().optional(),
  })
  .strict();

const demoDecisionSchema = z
  .object({
    reasoning: z.string(),
    strategy: z.string(),
    confidence: z.number().finite(),
    memoryReferences: z.array(z.string()),
    orders: z.array(
      z.object({ symbol: z.string(), side: z.enum(ORDER_SIDES), quantity: z.number() }).strict(),
    ),
  })
  .strict();

const publicEventFrameSchema = z
  .object({ id: z.string(), type: z.string(), headline: z.string() })
  .strict();

const portfolioFrameSchema = z
  .object({
    cash: z.number().finite(),
    positions: z.array(z.object({ symbol: z.string(), quantity: z.number() }).strict()),
  })
  .strict();

export const demoFrameSchema = z
  .object({
    phase: z.enum(DEMO_FRAME_PHASES),
    tick: z.number().int().nonnegative(),
    headline: z.string(),
    prices: z.record(z.string(), z.number()),
    events: z.array(publicEventFrameSchema),
    memoriesFired: z.array(memoryFiredSchema),
    decision: demoDecisionSchema.optional(),
    portfolio: portfolioFrameSchema.optional(),
  })
  .strict();

export type DemoFrame = z.infer<typeof demoFrameSchema>;

export const chaosPlanEntrySchema = z.object({ preset: z.string(), tick: z.number() }).strict();

export const demoResultSchema = z
  .object({
    seed: z.number().int(),
    agentId: z.string().min(1),
    chaosPlan: z.array(chaosPlanEntrySchema),
    frames: z.array(demoFrameSchema),
  })
  .strict();

export type DemoResult = z.infer<typeof demoResultSchema>;
