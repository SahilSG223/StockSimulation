# Quality

## The one question

Does this complexity earn its keep? Every wrapper, helper, config object, and layer
must justify itself. Used zero times: delete. Used once: inline.

- Smallest change that solves the problem. No speculative helpers or "future" hooks.
- One concern per commit/PR: feature, bugfix, or refactor — not a mix.
- Fix root causes. No workarounds without understanding why something failed.
- Intentional quick experiments are fine under `src/**/experiments/` (or similar),
  but they don't get imported by real paths until cleaned up.

## Gate

- **Pre-commit** (`make precommit`): typecheck + tests only — must stay fast.
  Skip with `SKIP_HOOKS=1` if you're mid-experiment (fix before push).
- **CI / `make check`**: typecheck + tests + lint. Timeout 5 min. No prettier
  over markdown docs (format `src/`/`tests/` with `make fmt` when you want).

Install the hook once with `make setup`. A rule that isn't enforced by a gate or
review is aspirational — if it keeps getting broken, add a gate.

## Self-audit (only when asked)

1. Dead code: unused functions, fields, imports, parameters, impossible branches
2. Unnecessary abstraction: pass-through wrappers, one-use helpers
3. Duplicated data: don't store what can be computed
4. Defensive theater: no checks for states the types already rule out
5. Boundary leaks: simulation importing LLM/memory, or agents mutating portfolios
6. Read the diff cold — would a strict reviewer say "clean up slop"?

## Commits

Short, lowercase, imperative: `add seeded price generator`, `fix order fill edge`.
No essay commit messages.

## Rules come from incidents

When something goes wrong, add the rule here with the incident as its example.
Keep rule tone as strict as reality — no ALL-CAPS for things that get waved through.
