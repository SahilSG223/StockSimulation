import { describe, expect, it } from "vitest";
import { SimulationClock } from "../../src/simulation/clock.js";

describe("SimulationClock", () => {
  it("starts at 0 and advances deterministically", () => {
    const clock = new SimulationClock();
    expect(clock.tick).toBe(0);
    expect(clock.advance()).toBe(1);
    expect(clock.advance(3)).toBe(4);
    expect(clock.tick).toBe(4);
  });

  it("rejects non-positive steps", () => {
    const clock = new SimulationClock();
    expect(() => clock.advance(0)).toThrow();
    expect(() => clock.advance(-1)).toThrow();
  });

  it("reset returns to 0", () => {
    const clock = new SimulationClock();
    clock.advance(5);
    clock.reset();
    expect(clock.tick).toBe(0);
  });
});
