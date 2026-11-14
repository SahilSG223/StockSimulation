import type { ExecutionResult } from "../../simulation/types.js";
import type { ExperienceStore } from "./store.js";
import type {
  AgentId,
  ExperienceDecision,
  ExperienceFill,
  ExperienceMarketContext,
  ExperienceOutcome,
  ExperienceRecord,
  ExperienceRejection,
  ExperienceScope,
} from "./types.js";

export type SectorLookup = ReadonlyMap<string, string> | ((symbol: string) => string | undefined);

export type RecordTradeExperienceInput = {
  store: ExperienceStore;
  agentId: AgentId;
  simulationId: string;
  tick: number;
  market: ExperienceMarketContext;
  decision: ExperienceDecision;
  results: readonly ExecutionResult[];
  /** Map symbol → sector for scope; defaults to empty sectors if missing. */
  sectorOf?: SectorLookup;
  /** Optional realized PnL delta for this batch of fills. */
  realizedPnlDelta?: number;
  id?: string;
};

function resolveSector(sectorOf: SectorLookup | undefined, symbol: string): string | undefined {
  if (!sectorOf) return undefined;
  if (typeof sectorOf === "function") return sectorOf(symbol);
  return sectorOf.get(symbol);
}

function summarizeOutcome(fills: ExperienceFill[], rejections: ExperienceRejection[]): string {
  const fillBits = fills.map(
    (f) => `${f.side} ${f.quantity} ${f.symbol} @ ${f.fillPrice.toFixed(2)}`,
  );
  const rejectBits = rejections.map((r) => `rejected ${r.side} ${r.symbol} (${r.reason})`);
  const parts = [...fillBits, ...rejectBits];
  return parts.length > 0 ? parts.join("; ") : "no fills";
}

/**
 * Turn a decision + authoritative execution results into one episodic experience.
 * Does not invent PnL — only records what the engine returned.
 */
export function recordTradeExperience(input: RecordTradeExperienceInput): ExperienceRecord {
  const fills: ExperienceFill[] = [];
  const rejections: ExperienceRejection[] = [];
  let cashDelta = 0;

  for (const result of input.results) {
    if (result.order.agentId !== input.agentId) {
      throw new Error(
        `execution agentId ${result.order.agentId} does not match experience agentId ${input.agentId}`,
      );
    }
    if (result.status === "filled") {
      const sign = result.order.side === "buy" ? -1 : 1;
      cashDelta += sign * result.notional - result.fee;
      fills.push({
        symbol: result.order.symbol,
        side: result.order.side,
        quantity: result.order.quantity,
        fillPrice: result.fillPrice,
        notional: result.notional,
        fee: result.fee,
      });
    } else {
      rejections.push({
        symbol: result.order.symbol,
        side: result.order.side,
        quantity: result.order.quantity,
        reason: result.reason,
      });
    }
  }

  const symbols = [
    ...new Set([
      ...input.decision.orders.map((o) => o.symbol),
      ...fills.map((f) => f.symbol),
      ...rejections.map((r) => r.symbol),
    ]),
  ];

  const sectors = [
    ...new Set(
      symbols
        .map((s) => resolveSector(input.sectorOf, s))
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ];

  const scope: ExperienceScope = {
    symbols,
    sectors,
    regimes: input.market.regime ? [input.market.regime] : [],
    eventTypes: [...input.market.eventTypes],
  };

  const outcome: ExperienceOutcome = {
    fills,
    rejections,
    cashDelta,
    ...(input.realizedPnlDelta !== undefined
      ? { realizedPnlDelta: input.realizedPnlDelta }
      : {}),
    summary: summarizeOutcome(fills, rejections),
  };

  return input.store.create({
    ...(input.id !== undefined ? { id: input.id } : {}),
    agentId: input.agentId,
    simulationId: input.simulationId,
    tick: input.tick,
    market: input.market,
    decision: input.decision,
    outcome,
    scope,
  });
}

/** Build market context from a sim observation-shaped object. */
export function marketContextFromObservation(obs: {
  regime: string;
  prices: Readonly<Record<string, number>>;
  events: readonly { id: string; type: string }[];
}): ExperienceMarketContext {
  return {
    regime: obs.regime,
    prices: { ...obs.prices },
    eventIds: obs.events.map((e) => e.id),
    eventTypes: [...new Set(obs.events.map((e) => e.type))],
  };
}
