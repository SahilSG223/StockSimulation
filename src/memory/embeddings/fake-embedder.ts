import type { Embedder } from "./types.js";

/**
 * Deterministic bag-of-tokens embedder for tests (no network).
 * Not a substitute for OpenAI in production paths.
 */
export class FakeEmbedder implements Embedder {
  readonly model = "fake-embedder";
  readonly dimensions: number;

  constructor(dimensions = 32) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedMany([text]);
    return v!;
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    return texts.map((t) => this.hashEmbed(t));
  }

  private hashEmbed(text: string): number[] {
    const v = Array.from({ length: this.dimensions }, () => 0);
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    for (const tok of tokens) {
      let h = 0;
      for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
      const idx = h % this.dimensions;
      v[idx] = (v[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
