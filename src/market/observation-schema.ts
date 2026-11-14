import { z } from "zod";
import { REGIME_IDS, SECTORS } from "../simulation/types.js";

/**
 * Zod contract for the public market view agents receive. Strict objects:
 * ground-truth fields (true regime, event `effect`, hidden `marketReturn`)
 * fail validation instead of slipping through.
 *
 * The Agents stream extends this with per-agent fields, e.g.
 *   publicMarketObservationSchema.extend({ portfolio: portfolioSchema })
 */

const seriesFeaturesSchema = z
  .object({
    return1: z.number().finite().optional(),
    return5: z.number().finite().optional(),
    return20: z.number().finite().optional(),
    volatility20: z.number().finite().nonnegative().optional(),
    momentum20: z.number().finite().optional(),
  })
  .strict();

const publicEventSchema = z
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
  .strict();

export const publicMarketObservationSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    prices: z.record(z.string().min(1), z.number().finite().positive()),
    /** Events active this tick: public info only. */
    events: z.array(publicEventSchema),
    features: z
      .object({
        symbols: z.record(z.string().min(1), seriesFeaturesSchema),
        sectors: z.record(z.enum(SECTORS), seriesFeaturesSchema),
        index: seriesFeaturesSchema,
      })
      .strict(),
    /** Inferred from observed prices; absent before tick 20. Never the true regime. */
    regimeEstimate: z.enum(REGIME_IDS).optional(),
  })
  .strict();
