# Governed Memory

Memory is a **product subsystem**, not a logging dump.

## Separate categories

| Category                     | Storage                                   |
| ---------------------------- | ----------------------------------------- |
| Structured market data       | Ordinary Mongo queries / time-series docs |
| Predictive features          | Deterministic code                        |
| Agent experiences (episodic) | Experience records                        |
| Semantic / strategic lessons | Vector search **plus** metadata filters   |

Do **not** embed raw prices just to use Vector Search. Vectors retrieve
contextual lessons; they do not replace structured queries.

## Isolation

Private memories are scoped to `agentId`. Enforce ownership **in the database
query** (`{ agentId, status: "active", ... }`), never by asking the LLM to
"ignore other agents' memories."

## Reliability concepts (keep separate)

- **Confidence** — how strongly evidence supports the lesson
- **Contextual relevance** — applicability to the _current_ situation
- **Reliability** — how well the lesson held up against later outcomes

Do not collapse these into one opaque score without documenting the formula.

## Lifecycle

Support explicit states (`active`, `under_review`, `superseded`, `invalidated`,
`expired`). Lifecycle changes are auditable (reason, evidence, timestamp,
actor). Prefer narrowing scope over deleting when a lesson fails in a new regime.

## Retrieval pipeline (intent)

1. Decision context → ownership + metadata filters → semantic candidates
2. Temporal + contextual ranking → return bounded set with provenance

Vector similarity alone is insufficient.
