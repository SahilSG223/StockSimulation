import type { ExperienceRecord } from "../experiences/types.js";
import type { UpsertMemoryInput } from "./memory-index.js";
import type { EmbeddedMemory } from "./types.js";

/** Satisfied by both `MemoryIndex` and `MongoMemoryIndex` — only `upsert` is used here. */
type MemoryWriter = {
  upsert(input: UpsertMemoryInput): Promise<EmbeddedMemory>;
};

/**
 * Naive consolidation: turn one episodic experience into a semantic lesson string,
 * embed it, and upsert into the vector index. Governance can later invalidate it.
 */
export async function consolidateExperienceToMemory(args: {
  index: MemoryWriter;
  experience: ExperienceRecord;
  /** Override auto-generated lesson text. */
  lesson?: string;
}): Promise<EmbeddedMemory> {
  const { experience: exp, index } = args;
  const lesson =
    args.lesson ??
    [
      exp.market.regime ? `In regime ${exp.market.regime}` : null,
      exp.decision.strategy ? `using ${exp.decision.strategy}` : null,
      `agent decided: ${exp.decision.reasoning}`,
      `outcome: ${exp.outcome.summary}`,
      exp.scope.sectors.length ? `sectors: ${exp.scope.sectors.join(", ")}` : null,
      exp.scope.symbols.length ? `symbols: ${exp.scope.symbols.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(". ");

  return index.upsert({
    agentId: exp.agentId,
    content: lesson,
    updatedAtTick: exp.tick,
    reliability: 0.55,
    scope: {
      sectors: [...exp.scope.sectors],
      regimes: [...exp.scope.regimes],
      eventTypes: [...exp.scope.eventTypes],
      assets: [...exp.scope.symbols],
    },
  });
}
