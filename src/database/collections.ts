/** Canonical collection names for Atlas. */

export const COLLECTIONS = {
  experiences: "experiences",
  /** Embedded experience narratives for Atlas Vector Search (see indexes.ts). */
  experienceVectors: "experience_vectors",
  memories: "memories",
  memoryVersions: "memory_versions",
  decisions: "decisions",
  simulations: "simulations",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
