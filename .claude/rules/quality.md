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

`make check` runs format, lint, typecheck, and tests. The pre-commit hook and CI
run the same suite. Install the hook once with `make setup`.

A rule that isn't enforced by `make check` or review is aspirational — if a rule
keeps getting broken, add a gate for it.

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
