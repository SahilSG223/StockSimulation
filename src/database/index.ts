export { getDb, type DbHandle } from "./client.js";
export { COLLECTIONS, type CollectionName } from "./collections.js";
export {
  EXPERIENCE_INDEXES,
  EXPERIENCE_VECTOR_FILTER_PATHS,
  EXPERIENCE_VECTOR_INDEXES,
  EXPERIENCE_VECTOR_SEARCH_INDEX,
  MEMORY_INDEXES,
  MEMORY_VECTOR_FILTER_PATHS,
  MEMORY_VECTOR_SEARCH_INDEX,
  ensureExperienceVectorSearchIndex,
  ensureMemoryIndexes,
  ensureMemoryVectorSearchIndex,
} from "./indexes.js";
