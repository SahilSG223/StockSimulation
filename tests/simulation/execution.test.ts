import { describe, expect, it } from "vitest";
import { MarketEngine } from "../../src/simulation/market-engine.js";

describe("order execution and portfolios", () => {
  it("fills a valid buy and updates cash/positions", () => {
    const eng = new MarketEngine({
      seed: 3,
      transactionCostRate: 0.001,
      initialCash: 10_000,
    });
    eng.registerAgent("alice");
    const price = eng.getPrices().TECH!;
    const qty = 5;
    const result = eng.submitOrder({
      agentId: "alice",
      symbol: "TECH",
      side: "buy",
      quantity: qty,
    });

    expect(result.status).toBe("filled");
    if (result.status !== "filled") return;

    const fee = price * qty * 0.001;
    const snap = eng.getPortfolio("alice");
    expect(snap.cash).toBeCloseTo(10_000 - price * qty - fee, 10);
    expect(snap.positions).toEqual([{ symbol: "TECH", quantity: qty, avgCost: price }]);
    expect(snap.realizedPnl).toBe(0);
  });

  it("rejects invalid orders without mutating portfolio", () => {
    const eng = new MarketEngine({ seed: 3, initialCash: 100 });
    eng.registerAgent("bob");
    const before = eng.getPortfolio("bob");

    const unknown = eng.submitOrder({
      agentId: "bob",
      symbol: "NOPE",
      side: "buy",
      quantity: 1,
    });
    expect(unknown).toMatchObject({ status: "rejected", reason: "unknown_symbol" });

    const broke = eng.submitOrder({
      agentId: "bob",
      symbol: "TECH",
      side: "buy",
      quantity: 1000,
    });
    expect(broke).toMatchObject({
      status: "rejected",
      reason: "insufficient_cash",
    });

    const badQty = eng.submitOrder({
      agentId: "bob",
      symbol: "TECH",
      side: "buy",
      quantity: 0,
    });
    expect(badQty).toMatchObject({
      status: "rejected",
      reason: "invalid_quantity",
    });

    const short = eng.submitOrder({
      agentId: "bob",
      symbol: "TECH",
      side: "sell",
      quantity: 1,
    });
    expect(short).toMatchObject({
      status: "rejected",
      reason: "insufficient_shares",
    });

    expect(eng.getPortfolio("bob")).toEqual(before);
  });

  it("realizes PnL on sell and tracks unrealized on open positions", () => {
    const eng = new MarketEngine({
      seed: 8,
      transactionCostRate: 0,
      initialCash: 50_000,
    });
    eng.registerAgent("carol");

    const buyPrice = eng.getPrices().SEMI!;
    eng.submitOrder({
      agentId: "carol",
      symbol: "SEMI",
      side: "buy",
      quantity: 10,
    });

    eng.step();
    eng.step();

    const mid = eng.getPortfolio("carol");
    expect(mid.positions[0]?.quantity).toBe(10);
    const mark = eng.getPrices().SEMI!;
    expect(mid.unrealizedPnl).toBeCloseTo((mark - buyPrice) * 10, 10);

    const sellPrice = mark;
    eng.submitOrder({
      agentId: "carol",
      symbol: "SEMI",
      side: "sell",
      quantity: 10,
    });
    const after = eng.getPortfolio("carol");
    expect(after.positions).toHaveLength(0);
    expect(after.unrealizedPnl).toBe(0);
    expect(after.realizedPnl).toBeCloseTo((sellPrice - buyPrice) * 10, 10);
  });

  it("enforces max position size when configured", () => {
    const eng = new MarketEngine({
      seed: 1,
      maxPositionSize: 3,
      initialCash: 100_000,
    });
    eng.registerAgent("dave");
    const ok = eng.submitOrder({
      agentId: "dave",
      symbol: "CONS",
      side: "buy",
      quantity: 3,
    });
    expect(ok.status).toBe("filled");
    const blocked = eng.submitOrder({
      agentId: "dave",
      symbol: "CONS",
      side: "buy",
      quantity: 1,
    });
    expect(blocked).toMatchObject({
      status: "rejected",
      reason: "position_limit",
    });
  });

  it("engine owns portfolio state — getPortfolio returns a snapshot copy", () => {
    const eng = new MarketEngine({ seed: 2 });
    eng.registerAgent("eve");
    eng.submitOrder({
      agentId: "eve",
      symbol: "BANK",
      side: "buy",
      quantity: 2,
    });
    const snap = eng.getPortfolio("eve");
    // Mutating the snapshot must not corrupt engine state.
    (snap as { cash: number }).cash = -1;
    snap.positions[0]!.quantity = 999;
    const again = eng.getPortfolio("eve");
    expect(again.cash).toBeGreaterThan(0);
    expect(again.positions[0]?.quantity).toBe(2);
  });
});
