# Hackathon Execution Plan

Teammates: follow this, not a re-read of the full spec. Spec detail lives in
`PROJECT_SPEC.md`, `ARCHITECTURE.md`, `EVALUATION.md`.

## Goal / thesis

We stress-test whether autonomous agents can use **governed persistent memory**
to improve decisions without clinging to stale or misleading lessons. The market
sim is the lab — the product is memory governance + evaluation that shows it
changes behavior under shocks and regime shifts.

## Workstreams (4 people)

Five concerns, four people: **Eval + Demo** is one seat. Swap names in the
Owner column if needed — keep the path ownership.

| Stream | Owns | Owner | Day-1 deliverable |
| --- | --- | --- | --- |
| **Memory** | Experiences, embeddings, retrieval, governance, `agentId` isolation → `src/memory/` | **Daniel** | Experience write + scoped read; then governance (stale/contradiction) — core thesis |
| **Simulation** | Keep Phase 1 stable; market observations/features → `src/simulation/`, `src/market/` | **Person B** | Don’t rewrite engine; extend `observe()` / features only as agents need |
| **Agents** | Archetypes, decision cycle, Zod I/O, LLM calls → `src/agents/` | **Person C** | Zod decision schema + 1 archetype submitting orders into sim (no memory first) |
| **Eval + Frontend/Demo** | Baselines A/B/C, metrics **and the UI** (live sim, portfolios, “which memories fired”) → `src/evaluation/` + `app/` | **Person D** | Scenario/seed recording + stub dashboard or CLI that shows decision + memory refs |

**Yes — frontend is Person D.** “Demo” means the observability UI (`app/`), not a separate fifth owner.

Replace Person B/C/D with real names in standup. Stay in your `src/` lane.

## File ownership (`src/`)

Stay in your lane so merges stay boring.

| Path              | Primary stream                  | Notes                                                    |
| ----------------- | ------------------------------- | -------------------------------------------------------- |
| `src/simulation/` | Simulation                      | Prices, order book, execution, portfolios, events, clock |
| `src/market/`     | Simulation (+ Agents consumers) | Observations / features; no strategy logic               |
| `src/agents/`     | Agents                          | Runtime, archetypes, prompts, decision schemas           |
| `src/memory/`     | Memory                          | Experiences, semantic store, governance, retrieval       |
| `src/evaluation/` | Eval + Demo                     | Scenarios, baselines, metrics, reports                   |
| `src/database/`   | Shared (coordinate)             | Schemas/repos only — no business policy                  |
| `src/api/`        | Eval + Demo / later             | Thin; do not invent sim truth here                       |
| `app/`            | Eval + Demo                     | Observability UI; never authoritative P&L                |

**Dependency direction:** `app` → agents/evaluation → memory/market →
simulation/database.

**Contracts:** Zod schemas for agent observation/decision live under agents (or
a shared schemas module both sides import). Simulation validates inbound orders;
it does not call the LLM.

---

## Phased milestones (PROJECT_SPEC §11)

Hackathon-sized acceptance checks — ship the smallest thing that proves the
phase, then move on. Prefer end-to-end vertical slices over perfect subsystems.

### Phase 1 — Deterministic simulation (do this first)

- [x] Seeded PRNG price path for a small asset universe (same seed → same
      trajectory)
- [x] Simulation clock advances ticks; regimes/params configurable
- [x] At least one scheduled shock/event with **actual** effect + **public**
      info for agents
- [x] Order submit → validate → fill/reject → portfolio/cash update
- [x] Authoritative P&L from engine only (unit tests for fill + cash)

**Status:** landed on `feat/phase1-simulation` (`src/simulation/`, 19 tests).
Merge to `main`, then Agents/Memory start against exported types.

### Phase 2 — Autonomous agents

- [ ] 2–3 archetypes as **starting configs** (e.g. momentum, conservative,
      adaptive)
- [ ] Structured observation in → Zod-validated decision out (orders +
      reasoning)
- [ ] Agent submits orders only through sim interface; never mutates cash
- [ ] Invalid decisions fail closed before touching the engine
- [ ] Decision cycle stub works with **no memory** (baseline A ready)

