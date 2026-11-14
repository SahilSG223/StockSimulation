/**
 * Callers get copies of events, never the engine's own objects (issue #22).
 * Each test edits what a caller received and checks the engine is unaffected,
 * against an identical run where nobody edited anything.
 */
import { describe, expect, it } from "vitest";
import { EventScheduler, toPublicInfo } from "../../src/simulation/event-scheduler.js";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import { createShock } from "../../src/simulation/shock-library.js";

function engineWithChipBan(): MarketEngine {
  const engine = new MarketEngine({ seed: 3 });
  engine.scheduleEvent(createShock("chip_export_ban", { tick: 1 }));
  return engine;
}

/** Prices after the same steps with no tampering. */
function cleanPricesAfter(steps: number) {
  const engine = engineWithChipBan();
  engine.run(steps);
  return engine.getPrices();
}

describe("event isolation", () => {
  it("editing an observed event's sectors does not retarget the shock", () => {
    const engine = engineWithChipBan();
    engine.step();
    const observed = engine.observe().events[0]!;
    (observed.affectedSectors as string[]).push("Energy");

    engine.run(2);
    expect(engine.getPrices()).toEqual(cleanPricesAfter(3));
    expect(engine.getEvents()[0]!.affectedSectors).toEqual(["Semiconductors"]);
  });

  it("editing getEvents() output does not change the real shock", () => {
    const engine = engineWithChipBan();
    const events = engine.getEvents();
    (events[0]!.effect as { returnShock: number }).returnShock = 0;
    (events as unknown as unknown[]).length = 0;

    engine.run(3);
    expect(engine.getPrices()).toEqual(cleanPricesAfter(3));
    expect(engine.getEvents()).toHaveLength(1);
  });

  it("toPublicInfo returns arrays the caller owns", () => {
    const event = createShock("rate_hike", { tick: 0 });
    const info = toPublicInfo(event);
    (info.affectedSectors as string[]).push("Energy");
    expect(event.affectedSectors).toEqual(["Technology", "Semiconductors", "Consumer"]);
  });

  it("EventScheduler.activeAt and all return copies", () => {
    const scheduler = new EventScheduler();
    scheduler.schedule(createShock("market_crash", { tick: 0 }));
    (scheduler.activeAt(0)[0]!.effect as { returnShock: number }).returnShock = 99;
    (scheduler.all()[0]!.publicInfo as { headline: string }).headline = "edited";

    expect(scheduler.all()[0]!.effect.returnShock).toBe(-0.04);
    expect(scheduler.activeAt(0)[0]!.publicInfo.headline).not.toBe("edited");
  });
});
