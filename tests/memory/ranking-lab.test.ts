import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, scoreWeights } from "../../experiments/ranking-lab.js";

describe("ranking lab", () => {
  it("default weights keep isolation and prefer contextual match", () => {
    const scored = scoreWeights({
      ...DEFAULT_WEIGHTS,
      contextual: 2,
      temporal: 1.5,
      lambda: 0.02,
    });
    expect(scored.isolationOk).toBe(true);
    expect(scored.accuracy).toBeGreaterThan(0);
  });
});
