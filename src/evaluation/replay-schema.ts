/**
 * The replay file contract consumed by the frontend/demo UI. It is a trust
 * boundary, so it gets a Zod schema (see `.claude/rules/contracts.md`): the
 * writer parses its output against this before writing, and the UI can validate
 * on read. Keep this schema stable; derived/presentation fields (style,
 * marketHealth, netPnl) are computed in `replay.ts`, not by the UI.
 */
import { z } from "zod";

export const REPLAY_VERSION = 1;

/** Line style the UI draws a decision with. Derived from size + confidence. */
export const lineStyleSchema = z.enum(["straight", "wavy", "zigzag", "dashed"]);
export type LineStyle = z.infer<typeof lineStyleSchema>;

/** Coarse market condition for the tick, from a rolling market return. */
export const marketHealthSchema = z.enum(["good", "bad", "neutral"]);
export type MarketHealth = z.infer<typeof marketHealthSchema>;

export const replayOrderSchema = z.object({
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().int().nonnegative(),
  status: z.enum(["filled", "rejected"]),
  fillPrice: z.number().optional(),
  notional: z.number().optional(),
  fee: z.number().optional(),
  rejectReason: z.string().optional(),
});

export const replayFiredMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.string(),
  reliability: z.number(),
  creationRegime: z.string(),
});

export const replayDecisionSchema = z.object({
  tick: z.number().int(),
  regime: z.string(),
  orders: z.array(replayOrderSchema),
  equity: z.number(),
  /** equity − startingCash (already net of fees). */
  netPnl: z.number(),
  /** Cumulative fees this agent has paid through this decision. */
  feesPaid: z.number(),
  confidence: z.number(),
  style: lineStyleSchema,
  reasoning: z.string().max(400),
  firedMemories: z.array(replayFiredMemorySchema),
  /** Did the action change when memory was withheld? null when no memory fired. */
  counterfactualChanged: z.boolean().nullable(),
});

export const replayFrameSchema = z.object({
  tick: z.number().int(),
  regime: z.string(),
  marketReturn: z.number(),
  marketHealth: marketHealthSchema,
  prices: z.record(z.string(), z.number()),
});

export const replayAgentSchema = z.object({
  agentId: z.string(),
  archetype: z.string(),
  decisions: z.array(replayDecisionSchema),
});

export const replayEventSchema = z.object({
  tick: z.number().int(),
  type: z.string(),
  headline: z.string(),
  affectedSectors: z.array(z.string()),
});

export const replaySchema = z.object({
  version: z.literal(REPLAY_VERSION),
  scenario: z.string(),
  seed: z.number().int(),
  memoryMode: z.enum(["none", "raw", "governed"]),
  ticks: z.number().int(),
  warmup: z.number().int(),
  startingCash: z.number(),
  assets: z.array(z.object({ symbol: z.string(), sector: z.string() })),
  events: z.array(replayEventSchema),
  regimeChanges: z.array(z.object({ tick: z.number().int(), regime: z.string() })),
  frames: z.array(replayFrameSchema),
  agents: z.array(replayAgentSchema),
});

export type Replay = z.infer<typeof replaySchema>;
