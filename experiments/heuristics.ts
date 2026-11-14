import type { MarketObservation, Order, OrderSide } from "../src/simulation/index.js";

export type HeuristicId = "momentum" | "contrarian" | "conservative";

export type HeuristicDecision = {
  reasoning: string;
  strategy: HeuristicId;
  confidence: number;
  orders: Order[];
};

/** Rolling return over `lookback` ticks using price history (oldest→newest). */
function lookbackReturn(history: number[], lookback: number): number | undefined {
  if (history.length < lookback + 1) return undefined;
  const prev = history[history.length - 1 - lookback]!;
  const last = history[history.length - 1]!;
  if (prev <= 0) return undefined;
  return last / prev - 1;
}

export type PriceHistory = Map<string, number[]>;

export function appendPrices(history: PriceHistory, prices: Readonly<Record<string, number>>): void {
  for (const [symbol, price] of Object.entries(prices)) {
    const series = history.get(symbol) ?? [];
    series.push(price);
    history.set(symbol, series);
  }
}

/**
 * Cheap deterministic stand-ins for LLM agents — for stress experiments only.
 */
export function decideHeuristic(args: {
  agentId: string;
  heuristic: HeuristicId;
  obs: MarketObservation;
  history: PriceHistory;
  cash: number;
}): HeuristicDecision {
  const { agentId, heuristic, obs, history, cash } = args;
  const symbols = Object.keys(obs.prices);
  const lookback = 5;

  const scored = symbols
    .map((symbol) => {
      const series = history.get(symbol) ?? [];
      const ret = lookbackReturn(series, lookback);
      return { symbol, ret };
    })
    .filter((s): s is { symbol: string; ret: number } => s.ret !== undefined);

  if (scored.length === 0 || cash < 500) {
    return {
      reasoning: "insufficient history or cash — hold",
      strategy: heuristic,
      confidence: 0.2,
      orders: [],
    };
  }

  scored.sort((a, b) => b.ret - a.ret);
  const best = scored[0]!;
  const worst = scored[scored.length - 1]!;

  let side: OrderSide;
  let symbol: string;
  let confidence: number;
  let reasoning: string;

  if (heuristic === "momentum") {
    symbol = best.symbol;
    side = best.ret > 0 ? "buy" : "sell";
    confidence = Math.min(0.95, 0.4 + Math.abs(best.ret) * 8);
    reasoning = `momentum: ${symbol} lookback5=${best.ret.toFixed(4)}`;
  } else if (heuristic === "contrarian") {
    symbol = worst.symbol;
    side = worst.ret < 0 ? "buy" : "sell";
    confidence = Math.min(0.9, 0.35 + Math.abs(worst.ret) * 7);
    reasoning = `contrarian: fade ${symbol} lookback5=${worst.ret.toFixed(4)}`;
  } else {
    // conservative: small buy only on mild positive momentum, else hold
    if (best.ret < 0.002) {
      return {
        reasoning: "conservative: no clear mild uptrend — hold",
        strategy: heuristic,
        confidence: 0.3,
        orders: [],
      };
    }
    symbol = best.symbol;
    side = "buy";
    confidence = 0.45;
    reasoning = `conservative: small add ${symbol} ret=${best.ret.toFixed(4)}`;
  }

  const price = obs.prices[symbol] ?? 0;
  if (price <= 0) {
    return { reasoning: "bad price", strategy: heuristic, confidence: 0.1, orders: [] };
  }

  const budgetFrac = heuristic === "conservative" ? 0.05 : heuristic === "momentum" ? 0.12 : 0.1;
  const qty = Math.max(1, Math.floor((cash * budgetFrac) / price));

  // sells need inventory — engine will reject if flat; still record the attempt
  const order: Order = { agentId, symbol, side, quantity: qty };
  return { reasoning, strategy: heuristic, confidence, orders: side === "sell" ? [order] : [order] };
}
