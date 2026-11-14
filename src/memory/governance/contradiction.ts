import type { MemoryRecord } from "./types.js";
import { invalidateMemory, supersedeMemory } from "./lifecycle.js";

export type ContradictionAction = "none" | "narrow_scope" | "invalidate" | "supersede";

export type ContradictionResult = {
  action: ContradictionAction;
  memory: MemoryRecord;
  reason: string;
};

/**
 * Heuristic stub: if new evidence contradicts and regimes match → invalidate;
 * if regimes differ → prefer narrowing (caller supplies narrowed scope) / supersede.
 * Replace with real evidence comparison once experiences are linked.
 */
export function handleContradiction(args: {
  memory: MemoryRecord;
  newRegime?: string;
  atTick: number;
  reason: string;
}): ContradictionResult {
  const { memory, newRegime, atTick, reason } = args;
  const sameRegime =
    !newRegime ||
    memory.scope.regimes.length === 0 ||
    memory.scope.regimes.includes(newRegime);

  if (sameRegime) {
    const { memory: next } = invalidateMemory(memory, reason, atTick);
    return { action: "invalidate", memory: next, reason };
  }

  const narrowed: MemoryRecord = {
    ...memory,
    scope: {
      ...memory.scope,
      regimes: memory.scope.regimes.filter((r) => r !== newRegime),
    },
    reliability: Math.max(0, memory.reliability * 0.8),
    updatedAtTick: atTick,
    version: memory.version + 1,
  };
  if (narrowed.scope.regimes.length === 0) {
    const { memory: next } = supersedeMemory(memory, reason, atTick);
    return { action: "supersede", memory: next, reason };
  }
  return { action: "narrow_scope", memory: narrowed, reason };
}
