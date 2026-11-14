import { buyCost } from "./portfolio-manager.js";
import type { PortfolioManager } from "./portfolio-manager.js";
import type { Order, RejectReason } from "./types.js";

export interface RiskLimits {
  transactionCostRate: number;
  maxPositionSize?: number;
}

/**
 * Pre-trade checks. Returns a reject reason or null if the order may proceed.
 * Does not mutate portfolios.
 */
export function validateOrder(opts: {
  order: Order;
  portfolios: PortfolioManager;
  knownSymbols: ReadonlySet<string>;
  price: number;
  limits: RiskLimits;
}): RejectReason | null {
  const { order, portfolios, knownSymbols, price, limits } = opts;

  if (!portfolios.has(order.agentId)) return "unknown_agent";
  if (!knownSymbols.has(order.symbol)) return "unknown_symbol";
  if (
    !Number.isFinite(order.quantity) ||
    !Number.isInteger(order.quantity) ||
    order.quantity <= 0
  ) {
    return "invalid_quantity";
  }
  if (!(price > 0) || !Number.isFinite(price)) {
    return "unknown_symbol";
  }

  const currentQty = portfolios.positionQty(order.agentId, order.symbol);

  if (order.side === "buy") {
    const cost = buyCost(price, order.quantity, limits.transactionCostRate);
    if (portfolios.cash(order.agentId) < cost) return "insufficient_cash";

    if (limits.maxPositionSize !== undefined) {
      if (currentQty + order.quantity > limits.maxPositionSize) {
        return "position_limit";
      }
    }
    return null;
  }

  // sell
  if (currentQty < order.quantity) return "insufficient_shares";
  return null;
}
