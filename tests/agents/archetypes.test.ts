import { describe, expect, it } from "vitest";
import { createArchetypeProvider, type Archetype } from "../../src/agents/archetypes.js";
import { decisionSchema } from "../../src/agents/decision-schema.js";
import type { AgentObservation } from "../../src/agents/observation-schema.js";

function observation(prices: Record<string, number>, tick: number): AgentObservation {
  return {
    tick,
    prices,
    events: [],
    portfolio: {
      agentId: "alice",
      cash: 100_000,
      equity: 100_000,
      positions: [],
      realizedPnl: 0,
      unrealizedPnl: 0,
    },
  };
}

async function decide(archetype: Archetype, prices: Record<string, number>) {
  const previousObservation = observation(
    Object.fromEntries(Object.keys(prices).map((symbol) => [symbol, 100])),
    0,
  );
  return decisionSchema.parse(
    await createArchetypeProvider(archetype)({
      previousObservation,
      observation: observation(prices, 1),
    }),
  );
}

describe("additional archetypes", () => {
  it("breakout ignores small moves and buys a sharp rise", async () => {
    expect((await decide("breakout", { TECH: 102 })).orders).toEqual([]);
    const decision = await decide("breakout", { TECH: 104, SEMI: 101 });
    expect(decision.orders).toEqual([
      { symbol: "TECH", side: "buy", quantity: Math.floor(15_000 / 104) },
    ]);
  });

  it("breakout sells an owned holding after a sharp decline", async () => {
    const current = observation({ TECH: 96 }, 1);
    current.portfolio.positions = [{ symbol: "TECH", quantity: 7, avgCost: 100 }];
    const decision = decisionSchema.parse(
      await createArchetypeProvider("breakout")({
        observation: current,
        previousObservation: observation({ TECH: 100 }, 0),
      }),
    );
    expect(decision.orders).toEqual([{ symbol: "TECH", side: "sell", quantity: 7 }]);
  });

  it("dip buyer buys the deepest qualifying decline, ignoring a larger rally", async () => {
    const decision = await decide("dip_buyer", { TECH: 97, SEMI: 96, BANK: 120 });
    expect(decision.orders).toEqual([
      { symbol: "SEMI", side: "buy", quantity: Math.floor(5_000 / 96) },
    ]);
    expect((await decide("dip_buyer", { TECH: 99 })).orders).toEqual([]);
  });

  it("dip buyer holds an existing position through a rally", async () => {
    const current = observation({ TECH: 110 }, 1);
    current.portfolio.positions = [{ symbol: "TECH", quantity: 7, avgCost: 100 }];
    const decision = decisionSchema.parse(
      await createArchetypeProvider("dip_buyer")({
        observation: current,
        previousObservation: observation({ TECH: 100 }, 0),
      }),
    );
    expect(decision.orders).toEqual([]);
  });

  it.each(["breakout", "dip_buyer"] as const)(
    "%s holds without history or available buying cash",
    async (archetype) => {
      const provider = createArchetypeProvider(archetype);
      const current = observation({ TECH: archetype === "breakout" ? 110 : 90 }, 1);
      expect(decisionSchema.parse(await provider({ observation: current })).orders).toEqual([]);
      current.portfolio.cash = 0;
      expect(
        decisionSchema.parse(
          await provider({
            observation: current,
            previousObservation: observation({ TECH: 100 }, 0),
          }),
        ).orders,
      ).toEqual([]);
    },
  );

  it("aggressive acts on smaller moves and allocates more cash than momentum", async () => {
    expect((await decide("momentum", { TECH: 100.075 })).orders).toEqual([]);
    expect((await decide("aggressive", { TECH: 100.075 })).orders[0]).toMatchObject({
      side: "buy",
      symbol: "TECH",
    });
    const aggressive = await decide("aggressive", { TECH: 102 });
    const momentum = await decide("momentum", { TECH: 102 });
    expect(aggressive.orders[0]!.quantity).toBe(Math.floor(25_000 / 102));
    expect(aggressive.orders[0]!.quantity).toBeGreaterThan(momentum.orders[0]!.quantity);
  });

  it("adaptive follows a broad rise", async () => {
    const decision = await decide("adaptive", { TECH: 102, SEMI: 101, BANK: 101, ENERGY: 99 });
    expect(decision.orders).toEqual([
      { symbol: "TECH", side: "buy", quantity: Math.floor(8_000 / 102) },
    ]);
    expect(decision.reasoning).toContain("broad market trend");
  });

  it("adaptive buys a dip in a mixed market", async () => {
    const decision = await decide("adaptive", { TECH: 98, SEMI: 101, BANK: 100, ENERGY: 100 });
    expect(decision.orders[0]).toMatchObject({ symbol: "TECH", side: "buy" });
    expect(decision.reasoning).toContain("mixed market reversal");
  });

  it("adaptive reduces allocation after large observed moves", async () => {
    const decision = await decide("adaptive", { TECH: 110, SEMI: 108 });
    expect(decision.orders).toEqual([
      { symbol: "TECH", side: "buy", quantity: Math.floor(2_000 / 110) },
    ]);
    expect(decision.reasoning).toContain("reduced allocation");
  });

  it("adaptive sells an owned position during a broad decline", async () => {
    const current = observation({ TECH: 95, SEMI: 98 }, 1);
    current.portfolio.positions = [{ symbol: "TECH", quantity: 7, avgCost: 100 }];
    const decision = decisionSchema.parse(
      await createArchetypeProvider("adaptive")({
        observation: current,
        previousObservation: observation({ TECH: 100, SEMI: 100 }, 0),
      }),
    );
    expect(decision.orders).toEqual([{ symbol: "TECH", side: "sell", quantity: 7 }]);
  });

  it.each(["aggressive", "adaptive"] as const)(
    "%s holds without history, a signal, cash, or owned shares",
    async (archetype) => {
      const provider = createArchetypeProvider(archetype);
      expect(
        decisionSchema.parse(await provider({ observation: observation({ TECH: 100 }, 0) })).orders,
      ).toEqual([]);
      expect((await decide(archetype, { TECH: 100 })).orders).toEqual([]);
      expect((await decide(archetype, { TECH: 99 })).orders).toEqual([]);
      const current = observation({ TECH: 101 }, 1);
      current.portfolio.cash = 0;
      expect(
        decisionSchema.parse(
          await provider({
            observation: current,
            previousObservation: observation({ TECH: 100 }, 0),
          }),
        ).orders,
      ).toEqual([]);
    },
  );

  it("adaptive switches mode using each cycle's observations", async () => {
    const provider = createArchetypeProvider("adaptive");
    const first = observation({ TECH: 100, SEMI: 100 }, 0);
    const second = observation({ TECH: 102, SEMI: 101 }, 1);
    const third = observation({ TECH: 100, SEMI: 102 }, 2);
    const trend = decisionSchema.parse(
      await provider({ observation: second, previousObservation: first }),
    );
    const reversal = decisionSchema.parse(
      await provider({ observation: third, previousObservation: second }),
    );
    expect(trend.reasoning).toContain("broad market trend");
    expect(reversal.reasoning).toContain("mixed market reversal");
    expect(reversal.orders[0]).toMatchObject({ symbol: "TECH", side: "buy" });
  });
});
