import { describe, expect, it } from "vitest";
import { ExperienceStore } from "../../src/memory/experiences/index.js";

describe("ExperienceStore", () => {
  it("isolates experiences by agentId", () => {
    const store = new ExperienceStore();
    store.create({
      agentId: "a1",
      simulationId: "sim-1",
      tick: 1,
      decisionSummary: "bought SEMI",
      outcomeSummary: "small loss",
      scope: { symbols: ["SEMI"], sectors: ["semiconductors"] },
    });
    store.create({
      agentId: "a2",
      simulationId: "sim-1",
      tick: 1,
      decisionSummary: "sold TECH",
      outcomeSummary: "gain",
      scope: { symbols: ["TECH"], sectors: ["technology"] },
    });

    expect(store.listForAgent("a1")).toHaveLength(1);
    expect(store.listForAgent("a1")[0]?.agentId).toBe("a1");
    expect(store.listForAgent("a2")).toHaveLength(1);
    expect(store.listForAgent("missing")).toHaveLength(0);
  });
});
