import { z } from "zod";

export const embeddingVectorSchema = z
  .array(z.number().finite())
  .min(1)
  .max(4096)
  .refine((vector) => vector.some((value) => value !== 0), "Embedding must not be a zero vector");
const responseSchema = z.object({
  data: z.array(z.object({ index: z.literal(0), embedding: embeddingVectorSchema })).length(1),
});

export interface EmbeddingProvider {
  model: string;
  embed(text: string): Promise<number[]>;
}

export function createEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = globalThis.fetch,
): EmbeddingProvider {
  const model = env.EMBEDDING_MODEL?.trim();
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!model) throw new Error("EMBEDDING_MODEL is required for vector memory");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for embeddings");
  return {
    model,
    async embed(text) {
      if (!text.trim()) throw new Error("Cannot embed empty text");
      // Conservative size bound for narrative inputs; raw time series are never sent.
      if (text.length > 12_000) throw new Error("Memory embedding text exceeds 12000 characters");
      let response: Response;
      try {
        response = await request("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, input: text, encoding_format: "float" }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new Error("Embedding request failed or timed out");
      }
      if (!response.ok) throw new Error(`Embedding request failed (HTTP ${response.status})`);
      try {
        return responseSchema.parse(await response.json()).data[0]!.embedding;
      } catch {
        throw new Error("Embedding provider returned invalid vector data");
      }
    },
  };
}
