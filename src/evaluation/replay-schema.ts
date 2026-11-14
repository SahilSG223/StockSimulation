/**
 * The replay contract consumed by the Memory Arena viewer (`app/`). It is a trust
 * boundary, so it gets a Zod schema (see `.claude/rules/contracts.md`): the writer
 * parses its output against this before writing and fails closed on a mismatch.
 *
 * Shape: one self-contained document per (scenario, seed, memoryMode). `frames`
 * are contiguous ticks `0..ticks` (frame index === tick), each carrying a full
 * per-agent snapshot — portfolio, status, retrieved memories, counterfactual, and
 * an optional trade `interaction` the viewer animates. Derived presentation fields
 * (marketHealth, volatility, line `style`, netPnl, cumulative feesPaid, the per-run
 * `summary`) are computed in `replay.ts`, never by the UI ("do not invent P&L in
 * the browser").
 */
import { z } from "zod";

export const REPLAY_VERSION = 1;

/** Line style the viewer draws a trade with. Derived from size + confidence. */
export const lineStyleSchema = z.enum(["straight", "wavy", "zigzag", "dashed"]);
export type LineStyle = z.infer<typeof lineStyleSchema>;

/** Coarse market condition for the tick, from a rolling market return. */
export const marketHealthSchema = z.enum(["good", "bad", "neutral"]);
export type MarketHealth = z.infer<typeof marketHealthSchema>;

export const memoryStatusSchema = z.enum([
  "active",
  "under_review",
  "superseded",
  "invalidated",
  "expired",
]);

const holdingSchema = z.object({ symbol: z.string(), quantity: z.number() });

const portfolioSchema = z.object({
  startingCash: z.number(),
  cash: z.number(),
  equity: z.number(),
  realizedPnl: z.number(),
  unrealizedPnl: z.number(),
  feesPaid: z.number(),
  netPnl: z.number(),
  holdings: z.array(holdingSchema),
});

/** A memory as it looked at the decision; `fired` means it changed the action. */
const replayMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  status: memoryStatusSchema,
  confidence: z.number(),
  reliability: z.number(),
  retrievalScore: z.number(),
  createdAtTick: z.number().int(),
  fired: z.boolean(),
});

/** Present only on ticks the agent actually traded; drives the animated line. */
const interactionSchema = z.object({
  kind: z.enum(["buy", "sell"]),
  style: lineStyleSchema,
  symbol: z.string(),
  quantity: z.number(),
  notional: z.number(),
  notionalPctEquity: z.number(),
});

const counterfactualSchema = z.object({
  withoutMemory: z.object({
    status: z.string(),
    orders: z.array(
      z.object({ symbol: z.string(), side: z.enum(["buy", "sell"]), quantity: z.number() }),
    ),
  }),
  changed: z.boolean(),
});

const agentFrameSchema = z.object({
  agentId: z.string(),
  status: z.string(),
  reasoning: z.string().max(400),
  strategy: z.string(),
  confidence: z.number(),
  interaction: interactionSchema.nullable(),
  portfolio: portfolioSchema,
  memories: z.array(replayMemorySchema),
  counterfactual: counterfactualSchema.nullable(),
});

const lifecycleEventSchema = z.object({
  agentId: z.string(),
  memoryId: z.string(),
  from: memoryStatusSchema,
  to: memoryStatusSchema,
  reason: z.string(),
  atTick: z.number().int(),
});

export const replayFrameSchema = z.object({
  tick: z.number().int(),
  regime: z.string(),
  marketReturn: z.number(),
  marketHealth: marketHealthSchema,
  volatility: z.number(),
  prices: z.record(z.string(), z.number()),
  agents: z.array(agentFrameSchema),
  lifecycleEvents: z.array(lifecycleEventSchema),
});

const summaryEntrySchema = z.object({
  ticksToAdapt: z.number(),
  staleInfluenceRate: z.number(),
  repeatedMistakes: z.number(),
  flipRate: z.number(),
  finalEquity: z.number(),
});

export const replaySchema = z.object({
  version: z.literal(REPLAY_VERSION),
  runId: z.string(),
  scenario: z.string(),
  seed: z.number().int(),
  memoryMode: z.enum(["none", "raw", "governed"]),
  ticks: z.number().int(),
  warmup: z.number().int(),
  startingCash: z.number(),
  assets: z.array(z.object({ symbol: z.string(), sector: z.string() })),
  regimeTimeline: z.array(z.object({ tick: z.number().int(), regime: z.string() })),
  events: z.array(
    z.object({
      tick: z.number().int(),
      id: z.string(),
      type: z.string(),
      headline: z.string(),
      affectedSectors: z.array(z.string()),
    }),
  ),
  frames: z.array(replayFrameSchema),
  summary: z.record(z.string(), summaryEntrySchema),
});

export type Replay = z.infer<typeof replaySchema>;
export type ReplayFrame = z.infer<typeof replayFrameSchema>;
export type AgentFrame = z.infer<typeof agentFrameSchema>;
