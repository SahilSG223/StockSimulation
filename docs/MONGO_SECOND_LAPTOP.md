# Second laptop: Mongo memory repos

**You own this PR:** `feat/memory-mongo`  
**Do not edit:** `src/memory/governance/**`, `src/memory/embeddings/**` (other PRs)

Cursor on the other machine is doing **OpenAI embeddings**. You do **Atlas persistence**.

## Goal

Replace the in-memory `ExperienceStore` with a Mongo-backed store that keeps the
**same call surface**, and add a `MemoryRepository` for semantic memories.
Every read **must** filter by `agentId` in the query.

## Env (already on your machine)

```bash
# .env (gitignored)
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=stockSimulation   # use whatever you created; keep consistent
OPENAI_API_KEY=...                # embeddings PR uses this; you don't need it for repos
```

## Packages to add

```bash
pnpm add mongodb
pnpm add -D @types/node   # already present
```

## Files to implement (stubs are in this PR)

| File | Job |
|------|-----|
| `src/database/collections.ts` | Collection name constants |
| `src/database/client.ts` | `getDb()` from `MONGODB_URI` + db name |
| `src/memory/experiences/mongo-store.ts` | Mongo `ExperienceStore`-compatible API |
| `src/memory/memories/mongo-memory-repository.ts` | CRUD for semantic memories + agentId filter |
| `src/database/indexes.ts` | Ensure indexes (run once from a small script) |

## Required indexes

```js
// experiences
{ agentId: 1, simulationId: 1, tick: 1 }

// memories
{ agentId: 1, status: 1 }
{ agentId: 1, "scope.sectors": 1 }
{ agentId: 1, "scope.regimes": 1 }
```

Vector Search index on `memories.embedding` is **embeddings PR / Atlas UI** —
coordinate dims with `text-embedding-3-small` (1536).

## Acceptance

- [ ] `getDb()` connects with your `.env`
- [ ] Writing an experience then `listForAgent(otherId)` returns `[]`
- [ ] `query({ agentId, ... })` always requires `agentId`
- [ ] Unit tests with mongodb-memory-server **or** a skipped live test behind `RUN_MONGO_TESTS=1`
- [ ] `make precommit` green
- [ ] No secrets in git

## Out of scope

- Embedding API calls
- Ranking / contradiction (governance PR #2)
- Frontend

## Sync

```bash
git fetch origin
git checkout feat/memory-mongo
git pull
# work, commit, push
gh pr create --base main --head feat/memory-mongo   # if not open yet
```

When both this and the embeddings PR are up, merge order: **mongo or embeddings first** (either), then wire them in a small follow-up on governance.
