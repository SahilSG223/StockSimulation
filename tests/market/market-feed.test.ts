import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MarketFeed, type PublicMarketObservation } from "../../src/market/market-feed.js";
import { publicMarketObservationSchema } from "../../src/market/observation-schema.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { MarketEvent } from "../../src/simulation/types.js";

const shock: MarketEvent = {
  id: "chip-ban",
  type: "chip_export_ban",
  tick: 25,
  duration: 5,
  affectedSectors: ["Semiconductors"],
  publicInfo: { headline: "Chip exports restricted", summary: "New export controls." },
  effect: { returnShock: -0.025, volMultiplier: 1.6, driftBias: -0.001 },
};

function run(seed: number, ticks: number): PublicMarketObservation[] {
  const engine = new MarketEngine({ seed });
  engine.scheduleEvent(shock);
  engine.setRegime("bear", 30);
  const feed = new MarketFeed(engine);
  const observations = [feed.observe()];
  for (let i = 0; i < ticks; i++) {
    feed.step();
    observations.push(feed.observe());
  }
  return observations;
}

describe("MarketFeed", () => {
  it("produces observations that pass the schema at every tick", () => {
    for (const observation of run(3, 40)) {
      expect(() => publicMarketObservationSchema.parse(observation)).not.toThrow();
    }
  });

  it("adds features as history grows and regimeEstimate from tick 20", () => {
    const observations = run(3, 40);
    expect(observations[0]?.features.index).toEqual({});
    expect(observations[0]?.regimeEstimate).toBeUndefined();
    expect(observations[5]?.features.symbols.SEMI?.return5).toBeTypeOf("number");
    expect(observations[19]?.regimeEstimate).toBeUndefined();
    expect(observations[20]?.regimeEstimate).toBeDefined();
  });

  it("shows events with public info only while they are active", () => {
    const observations = run(3, 40);
    expect(observations[24]?.events).toEqual([]);
    expect(observations[25]?.events).toEqual([
      {
        id: "chip-ban",
        type: "chip_export_ban",
        tick: 25,
        duration: 5,
        affectedSectors: ["Semiconductors"],
        headline: "Chip exports restricted",
        summary: "New export controls.",
      },
    ]);
    expect(observations[30]?.events).toEqual([]);
  });

  it("never exposes the true regime, hidden market factor, or event effects", () => {
    for (const observation of run(3, 40)) {
      expect(observation).not.toHaveProperty("regime");
      expect(observation).not.toHaveProperty("marketReturn");
      for (const event of observation.events) expect(event).not.toHaveProperty("effect");
    }

    const valid = run(3, 25).at(-1)!;
    const schema = publicMarketObservationSchema;
    expect(() => schema.parse({ ...valid, regime: "bear" })).toThrow();
    expect(() => schema.parse({ ...valid, marketReturn: 0.01 })).toThrow();
    expect(() =>
      schema.parse({ ...valid, events: [{ ...valid.events[0], effect: shock.effect }] }),
    ).toThrow();
  });

  it("is identical across runs with the same seed", () => {
    expect(run(9, 30)).toEqual(run(9, 30));
  });

  it("throws if the engine is advanced without the feed", () => {
    const engine = new MarketEngine({ seed: 1 });
    const feed = new MarketFeed(engine);
    engine.step();
    expect(() => feed.observe()).toThrow(/feed\.step\(\)/);
  });

  it("can be extended with per-agent fields, as the Agents stream would", () => {
    const engine = new MarketEngine({ seed: 1 });
    engine.registerAgent("alice");
    const feed = new MarketFeed(engine);
    feed.step();

    const agentObservationSchema = publicMarketObservationSchema.extend({
      portfolio: z.object({ agentId: z.string(), cash: z.number() }).passthrough(),
    });
    const parsed = agentObservationSchema.parse({
      ...feed.observe(),
      portfolio: engine.getPortfolio("alice"),
    });
    expect(parsed.portfolio.agentId).toBe("alice");
    expect(parsed.features.index.return1).toBeTypeOf("number");
  });
});
