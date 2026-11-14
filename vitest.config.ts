import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests + optional heavy suite under tests/experiments/
    include: ["tests/**/*.test.ts"],
  },
});
