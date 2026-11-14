import type { MemoryRecord } from "./types.js";
import { invalidateMemory } from "./lifecycle.js";

export type ContradictionAction = "narrow_scope" | "invalidate";

export type ContradictionResult = {
  action: ContradictionAction;
  memory: MemoryRecord;
  reason: string;
};

/**
 * Heuristic stub: a lesson with no regime scope (or a contradiction not tied
 * to any regime) has nothing to narrow to → invalidate outright. Otherwise
 * drop the contradicted regime from scope and keep the rest — unless that
 * was the only regime the lesson claimed, in which case nothing survives and
 * it's invalidated too. Replace with real evidence comparison once
 * experiences are linked.
 */
export function handleContradiction(args: {
  memory: MemoryRecord;
  newRegime?: string;
  atTick: number;
  reason: string;
}): ContradictionResult {
  const { memory, newRegime, atTick, reason } = args;

  if (!newRegime || memory.scope.regimes.length === 0) {
    const { memory: next } = invalidateMemory(memory, reason, atTick);
    return { action: "invalidate", memory: next, reason };
  }

  const remainingRegimes = memory.scope.regimes.filter((r) => r !== newRegime);
  if (memory.scope.regimes.includes(newRegime) && remainingRegimes.length === 0) {
    const { memory: next } = invalidateMemory(memory, reason, atTick);
    return { action: "invalidate", memory: next, reason };
  }

  const narrowed: MemoryRecord = {
    ...memory,
    scope: { ...memory.scope, regimes: remainingRegimes },
    reliability: Math.max(0, memory.reliability * 0.8),
    updatedAtTick: atTick,
    version: memory.version + 1,
  };
  return { action: "narrow_scope", memory: narrowed, reason };
}
