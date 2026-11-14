/** Canonical collection names for Atlas. */

export const COLLECTIONS = {
  experiences: "experiences",
  memories: "memories",
  memoryVersions: "memory_versions",
  decisions: "decisions",
  simulations: "simulations",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
