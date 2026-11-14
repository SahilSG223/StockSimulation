# TypeScript

- Prefer explicit domain types over `any` / loose `Record<string, unknown>` at
  boundaries. Narrow at the edge; keep the core typed.
- Prefer `unknown` + Zod parse over unchecked casts.
- Avoid deep barrel files that re-export the world; import from the owning module.
- Prefer options objects over long positional parameter lists.
- Prefer `as const` + unions / enums for closed sets (regimes, memory status,
  order sides) instead of magic strings scattered across files.
- Keep modules focused: one concern per file is a guideline, not a religion —
  don't explode a 40-line cohesive module into six files.
