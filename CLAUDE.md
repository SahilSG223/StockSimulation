# CLAUDE.md

AI assistant instructions for this repo. Humans start with `README.md`.

**Stock Simulation**: governed-memory stress lab for autonomous agents in a
simulated market. Product thesis and roadmap: `docs/PROJECT_SPEC.md`.

## Rules

Prescriptive rules live in `.claude/rules/`. Read the file for the area you are
changing before you change it.

| File            | Covers                                          |
| --------------- | ----------------------------------------------- |
| `quality.md`    | Simplicity, self-audit, commits, `make check`   |
| `typescript.md` | TS style that keeps the codebase navigable      |
| `contracts.md`  | Zod at boundaries; LLM vs API schemas           |
| `simulation.md` | Deterministic engine vs LLM decisions           |
| `memory.md`     | Governed memory retrieval, isolation, lifecycle |
| `agents.md`     | Agent runtime, prompts, structured decisions    |
| `secrets.md`    | What must never enter git or shared docs        |

## Architecture (target)

| Area              | Owns                                      | Must not own                     |
| ----------------- | ----------------------------------------- | -------------------------------- |
| `src/simulation/` | Prices, orders, portfolios, events, clock | LLM calls, memory embeddings     |
| `src/market/`     | Observations, features, regimes           | Agent strategy logic             |
| `src/agents/`     | Decision cycle, archetypes, prompts       | Authoritative P&L / fills        |
| `src/memory/`     | Experiences, semantic memory, governance  | Raw price time-series as vectors |
| `src/evaluation/` | Scenarios, baselines, metrics, reports    | Live trading UI                  |
| `src/database/`   | Mongo schemas, indexes, repositories      | Business policy                  |
| `app/` (later)    | Dashboard / observability                 | Simulation truth                 |

Dependency direction: apps → agents/evaluation → memory/market → simulation/database.

## Non-negotiables

Each rule is paired with the gate that enforces it.

| Rule                                              | Gate                                 |
| ------------------------------------------------- | ------------------------------------ |
| `make check` passes before every commit           | `.githooks/pre-commit` + CI          |
| One package manager: **pnpm only**                | CI + docs; `packageManager` field    |
| Simulation is source of truth for money & fills   | Review + sim unit tests              |
| Zod (or equivalent) validates agent I/O           | Review + schema tests                |
| Agent memories filtered by `agentId` in the query | Review + memory tests                |
| No secrets / employer internals in git            | `.gitignore` + `secrets.md` + review |

## Meta

When corrected about how work should be done here, update these repo files rather
than relying on personal assistant memory.
