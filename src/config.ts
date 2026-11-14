/**
 * Runtime config from env. Defaults lock the hackathon models.
 * Never log secret values.
 */

import { loadEnvFile } from "./config/load-env.js";

loadEnvFile();

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

/** Agent LLM — OpenAI chat model id. */
export function getAgentModel(): string {
  return optional("AGENT_MODEL", "gpt-4o");
}

/** Embedding model for semantic memory. */
export function getEmbeddingModel(): string {
  return optional("EMBEDDING_MODEL", "text-embedding-3-small");
}

export function getMongoDbName(): string {
  return optional("MONGODB_DB_NAME", "stock_simulation");
}

export function getOpenAIApiKey(): string {
  return required("OPENAI_API_KEY");
}

export function getMongoUri(): string {
  return required("MONGODB_URI");
}

/** Safe summary for logs / startup checks — no secrets. */
export function modelConfigSummary(): {
  agentModel: string;
  embeddingModel: string;
  openaiKeyPresent: boolean;
  mongoUriPresent: boolean;
  mongoDb: string;
} {
  return {
    agentModel: getAgentModel(),
    embeddingModel: getEmbeddingModel(),
    openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
    mongoUriPresent: Boolean(process.env.MONGODB_URI?.trim()),
    mongoDb: getMongoDbName(),
  };
}
