import { z } from "zod";
import { ORDER_SIDES } from "../simulation/types.js";

export const proposedOrderSchema = z
  .object({
    symbol: z.string().trim().min(1),
    side: z.enum(ORDER_SIDES),
    // Whole shares: the engine rejects fractional quantities, so reject them before it.
    quantity: z.number().int().positive(),
  })
  .strict();

/** An empty orders array is an explicit hold. Identity is supplied by the runtime. */
export const decisionSchema = z
  .object({
    orders: z.array(proposedOrderSchema),
    reasoning: z.string().trim().min(1),
    strategy: z.string().trim().min(1),
    confidence: z.number().finite().min(0).max(1),
    memoryReferences: z.array(z.string().trim().min(1)),
  })
  .strict();

export type AgentDecision = z.infer<typeof decisionSchema>;
