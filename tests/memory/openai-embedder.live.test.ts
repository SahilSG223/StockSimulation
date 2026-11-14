/**
 * Live OpenAI call — only runs when RUN_OPENAI_TESTS=1 and OPENAI_API_KEY is set.
 */
import { describe, expect, it } from "vitest";
import { OpenAIEmbedder } from "../../src/memory/embeddings/index.js";

const run = process.env.RUN_OPENAI_TESTS === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());

describe.runIf(run)("OpenAIEmbedder live", () => {
  it("embeds with text-embedding-3-small (1536 dims)", async () => {
    const embedder = new OpenAIEmbedder();
    expect(embedder.model).toMatch(/embedding/);
    const v = await embedder.embed("semiconductor momentum in a bull regime");
    expect(v).toHaveLength(embedder.dimensions);
    expect(v.some((x) => x !== 0)).toBe(true);
  }, 30_000);
});

describe.runIf(!run)("OpenAIEmbedder live (skipped)", () => {
  it("skips unless RUN_OPENAI_TESTS=1", () => {
    expect(true).toBe(true);
  });
});
