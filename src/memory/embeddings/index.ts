export { consolidateExperienceToMemory } from "./consolidate.js";
export { cosineSimilarity } from "./cosine.js";
export { embedMemoryContent } from "./embed-memory.js";
export {
  toEmbeddedMemory,
  toMemoryDoc,
} from "./embedded-memory-mapper.js";
export { FakeEmbedder } from "./fake-embedder.js";
export {
  INVALIDATE_LOSS_STREAK,
  quickRegimeLabel,
  scoreLessonOutcome,
  type LessonOutcomeArgs,
  type LessonOutcomeResult,
} from "./lesson-outcome.js";
export { MemoryIndex, type UpsertMemoryInput } from "./memory-index.js";
export { MongoMemoryIndex } from "./mongo-memory-index.js";
export {
  EMBEDDING_3_SMALL_DIMS,
  OpenAIEmbedder,
  type OpenAIEmbedderOptions,
} from "./openai-embedder.js";
export {
  DEFAULT_EMBEDDING_WEIGHTS,
  rankWithEmbeddings,
  type EmbeddingRankWeights,
  type RankedEmbeddedMemory,
  type RetrievalContext,
} from "./rank-with-embeddings.js";
export type { EmbeddedMemory, Embedder } from "./types.js";
