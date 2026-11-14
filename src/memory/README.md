# Persistent experiences and vector retrieval

`pnpm agents` now connects to MongoDB using `MONGODB_URI` from local `.env`.
`MONGODB_DB_NAME` selects the database, defaulting to `stock_simulation`.
Records are stored in the `experiences` collection. No URI or credentials are
printed. Run `pnpm memory:check` to verify connection, index setup, and a scoped
read without making LLM calls or inserting synthetic experience records.

Each completed agent cycle stores the observation, decision, engine fills or
rejections, authoritative cash movement, and realized P&L delta. Holds are also
recorded. Runs receive distinct simulation ids. The runner does not attach hidden
regime labels to the agent's decision context.

```ts
import { connectMongoMemory } from "./index.js";

const memory = await connectMongoMemory();
try {
  const recent = await memory.store.query({ agentId: "momentum", limit: 10 });
  // Optionally filter by simulationId, tick range, symbols, sectors, regimes,
  // or eventTypes. Reads and writes are asynchronous.
  console.log(recent);
} finally {
  await memory.close();
}
```

Every Mongo read includes `agentId` in its database filter. Direct id lookups
require an owner: `store.get(id, agentId)` and `store.getMany(ids, agentId)`.
The collection has a unique id index plus ownership/time indexes. Queries with
a limit select the latest matching records, returning them in chronological
order; `limit: 0` returns no records. Zod validates writes and read documents;
invalid records and persistence failures surface to callers.

The in-memory `ExperienceStore` remains for offline tests and deterministic
evaluation. Its existing synchronous API is retained. `recordTradeExperience`
accepts either store; await it when using MongoDB. The runner never falls back
to process-local memory when MongoDB is unavailable.

## Embedding and decision cycle

Set `EMBEDDING_MODEL`, `AGENT_MODEL`, and `OPENAI_API_KEY` in local `.env`.
`EMBEDDING_MODEL` produces vectors through the OpenAI embeddings API;
`AGENT_MODEL` interprets retrieved experiences and makes trading decisions.
They serve different roles and need not be the same model family.

`pnpm memory:prepare` checks the embedding API, creates the Vector Search index
if necessary, waits up to a minute for readiness, and verifies a scoped vector
query. It makes two embedding requests and no decision-model calls. Your MongoDB
deployment must support Vector Search and grant search-index creation permissions.
If the index is still building, retry after it becomes queryable. Connectivity
alone (`pnpm memory:check`) does not verify Vector Search support.

`pnpm agents` performs the following:

1. Initialize a vector space using the configured model's actual dimensions.
2. Backfill existing experiences for each of the seven agent ids, skipping ids
   already embedded in this space. Old records without model provenance are
   marked `legacy-unrecorded`, rather than attributed to the current model.
3. Embed the current qualitative context (price direction, owned asset names,
   and public event text), then run MongoDB `$vectorSearch` before each decision.
4. Supply retrieved narratives, provenance, and ranking components as USER data
   to the decision model. The model may use or reject a match based on context.
5. Validate that `memoryReferences` contains only supplied ids before execution.
6. Persist the engine outcome and embed an experience narrative for later use.

The narrative describes the decision rationale, strategy, actions, public event
types, fills/rejections, and immediate outcome. Raw price dictionaries and cash
balances remain ordinary records, not embedding inputs. Reasoning can mention
specific observations; this is contextual experience retrieval, not a price
forecasting vector database. Immediate execution is not long-term evidence that
a strategy succeeded. There is no extra LLM consolidation call per trade.

## Indexing, isolation, and ranking

Vectors live in `experience_vectors_<space-hash>`, separate from full experience
records. The hash includes embedding model, dimension count, and narrative
version (`experience-v1`). Changing any of these creates a separate collection
and index; incompatible spaces are never compared. Each document retains the
source experience id, agent id, run id, tick, embedding model, and decision model.

The cosine index `experience_similarity` contains the vector and filter fields.
Ownership (`agentId`), active status, embedding model, and narrative version are
pre-filters inside `$vectorSearch`. In the current simulation, only earlier ticks
are eligible. Earlier runs can also contribute experiences for that same agent.
Agent identity must be stable to retain private history across runs; the demo
uses the archetype name as the id. Independent agents sharing an archetype should
use distinct ids to avoid intentionally sharing the same history.

Search considers 400 ANN candidates and returns up to 20 matches for contextual
ranking. The final five are ranked by:

`rankingScore = similarity * contextualRelevance * temporalRelevance`

- Context: `0.25 + 0.5` for any symbol overlap, plus `0.25` for any event-type overlap.
- Time: `1 / (1 + tickAge / 100)` within the same run; `0.5` across runs because
  their tick clocks are not comparable. Cross-run age is unknown, not inferred.

Scores are heuristics, not probabilities or measured reliability. Retrieved
records expose the components separately. Active/invalidated status is supported
in storage and filtering, but automated contradiction detection, lifecycle audit,
and semantic lesson consolidation are not implemented here. Similarity alone
does not establish that an experience remains valid.

## Consistency and failures

Atlas indexes asynchronously. A freshly saved experience may not be returned
immediately. This flow does not substitute client-side similarity search or
recent-record lookup when Vector Search fails. Empty valid results are allowed;
embedding, indexing, or retrieval failures stop the run before model execution
where possible.

Execution and memory writes remain separate operations. If persistence or an
embedding call fails after execution, the runner stops; a retry must not blindly
replay orders. The full experience is persisted before its vector, so a later
run can backfill a missing embedding without repeating the trade. No production
experience records are deleted or overwritten during backfill.
