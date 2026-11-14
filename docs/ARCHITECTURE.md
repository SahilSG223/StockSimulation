# Architecture

High-level map. Detailed product requirements live in `PROJECT_SPEC.md`.

## Core principle

**Deterministic environment, autonomous decisions.** The simulation owns money,
fills, and market state. Agents own interpretation, memory use, and proposed
actions. Evaluation owns fair comparisons across memory architectures.

```
Observation + retrieved memories
        │
        ▼
   Agent runtime (LLM + Zod decision)
        │
        ▼
   Simulation engine (orders → fills → portfolios)
        │
        ▼
   Experience + memory governance updates
        │
        ▼
   Evaluation / observability
```

## Information categories

Do not mix these:

1. **Structured market data** — prices, volume, books → ordinary queries
2. **Features** — returns, vol, momentum → deterministic code
3. **Experiences** — decisions + outcomes → experience store
4. **Semantic memory** — lessons → vector search + metadata filters

## Components (build order)

1. Simulation engine (seeded prices, events, execution, portfolios)
2. Market observation / feature pipeline
3. Agent runtime + decision schemas
4. Memory store + retrieval + governance
5. Evaluation baselines & scenarios
6. Frontend / observability (memory influence on decisions) — see `UI_PLAYBOOK.md`

**Chaos Director** (seeded shock planner) sits in simulation/evaluation — it
schedules events; it is not an agent. Agents still only submit orders.

Suggested module layout under `src/` matches `PROJECT_SPEC.md` §10.

## MongoDB (intent)

Atlas holds persistent state and memory. Vector Search for semantic content only.
Enforce `agentId` + status filters in queries. Keep financial execution writes
separate from memory consolidation writes where practical; experiment runs stay
isolated by `simulationId` / `experimentId`.

## Reproducibility

Every run records seed, configs, event sequence, model/prompt versions, memory
config, and simulation version so baselines A/B/C are comparable.
