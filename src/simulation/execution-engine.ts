import type { PortfolioManager } from "./portfolio-manager.js";
import { validateOrder, type RiskLimits } from "./risk-manager.js";
import type { ExecutionResult, Order } from "./types.js";

export interface ExecuteOrderInput {
  order: Order;
  tick: number;
  price: number | undefined;
  portfolios: PortfolioManager;
  knownSymbols: ReadonlySet<string>;
  limits: RiskLimits;
}

/**
 * Validate + fill at the current mark (simple market order, no book).
 * Engine owns fills — callers must not adjust cash/positions themselves.
 */
export function executeOrder(input: ExecuteOrderInput): ExecutionResult {
  const { order, tick, portfolios, knownSymbols, limits } = input;
  const price = input.price;

  if (price === undefined) {
    return { status: "rejected", order, reason: "unknown_symbol", tick };
  }

  const reason = validateOrder({
    order,
    portfolios,
    knownSymbols,
    price,
    limits,
  });
  if (reason !== null) {
    return { status: "rejected", order, reason, tick };
  }

  const notional = price * order.quantity;
  const fee = notional * limits.transactionCostRate;
  portfolios.applyFill(order, price, fee);

  return {
    status: "filled",
    order,
    fillPrice: price,
    notional,
    fee,
    tick,
  };
}
