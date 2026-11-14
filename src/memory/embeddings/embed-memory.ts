import type { Embedder } from "./types.js";

/**
 * Embed lesson text for storage on a memory document.
 * Call before insert/update on the mongo memories collection (other PR).
 */
export async function embedMemoryContent(
  embedder: Embedder,
  content: string,
): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  const embedding = await embedder.embed(content);
  return {
    embedding,
    model: embedder.model,
    dimensions: embedder.dimensions,
  };
}
