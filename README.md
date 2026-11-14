# Stock Simulation — Governed Memory Stress Lab

Hackathon project: stress-test whether autonomous AI agents can use **persistent
memory** to improve decisions over time **without** becoming dependent on
outdated, irrelevant, or misleading information.

The simulated financial market is the **environment**, not the product. The
product is governed memory + the evaluation framework that measures it.

Full product/engineering spec: [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md).

## Quick start

```bash
make setup          # hooks + pnpm install
cp .env.example .env   # fill locally; never commit .env
make check          # format + lint + typecheck + tests (same as CI)
```

Requires **Node 20+** and **pnpm** (pinned via `packageManager` in `package.json`).
Do not use npm or yarn in this repo.

## Repo map

| Path                       | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `src/`                     | Simulation, agents, memory, evaluation, API |
| `tests/`                   | Unit + integration tests                    |
| `docs/`                    | Human product/architecture docs             |
| `CLAUDE.md` / `AGENTS.md`  | AI assistant index (team-visible)           |
| `.claude/rules/`           | Prescriptive engineering rules              |
| `.github/workflows/ci.yml` | PR quality gates                            |

## Team secrets (important)

- API keys, MongoDB URIs, and credentials live in **local `.env`** or a shared
  password manager — **never in git**, issues, or PR descriptions.
- `.env.example` lists variable **names** only.
- Do not paste Skye / Sginull Labs internal URLs, Helm values, service accounts,
  or proprietary agent specs into this repo. Principles travel; company secrets
  and product contracts do not.

## Working agreement

1. One concern per PR.
2. `make check` must pass before merge (CI enforces the same suite).
3. When someone corrects “how we work,” update `.claude/rules/` or docs in the
   same PR — not personal assistant memory.
