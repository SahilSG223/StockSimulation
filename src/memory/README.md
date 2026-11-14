# Persistent experiences and vector retrieval

Everything here runs on the shared stack: `getDb()` (`src/database/client.ts`),
the collection names in `COLLECTIONS`, `OpenAIEmbedder`, and the governance
types and ranker in this package. There is no second Mongo client, embedder, or
HTTP stack.

## Setup

Set `MONGODB_URI`, `OPENAI_API_KEY`, and optionally `AGENT_MODEL` /
`EMBEDDING_MODEL` (defaults in `src/config.ts`) in local `.env`. No URI or
credentials are printed.

| Command | What it does |
| --- | --- |
| `pnpm ensure-indexes` | Regular indexes plus the `experience_vectors` vector search index |
| `pnpm memory:check` | Connection, regular indexes, one owner-scoped read. No LLM or embedding calls |
| `pnpm memory:prepare` | Indexes, waits until the vector index is queryable, verifies a scoped vector query (one embedding call) |
| `pnpm agents` | The LLM agent run (see below) |

## Experiences

`MongoExperienceStore(db)` writes `COLLECTIONS.experiences` with the experience
id as `_id`. Every read includes `agentId` in the database filter, including
direct lookups: `store.get(id, agentId)` and `store.getMany(ids, agentId)`. The
in-memory `ExperienceStore` has the same owner-scoped API for offline tests.
`recordTradeExperience` accepts either store; await it with MongoDB.

```ts
import { getDb } from "../database/client.js";
import { MongoExperienceStore } from "./index.js";

const store = new MongoExperienceStore(await getDb());
const recent = await store.query({ agentId: "momentum-demo", limit: 10 });
```

## Experience vectors

`MongoVectorMemory(db, embedder)` stores one embedded narrative per experience
in `COLLECTIONS.experienceVectors` (`experience_vectors`). The narrative
describes rationale, strategy, actions, public event types, fills/rejections
and the immediate outcome; raw prices and balances are never embedded.

Indexes are defined in `src/database/indexes.ts` and created by
`pnpm ensure-indexes` / `pnpm memory:prepare`, never ad hoc at runtime:

- unique `(agentId, id)`, so backfill is idempotent;
- Atlas vector search index `experience_similarity` (cosine) with filter fields
  `agentId`, `status`, `embeddingModel`, `contentVersion`, `simulationId`, `tick`.

Each document records the embedding model, decision model, and narrative
version (`experience-v1`). Retrieval filters on the configured embedding model,
so vectors from different models are never compared.

### Lifecycle

Vector documents use the same statuses as governed memories: `active`,
`under_review`, `superseded`, `invalidated`, `expired`, plus an optional
`invalidationReason`. Only `active` vectors are retrieved. Backfill uses
`$setOnInsert`, so it never reactivates or overwrites an existing vector.

### Retrieval and ranking

1. `$vectorSearch` prefilters on owner, `status: "active"`, embedding model,
   narrative version, and "not from the current tick or later of this run".
   It considers 400 candidates and returns 20.
2. Results are re-checked against those rules (fail closed), then ranked with
   `rankWithEmbeddings`, the same ranker as governed memories. Its components
   stay separate on each result: `semanticSimilarity`, `contextualApplicability`
   (asset and event-type overlap), `temporalRelevance`, and `reliability`.
   `retrievalScore` is that ranker's documented composite, not a probability.
3. The top five go to the decision model as USER data.

`reliability` starts at a neutral 0.5 (`DEFAULT_EXPERIENCE_RELIABILITY`): an
experience existing is not evidence that it held up. Tick ages are only
comparable within one run; the ranker clamps negative ages to zero, so a memory
from another run is not penalised for age.

## The agent run (`pnpm agents`)

1. Writes one run record (seed, market config and regime params, event
   schedule, `SIMULATION_VERSION`, models, prompt version, memory config) to
   `COLLECTIONS.simulations` and logs it.
2. Gives each agent a private id: `<archetype>-<run label>`. The label defaults
   to a run-scoped suffix, so runs never share history by accident. Set
   `AGENT_RUN_LABEL` to reuse the same agents' memory across runs on purpose.
3. Backfills experience vectors for that id only: its latest 200 experiences,
   embedding only those without a vector, in one batch.
4. Before each decision, retrieves **governed lessons**:
   `retrieveForDecision` over `MongoMemoryIndex` (`memories` collection). Only
   `active` lessons are returned, ranked by `rankWithEmbeddings` (semantic,
   contextual, temporal, reliability). This is the memory the A/B/C evaluation
   measures, so invalidating or narrowing a lesson changes what agents see.
5. After the decision, records the engine outcome and embeds the experience
   (episodic layer). Experiences whose orders filled are consolidated into a
   lesson; holds and rejections stay episodic. Lessons are tagged with the
   inferred `regimeEstimate` from `MarketFeed`, never the engine's true regime.
6. Scores every lesson the decision cited (`scoreLessonOutcome`, same rule as
   `EvalMemoryStore.recordOutcome`): a win reinforces reliability, a loss
   decays it, and consecutive losses while a fast observed-only regime label
   (`quickRegimeLabel` — the calibrated estimator needs 21 prices, more than a
   short run has) mismatches the lesson's learned regime invalidate it with a
   reason (`invalidationReason`, `MongoMemoryIndex.invalidate`).
7. Logs one `llm_call` line per model call (provider, model, latency, token
   usage, outcome).

The experience vector search above (`MongoVectorMemory.retrieve`) is not used at
decision time; it stays available for episodic search and is verified by
`pnpm memory:prepare`.

On failure it prints a sanitized error with the run id, agent and tick. There
is no baseline fallback and no automatic retry: orders submitted earlier in the
same tick may already have filled, so inspect the run before retrying.

## Consistency

Atlas indexes asynchronously, so a just-saved vector may not be returned
immediately. Retrieval failures stop the run; they never become empty results
or a client-side similarity fallback. Execution and memory writes are separate:
the experience is persisted before its vector, so a later run can backfill a
missing vector without repeating the trade.
