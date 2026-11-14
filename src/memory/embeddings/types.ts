export type Embedder = {
  readonly model: string;
  /** Dimensions for this model (text-embedding-3-small → 1536). */
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: readonly string[]): Promise<number[][]>;
};

export type EmbeddedMemory = {
  id: string;
  agentId: string;
  content: string;
  embedding: number[];
  status: "active" | "invalidated" | "superseded" | "under_review" | "expired";
  reliability: number;
  updatedAtTick: number;
  scope: {
    sectors: string[];
    regimes: string[];
    eventTypes: string[];
    assets: string[];
  };
};
