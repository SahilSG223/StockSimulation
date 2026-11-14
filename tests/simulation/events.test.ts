import { describe, expect, it } from "vitest";
import { EventScheduler, toPublicInfo } from "../../src/simulation/event-scheduler.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import type { MarketEvent } from "../../src/simulation/types.js";

const event: MarketEvent = {
  id: "rate-hike",
  type: "rate_hike",
  tick: 3,
  duration: 2,
  affectedSectors: ["Financials"],
  publicInfo: {
    headline: "Central bank hikes rates",
    summary: "Policy rate up 25bps.",
  },
  effect: {
    returnShock: -0.015,
    volMultiplier: 1.3,
    driftBias: -0.0005,
  },
};

describe("event injection", () => {
  it("schedules events and activates them over their duration", () => {
    const scheduler = new EventScheduler();
    scheduler.schedule(event);
    expect(scheduler.activeAt(2)).toHaveLength(0);
    expect(scheduler.activeAt(3)).toHaveLength(1);
    expect(scheduler.activeAt(4)).toHaveLength(1);
    expect(scheduler.activeAt(5)).toHaveLength(0);
  });

  it("separates public info from true effect fields", () => {
    const pub = toPublicInfo(event);
    expect(pub).toMatchObject({
      id: "rate-hike",
      headline: "Central bank hikes rates",
      summary: "Policy rate up 25bps.",
    });
    expect(pub).not.toHaveProperty("effect");
    expect(pub).not.toHaveProperty("publicInfo");

    const eng = new MarketEngine({ seed: 1 });
    eng.scheduleEvent(event);
    eng.run(3);
    const obs = eng.observe();
    expect(obs.events).toHaveLength(1);
    expect(obs.events[0]).not.toHaveProperty("effect");
    expect(eng.getEvents()[0]?.effect.returnShock).toBe(-0.015);
  });

  it("reproducibly moves targeted assets when the event fires", () => {
    const withEvent = new MarketEngine({ seed: 50 });
    const without = new MarketEngine({ seed: 50 });
    withEvent.scheduleEvent(event);

    withEvent.run(4);
    without.run(4);

    // BANK is Financials — should differ once the event is active.
    expect(withEvent.getPrices().BANK).not.toBe(without.getPrices().BANK);
  });
});
