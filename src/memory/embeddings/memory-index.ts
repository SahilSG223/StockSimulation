import { embedMemoryContent } from "./embed-memory.js";
import { rankWithEmbeddings, type RetrievalContext } from "./rank-with-embeddings.js";
import type { EmbeddedMemory, Embedder } from "./types.js";

export type UpsertMemoryInput = {
  id?: string;
  agentId: string;
  content: string;
  reliability?: number;
  updatedAtTick: number;
  status?: EmbeddedMemory["status"];
  scope?: EmbeddedMemory["scope"];
  /** If omitted, embedder is called. */
  embedding?: number[];
};

/**
 * In-memory vector index for semantic memories.
 * Swap for Atlas Vector Search once the mongo PR lands — same call shape.
 */
export class MemoryIndex {
  private readonly byId = new Map<string, EmbeddedMemory>();

  constructor(private readonly embedder: Embedder) {}

  async upsert(input: UpsertMemoryInput): Promise<EmbeddedMemory> {
    const id = input.id ?? crypto.randomUUID();
    const embedding =
      input.embedding ?? (await embedMemoryContent(this.embedder, input.content)).embedding;

    const record: EmbeddedMemory = {
      id,
      agentId: input.agentId,
      content: input.content,
      embedding,
      status: input.status ?? "active",
      reliability: input.reliability ?? 0.7,
      updatedAtTick: input.updatedAtTick,
      scope: input.scope ?? {
        sectors: [],
        regimes: [],
        eventTypes: [],
        assets: [],
      },
    };
    this.byId.set(id, record);
    return record;
  }

  get(id: string): EmbeddedMemory | undefined {
    return this.byId.get(id);
  }

  /** Invalidate in-place; keeps vector for audit but drops from retrieval. */
  invalidate(agentId: string, id: string): EmbeddedMemory | undefined {
    const m = this.byId.get(id);
    if (!m || m.agentId !== agentId) return undefined;
    const next = { ...m, status: "invalidated" as const };
    this.byId.set(id, next);
    return next;
  }

  async search(args: {
    agentId: string;
    query: string;
    ctx: Omit<RetrievalContext, "agentId">;
    limit?: number;
  }): Promise<ReturnType<typeof rankWithEmbeddings>> {
    const queryEmbedding = await this.embedder.embed(args.query);
    const ranked = rankWithEmbeddings({
      memories: [...this.byId.values()],
      queryEmbedding,
      ctx: { ...args.ctx, agentId: args.agentId },
    });
    const limit = args.limit ?? 5;
    return ranked.slice(0, limit);
  }

  size(): number {
    return this.byId.size;
  }
}
