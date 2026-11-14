import { z } from "zod";
import { SECTORS } from "../simulation/types.js";

const positionSchema = z
  .object({
    symbol: z.string().min(1),
    quantity: z.number().finite().nonnegative(),
    avgCost: z.number().finite().positive(),
  })
  .strict();

export const observationSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    prices: z.record(z.string().min(1), z.number().finite().positive()),
    events: z.array(
      z
        .object({
          id: z.string().min(1),
          type: z.string().min(1),
          tick: z.number().int().nonnegative(),
          duration: z.number().int().positive(),
          affectedSymbols: z.array(z.string().min(1)).optional(),
          affectedSectors: z.array(z.enum(SECTORS)).optional(),
          headline: z.string(),
          summary: z.string(),
        })
        .strict(),
    ),
    portfolio: z
      .object({
        agentId: z.string().min(1),
        cash: z.number().finite().nonnegative(),
        positions: z.array(positionSchema),
        realizedPnl: z.number().finite(),
        unrealizedPnl: z.number().finite(),
        equity: z.number().finite(),
      })
      .strict(),
  })
  .strict();

export type AgentObservation = z.infer<typeof observationSchema>;
