import OpenAI from "openai";
import { getEmbeddingModel, getOpenAIApiKey } from "../../config.js";
import type { Embedder } from "./types.js";

/** text-embedding-3-small default output size. */
export const EMBEDDING_3_SMALL_DIMS = 1536;

export type OpenAIEmbedderOptions = {
  apiKey?: string;
  model?: string;
  dimensions?: number;
  /** Inject for tests. */
  client?: OpenAI;
};

export class OpenAIEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly client: OpenAI;

  constructor(opts: OpenAIEmbedderOptions = {}) {
    this.model = opts.model ?? getEmbeddingModel();
    this.dimensions = opts.dimensions ?? EMBEDDING_3_SMALL_DIMS;
    this.client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey ?? getOpenAIApiKey(),
      });
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedMany([text]);
    return v!;
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.client.embeddings.create({
      model: this.model,
      input: [...texts],
      dimensions: this.dimensions,
    });
    const byIndex = new Map(res.data.map((d) => [d.index, d.embedding]));
    return texts.map((_, i) => {
      const emb = byIndex.get(i);
      if (!emb) throw new Error(`missing embedding for index ${i}`);
      return emb;
    });
  }
}
