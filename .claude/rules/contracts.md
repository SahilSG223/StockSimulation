# Contracts (Zod)

## Boundaries get schemas

Validate at every trust boundary:

- Agent observation → agent
- Agent decision → simulation
- HTTP request/response (when API exists)
- Memory documents written/read from Mongo

Define schemas in dedicated modules (e.g. `decision-schema.ts`), not inline in
handlers. Routes and runtimes import schemas; they don't invent shapes ad hoc.

## LLM schemas vs API schemas

Structured-output schemas optimize for model compliance. Client API schemas
optimize for stable versioning. Split when constraints diverge — don't force one
schema to serve both poorly.

## Optional vs null

Pick one convention for "missing" fields and stick to it. Prefer **optional
(absent)** over `null` unless Mongo/API already requires nulls.

## Fail closed

Invalid agent decisions are rejected before they touch the engine. Invalid
memory writes do not silently drop — surface the error to the caller/logs.
