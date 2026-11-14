import type {
  AgentId,
  CreateExperienceInput,
  ExperienceId,
  ExperienceQuery,
  ExperienceRecord,
} from "./types.js";

/**
 * In-memory experience store. Swap for Mongo later without changing call sites.
 * Isolation is enforced in the query — never by prompting an LLM.
 */
export class ExperienceStore {
  private readonly byId = new Map<ExperienceId, ExperienceRecord>();

  create(input: CreateExperienceInput): ExperienceRecord {
    const id = input.id ?? crypto.randomUUID();
    if (this.byId.has(id)) {
      throw new Error(`experience already exists: ${id}`);
    }
    const record: ExperienceRecord = {
      id,
      agentId: input.agentId,
      simulationId: input.simulationId,
      tick: input.tick,
      market: {
        regime: input.market.regime,
        prices: { ...input.market.prices },
        eventIds: [...input.market.eventIds],
        eventTypes: [...input.market.eventTypes],
      },
      decision: {
        reasoning: input.decision.reasoning,
        ...(input.decision.strategy !== undefined
          ? { strategy: input.decision.strategy }
          : {}),
        ...(input.decision.confidence !== undefined
          ? { confidence: input.decision.confidence }
          : {}),
        memoryReferences: [...input.decision.memoryReferences],
        orders: input.decision.orders.map((o) => ({ ...o })),
      },
      outcome: {
        fills: input.outcome.fills.map((f) => ({ ...f })),
        rejections: input.outcome.rejections.map((r) => ({ ...r })),
        cashDelta: input.outcome.cashDelta,
        ...(input.outcome.realizedPnlDelta !== undefined
          ? { realizedPnlDelta: input.outcome.realizedPnlDelta }
          : {}),
        summary: input.outcome.summary,
      },
      scope: {
        symbols: [...input.scope.symbols],
        sectors: [...input.scope.sectors],
        regimes: [...input.scope.regimes],
        eventTypes: [...input.scope.eventTypes],
      },
      createdAtTick: input.tick,
    };
    this.byId.set(id, record);
    return record;
  }

  get(id: ExperienceId): ExperienceRecord | undefined {
    return this.byId.get(id);
  }

  getMany(ids: readonly ExperienceId[]): ExperienceRecord[] {
    const out: ExperienceRecord[] = [];
    for (const id of ids) {
      const hit = this.byId.get(id);
      if (hit) out.push(hit);
    }
    return out;
  }

  /** Always filter by agentId at the store layer. */
  listForAgent(agentId: AgentId): ExperienceRecord[] {
    return this.query({ agentId });
  }

  listForAgentInSimulation(agentId: AgentId, simulationId: string): ExperienceRecord[] {
    return this.query({ agentId, simulationId });
  }

  /**
   * Scoped query. `agentId` is required so callers cannot accidentally
   * cross agent boundaries.
   */
  query(q: ExperienceQuery): ExperienceRecord[] {
    let rows = [...this.byId.values()].filter((e) => e.agentId === q.agentId);

    if (q.simulationId !== undefined) {
      rows = rows.filter((e) => e.simulationId === q.simulationId);
    }
    if (q.fromTick !== undefined) {
      rows = rows.filter((e) => e.tick >= q.fromTick!);
    }
    if (q.toTick !== undefined) {
      rows = rows.filter((e) => e.tick <= q.toTick!);
    }
    if (q.symbols && q.symbols.length > 0) {
      const want = new Set(q.symbols);
      rows = rows.filter((e) => e.scope.symbols.some((s) => want.has(s)));
    }
    if (q.sectors && q.sectors.length > 0) {
      const want = new Set(q.sectors);
      rows = rows.filter((e) => e.scope.sectors.some((s) => want.has(s)));
    }
    if (q.regimes && q.regimes.length > 0) {
      const want = new Set(q.regimes);
      rows = rows.filter((e) => e.scope.regimes.some((r) => want.has(r)));
    }
    if (q.eventTypes && q.eventTypes.length > 0) {
      const want = new Set(q.eventTypes);
      rows = rows.filter((e) => e.scope.eventTypes.some((t) => want.has(t)));
    }

    rows.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));

    if (q.limit !== undefined && q.limit >= 0) {
      return rows.slice(-q.limit);
    }
    return rows;
  }

  size(): number {
    return this.byId.size;
  }
}