**Done when:** agents trade for a fixed scenario; decisions logged; sim remains
source of truth for fills.

### Phase 3 — Persistent memory

- [ ] Episodic experiences recorded after fills (decision + outcome)
- [ ] Semantic lessons stored with embeddings + metadata (not raw prices as
      vectors)
- [ ] Retrieval filtered by `agentId` **in the query**
- [ ] Decision cycle can attach `memoryReferences` to decisions

**Done when:** same agent over two runs shows retrieved experiences; another
agent cannot see them.

### Phase 4 — Memory governance

- [ ] Lifecycle states: at least `active` / `invalidated` (or `superseded`) with
      audit reason
- [ ] Temporal / contextual ranking beyond bare similarity
- [ ] Contradiction or regime-mismatch path that lowers reliability or narrows
      scope
- [ ] Demo-able: after a shock, a stale lesson is deprioritized or invalidated

**Done when:** one scripted shock run shows memory status change + different
next decision vs “always trust top-k similarity.”

### Phase 5 — Evaluation

- [ ] Baselines **A** (no memory), **B** (unrestricted), **C** (governed) on
      identical seed + events
- [ ] At least scenarios: stable, shock, regime reversal (see `EVALUATION.md`)
- [ ] Metrics: one financial + one adaptation + one memory-quality signal
- [ ] Experiment record: seed, configs, model/prompt versions, memory config,
      sim version

**Done when:** a report (markdown/JSON) compares A/B/C for one shock scenario
without hand-editing numbers.

### Phase 6 — Demo

- [ ] Dashboard: market + portfolio + recent trades
- [ ] Decision panel: reasoning + **which memories** influenced the action
- [ ] Narrated path: learn → shock → invalidate/deprioritize → behavior change

**Done when:** a 3–5 minute walkthrough tells that story live.

---

## Day / phase checklist

Use as a standup board. Check boxes; don’t invent parallel “phase 0” work that
blocks Phase 1.

### Day 1 — Phase 1 locked

- [ ] Assign workstream owners (table above)
- [ ] `make setup` + `make check` green for everyone
- [ ] Simulation: seed, clock, prices, one event, orders/portfolios
- [ ] Agree on shared types for `Order` / `Tick` / `Asset` (sim owns; others
      import)
- [ ] No LLM keys in git; copy `.env.example` only

### Day 2 — Agents + memory skeleton

- [ ] Phase 1 acceptance still passes (regression)
- [ ] Agents: Zod decision + one archetype trading into sim
- [ ] Memory: experience write + `agentId`-scoped read (even if ranking is
      naive)
- [ ] Evaluation: sketch scenario config + seed recording
- [ ] Frontend: wire to sim state or mock if sim API not ready — don’t block
      Phase 1

### Day 3 — Governance + eval + demo polish

- [ ] Shock scenario end-to-end with baselines A vs C (B if time)
- [ ] Governance lifecycle visible in logs or UI
- [ ] Demo script rehearsed; screenshots/backup video if live LLM flakes
- [ ] `make check` green; no secrets in the tree

---

## Explicit non-goals

Do **not** spend hackathon time on:

- Real brokerage / real-money trading / investment advice
- Complete market microstructure or HFT
- General-purpose forecasting models
- Heavy multi-agent orchestration frameworks
- Terraform / Helm / multi-service deploy (see `ENGINEERING.md`)

Ship a thin vertical slice that proves governed memory under stress.

## Secrets & confidentiality

- Never commit `.env`, API keys, Mongo URIs with credentials, or key material.
- Never paste employer / lab internals into this repo (see
  [`.claude/rules/secrets.md`](../.claude/rules/secrets.md) and
  [`ENGINEERING.md`](./ENGINEERING.md)).
- Share keys out-of-band. If something leaks, rotate — don’t just delete the
  file.

## Working agreements

- **pnpm only** (`make setup` once so hooks don’t re-download pnpm via npx)
- **Pre-commit** = typecheck + test (`make precommit`). Full lint = CI /
  `make check`. Escape hatch: `SKIP_HOOKS=1 git commit`
- Simulation owns money & fills; agents propose; memory never replaces price
  queries with embeddings
- Prefer one concern per PR; update `.claude/rules/` when the team corrects
  process
