import type { Order, PortfolioSnapshot, PortfolioState, Position } from "./types.js";

/** Engine-owned portfolio ledger. Agents never mutate these fields directly. */
export class PortfolioManager {
  private readonly portfolios = new Map<string, MutablePortfolio>();

  register(agentId: string, initialCash: number): void {
    if (this.portfolios.has(agentId)) {
      throw new Error(`agent already registered: ${agentId}`);
    }
    if (!(initialCash >= 0) || !Number.isFinite(initialCash)) {
      throw new Error(`initialCash must be a finite non-negative number`);
    }
    this.portfolios.set(agentId, {
      agentId,
      cash: initialCash,
      positions: new Map(),
      realizedPnl: 0,
    });
  }

  has(agentId: string): boolean {
    return this.portfolios.has(agentId);
  }

  private require(agentId: string): MutablePortfolio {
    const p = this.portfolios.get(agentId);
    if (!p) {
      throw new Error(`unknown agent: ${agentId}`);
    }
    return p;
  }

  getState(agentId: string): PortfolioState {
    return freezeState(this.require(agentId));
  }

  getSnapshot(agentId: string, prices: Readonly<Record<string, number>>): PortfolioSnapshot {
    const p = this.require(agentId);
    let unrealized = 0;
    const positions: Position[] = [];
    for (const pos of p.positions.values()) {
      const price = prices[pos.symbol];
      if (price === undefined) {
        throw new Error(`missing mark price for ${pos.symbol}`);
      }
      unrealized += (price - pos.avgCost) * pos.quantity;
      positions.push({ ...pos });
    }
    const equity = p.cash + markPositions(p.positions, prices);
    return {
      agentId: p.agentId,
      cash: p.cash,
      positions,
      realizedPnl: p.realizedPnl,
      unrealizedPnl: unrealized,
      equity,
    };
  }

  cash(agentId: string): number {
    return this.require(agentId).cash;
  }

  positionQty(agentId: string, symbol: string): number {
    return this.require(agentId).positions.get(symbol)?.quantity ?? 0;
  }

  /**
   * Apply a filled trade. Caller must already have validated affordability.
   * Buy increases position / decreases cash; sell is the reverse and realizes PnL.
   */
  applyFill(order: Order, fillPrice: number, fee: number): void {
    const p = this.require(order.agentId);
    const notional = fillPrice * order.quantity;

    if (order.side === "buy") {
      p.cash -= notional + fee;
      const existing = p.positions.get(order.symbol);
      if (existing) {
        const totalQty = existing.quantity + order.quantity;
        const totalCost = existing.avgCost * existing.quantity + fillPrice * order.quantity;
        existing.quantity = totalQty;
        existing.avgCost = totalCost / totalQty;
      } else {
        p.positions.set(order.symbol, {
          symbol: order.symbol,
          quantity: order.quantity,
          avgCost: fillPrice,
        });
      }
      return;
    }

    // sell
    p.cash += notional - fee;
    const existing = p.positions.get(order.symbol);
    if (!existing || existing.quantity < order.quantity) {
      throw new Error(`internal: sell exceeds position for ${order.symbol}`);
    }
    const realized = (fillPrice - existing.avgCost) * order.quantity - fee;
    p.realizedPnl += realized;
    existing.quantity -= order.quantity;
    if (existing.quantity === 0) {
      p.positions.delete(order.symbol);
    }
  }
}

interface MutablePortfolio {
  agentId: string;
  cash: number;
  positions: Map<string, Position>;
  realizedPnl: number;
}

function markPositions(
  positions: ReadonlyMap<string, Position>,
  prices: Readonly<Record<string, number>>,
): number {
  let value = 0;
  for (const pos of positions.values()) {
    const price = prices[pos.symbol];
    if (price === undefined) {
      throw new Error(`missing mark price for ${pos.symbol}`);
    }
    value += price * pos.quantity;
  }
  return value;
}

function freezeState(p: MutablePortfolio): PortfolioState {
  return {
    agentId: p.agentId,
    cash: p.cash,
    positions: new Map(p.positions),
    realizedPnl: p.realizedPnl,
  };
}

/** Cost to buy `quantity` shares at `price` including fee. */
export function buyCost(price: number, quantity: number, feeRate: number): number {
  const notional = price * quantity;
  return notional + notional * feeRate;
}
