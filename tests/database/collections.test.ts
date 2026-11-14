import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../src/database/collections.js";

describe("COLLECTIONS", () => {
  it("exports collection names", () => {
    expect(COLLECTIONS.experiences).toBe("experiences");
    expect(COLLECTIONS.memories).toBe("memories");
  });
});
