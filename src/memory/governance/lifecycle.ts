import type { MemoryRecord, MemoryStatus } from "./types.js";

export type LifecycleChange = {
  previousStatus: MemoryStatus;
  nextStatus: MemoryStatus;
  reason: string;
  atTick: number;
};

export function invalidateMemory(
  memory: MemoryRecord,
  reason: string,
  atTick: number,
): { memory: MemoryRecord; change: LifecycleChange } {
  const previousStatus = memory.status;
  const next: MemoryRecord = {
    ...memory,
    status: "invalidated",
    invalidationReason: reason,
    updatedAtTick: atTick,
    version: memory.version + 1,
  };
  return {
    memory: next,
    change: { previousStatus, nextStatus: "invalidated", reason, atTick },
  };
}

export function supersedeMemory(
  memory: MemoryRecord,
  reason: string,
  atTick: number,
): { memory: MemoryRecord; change: LifecycleChange } {
  const previousStatus = memory.status;
  const next: MemoryRecord = {
    ...memory,
    status: "superseded",
    invalidationReason: reason,
    updatedAtTick: atTick,
    version: memory.version + 1,
  };
  return {
    memory: next,
    change: { previousStatus, nextStatus: "superseded", reason, atTick },
  };
}

/** Only active memories participate in normal retrieval. */
export function isRetrievable(memory: MemoryRecord): boolean {
  return memory.status === "active";
}
