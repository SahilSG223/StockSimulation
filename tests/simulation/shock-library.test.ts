import { describe, expect, it } from "vitest";
import { MarketEngine } from "../../src/simulation/market-engine.js";
import {
  SHOCK_PRESETS,
  createShock,
  type ShockPresetId,
} from "../../src/simulation/shock-library.js";

const PRESET_IDS = Object.keys(SHOCK_PRESETS) as ShockPresetId[];

function averagePrice(prices: Readonly<Record<string, number>>): number {
  const values = Object.values(prices);
  return values.reduce((sum, p) => sum + p, 0) / values.length;
}

describe("shock library", () => {
  it.each(PRESET_IDS)("%s builds an event the engine accepts", (preset) => {
    const engine = new MarketEngine({ seed: 1 });
    const shock = createShock(preset, { tick: 3 });

    expect(shock).toMatchObject({ id: `${preset}-t3`, type: preset, tick: 3 });
    expect(() => engine.scheduleEvent(shock)).not.toThrow();
    engine.run(3);
    expect(engine.observe().events.map((e) => e.id)).toEqual([`${preset}-t3`]);
  });

  it("overrides duration and allows the same preset at different ticks", () => {
    const engine = new MarketEngine({ seed: 1 });
    const early = createShock("rate_hike", { tick: 2, duration: 1 });
    const late = createShock("rate_hike", { tick: 10 });

    expect(early.duration).toBe(1);
    expect(late.duration).toBe(SHOCK_PRESETS.rate_hike.duration);
    engine.scheduleEvent(early);
    expect(() => engine.scheduleEvent(late)).not.toThrow();
  });

  it("returns a copy, so editing one shock never changes the preset", () => {
    const shock = createShock("chip_export_ban", { tick: 1 });
    (shock.effect as { returnShock: number }).returnShock = 99;
    (shock.affectedSectors as string[]).push("Energy");

    expect(SHOCK_PRESETS.chip_export_ban.effect.returnShock).toBe(-0.025);
    expect(createShock("chip_export_ban", { tick: 1 }).affectedSectors).toEqual(["Semiconductors"]);
  });

  it("market_crash pulls the whole market below the same run without it", () => {
    const crashed = new MarketEngine({ seed: 7 });
    const control = new MarketEngine({ seed: 7 });
    crashed.scheduleEvent(createShock("market_crash", { tick: 1 }));

    crashed.run(3);
    control.run(3);

    expect(averagePrice(crashed.getPrices())).toBeLessThan(averagePrice(control.getPrices()));
  });

  it("chip_export_ban only moves semiconductors", () => {
    const shocked = new MarketEngine({ seed: 7 });
    const control = new MarketEngine({ seed: 7 });
    shocked.scheduleEvent(createShock("chip_export_ban", { tick: 1 }));

    shocked.run(5);
    control.run(5);

    const after = shocked.getPrices();
    const base = control.getPrices();
    expect(after.SEMI).toBeLessThan(base.SEMI!);
    for (const symbol of ["TECH", "ENRG", "BANK", "CONS"]) {
      expect(after[symbol]).toBe(base[symbol]);
    }
  });
});
