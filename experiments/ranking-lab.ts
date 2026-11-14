/**
 * Local ranking lab for hyperparameter sweeps.
 * Mirrors governance formulas without importing the other PR's tree.
 */

export type LabMemory = {
  id: string;
  agentId: string;
  content: string;
  reliability: number;
  updatedAtTick: number;
  status: "active" | "invalidated";
  scope: {
    sectors: string[];
    regimes: string[];
    eventTypes: string[];
    assets: string[];
  };
};

export type LabContext = {
  agentId: string;
  tick: number;
  regimeEstimate?: string;
  sectors?: string[];
  assets?: string[];
  eventTypes?: string[];
};

export type Weights = {
  semantic: number;
  contextual: number;
  temporal: number;
  reliability: number;
  lambda: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  semantic: 1,
  contextual: 1,
  temporal: 1,
  reliability: 1,
  lambda: 0.02,
};

function temporalRelevance(ageTicks: number, lambda: number): number {
  return Math.exp(-lambda * Math.max(0, ageTicks));
}

function contextualApplicability(memory: LabMemory, ctx: LabContext): number {
  let hits = 0;
  let checks = 0;
  const bump = (ok: boolean) => {
    checks += 1;
    if (ok) hits += 1;
  };
  if (ctx.regimeEstimate && memory.scope.regimes.length > 0) {
    bump(memory.scope.regimes.includes(ctx.regimeEstimate));
  }
  if (ctx.sectors && ctx.sectors.length > 0 && memory.scope.sectors.length > 0) {
    bump(ctx.sectors.some((s) => memory.scope.sectors.includes(s)));
  }
  if (ctx.assets && ctx.assets.length > 0 && memory.scope.assets.length > 0) {
    bump(ctx.assets.some((a) => memory.scope.assets.includes(a)));
  }
  if (ctx.eventTypes && ctx.eventTypes.length > 0 && memory.scope.eventTypes.length > 0) {
    bump(ctx.eventTypes.some((e) => memory.scope.eventTypes.includes(e)));
  }
  if (checks === 0) return 0.5;
  return hits / checks;
}

function roughSemanticSimilarity(content: string, query: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const a = tok(content);
  const b = tok(query);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

export function rankLabMemories(args: {
  memories: LabMemory[];
  ctx: LabContext;
  query: string;
  weights: Weights;
}): { id: string; score: number }[] {
  const w = args.weights;
  return args.memories
    .filter((m) => m.agentId === args.ctx.agentId && m.status === "active")
    .map((memory) => {
      const semantic = roughSemanticSimilarity(memory.content, args.query);
      const contextual = contextualApplicability(memory, args.ctx);
      const temporal = temporalRelevance(args.ctx.tick - memory.updatedAtTick, w.lambda);
      const score =
        Math.pow(Math.max(1e-6, semantic), w.semantic) *
        Math.pow(Math.max(1e-6, contextual), w.contextual) *
        Math.pow(Math.max(1e-6, temporal), w.temporal) *
        Math.pow(Math.max(1e-6, memory.reliability), w.reliability);
      return { id: memory.id, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Synthetic corpus: stale bull lesson vs fresh bear lesson vs wrong-agent noise. */
export function buildSyntheticCorpus(): {
  memories: LabMemory[];
  cases: { name: string; query: string; ctx: LabContext; idealTopId: string }[];
} {
  const memories: LabMemory[] = [
    {
      id: "stale-bull-semi",
      agentId: "a1",
      content: "buy semiconductors on positive ai demand news in bull markets",
      reliability: 0.85,
      updatedAtTick: 5,
      status: "active",
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bull"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
    },
    {
      id: "fresh-bear-caution",
      agentId: "a1",
      content: "reduce semiconductor exposure during bear and high volatility",
      reliability: 0.7,
      updatedAtTick: 60,
      status: "active",
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bear", "high_vol"],
        eventTypes: [],
        assets: ["SEMI"],
      },
    },
    {
      id: "wrong-agent",
      agentId: "a2",
      content: "buy semiconductors on positive ai demand news in bull markets",
      reliability: 0.99,
      updatedAtTick: 90,
      status: "active",
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bear"],
        eventTypes: ["positive_ai_demand"],
        assets: ["SEMI"],
      },
    },
    {
      id: "invalidated",
      agentId: "a1",
      content: "always buy semiconductors",
      reliability: 0.9,
      updatedAtTick: 90,
      status: "invalidated",
      scope: {
        sectors: ["Semiconductors"],
        regimes: ["bear"],
        eventTypes: [],
        assets: ["SEMI"],
      },
    },
  ];

  const cases = [
    {
      name: "bear_after_shock",
      query: "semiconductor ai demand position",
      ctx: {
        agentId: "a1",
        tick: 75,
        regimeEstimate: "bear",
        sectors: ["Semiconductors"],
        assets: ["SEMI"],
        eventTypes: ["positive_ai_demand"],
      },
      idealTopId: "fresh-bear-caution",
    },
    {
      name: "bull_ai_news",
      query: "buy semiconductors ai demand",
      ctx: {
        agentId: "a1",
        tick: 20,
        regimeEstimate: "bull",
        sectors: ["Semiconductors"],
        assets: ["SEMI"],
        eventTypes: ["positive_ai_demand"],
      },
      idealTopId: "stale-bull-semi",
    },
  ];

  return { memories, cases };
}

export function scoreWeights(weights: Weights): {
  accuracy: number;
  isolationOk: boolean;
  details: { case: string; topId: string; ideal: string; ok: boolean }[];
} {
  const { memories, cases } = buildSyntheticCorpus();
  const details = cases.map((c) => {
    const ranked = rankLabMemories({ memories, ctx: c.ctx, query: c.query, weights });
    const topId = ranked[0]?.id ?? "";
    return { case: c.name, topId, ideal: c.idealTopId, ok: topId === c.idealTopId };
  });
  const isolation = rankLabMemories({
    memories,
    ctx: { agentId: "a1", tick: 100, regimeEstimate: "bear", sectors: ["Semiconductors"] },
    query: "semiconductors",
    weights,
  });
  const isolationOk = isolation.every((r) => r.id !== "wrong-agent" && r.id !== "invalidated");
  const accuracy = details.filter((d) => d.ok).length / details.length;
  return { accuracy, isolationOk, details };
}
