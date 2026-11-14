import { z } from "zod";
import { ORDER_SIDES } from "../../simulation/types.js";

const text = z.string().trim().min(1);
const tick = z.number().int().nonnegative();
const finite = z.number().finite();
const proposedOrderSchema = z
  .object({
    symbol: text,
    side: z.enum(ORDER_SIDES),
    quantity: finite.positive(),
  })
  .strict();

/** Mongo adds _id; parsing intentionally returns only the domain fields. */
export const experienceRecordSchema = z.object({
  id: text,
  agentId: text,
  simulationId: text,
  tick,
  createdAtTick: tick,
  market: z
    .object({
      regime: z.string(),
      prices: z.record(text, finite.positive()),
      eventIds: z.array(text),
      eventTypes: z.array(text),
    })
    .strict(),
  decision: z
    .object({
      reasoning: text,
      strategy: text.optional(),
      confidence: finite.min(0).max(1).optional(),
      memoryReferences: z.array(text),
      orders: z.array(proposedOrderSchema),
    })
    .strict()
    .transform(({ strategy, confidence, ...decision }) => ({
      ...decision,
      ...(strategy !== undefined ? { strategy } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    })),
  outcome: z
    .object({
      fills: z.array(
        proposedOrderSchema.extend({
          fillPrice: finite.positive(),
          notional: finite.nonnegative(),
          fee: finite.nonnegative(),
        }),
      ),
      rejections: z.array(proposedOrderSchema.extend({ reason: text })),
      cashDelta: finite,
      realizedPnlDelta: finite.optional(),
      summary: text,
    })
    .strict()
    .transform(({ realizedPnlDelta, ...outcome }) => ({
      ...outcome,
      ...(realizedPnlDelta !== undefined ? { realizedPnlDelta } : {}),
    })),
  scope: z
    .object({
      symbols: z.array(text),
      sectors: z.array(text),
      regimes: z.array(text),
      eventTypes: z.array(text),
    })
    .strict(),
});

export const experienceQuerySchema = z
  .object({
    agentId: text,
    simulationId: text.optional(),
    fromTick: tick.optional(),
    toTick: tick.optional(),
    symbols: z.array(text).optional(),
    sectors: z.array(text).optional(),
    regimes: z.array(text).optional(),
    eventTypes: z.array(text).optional(),
    limit: tick.optional(),
  })
  .strict()
  .refine((q) => q.fromTick === undefined || q.toTick === undefined || q.fromTick <= q.toTick, {
    message: "fromTick must not exceed toTick",
  });
